const db = require('../config/database');
const logger = require('../config/logger');

// Si tienes modelos adicionales, también impórtalos
const MovimientoStock = require('../models/MovimientoStock');
const OrdenTransferencia = require('../models/OrdenTransferencia');

class TransferenciasController {
    

    constructor() {
        // Bind de los métodos que necesitan mantener el contexto
        this.getDetallesOrdenData = this.getDetallesOrdenData.bind(this);
        this.show = this.show.bind(this);
        this.getDetallesOrden = this.getDetallesOrden.bind(this);
    }
    // =============================================
    // FUNCIONES EXISTENTES - MEJORADAS
    // =============================================
    
    // MIGRACIÓN: getOrdenes() -> index() más completo
    async index(req, res) {
        try {
            const { 
                estado, 
                deposito_origen_id, 
                deposito_destino_id, 
                fecha_desde, 
                fecha_hasta,
                page = 1,
                limit = 50
            } = req.query;

            let whereConditions = ['1=1'];
            let queryParams = [];

            // Filtros mejorados (mantiene compatibilidad)
            if (estado) {
                whereConditions.push('ot.estado = ?');
                queryParams.push(estado);
            }

            if (deposito_origen_id) {
                whereConditions.push('ot.deposito_origen_id = ?');
                queryParams.push(deposito_origen_id);
            }

            if (deposito_destino_id) {
                whereConditions.push('ot.deposito_destino_id = ?');
                queryParams.push(deposito_destino_id);
            }

            if (fecha_desde) {
                whereConditions.push('DATE(ot.fecha_orden) >= ?');
                queryParams.push(fecha_desde);
            }

            if (fecha_hasta) {
                whereConditions.push('DATE(ot.fecha_orden) <= ?');
                queryParams.push(fecha_hasta);
            }

            const whereClause = whereConditions.join(' AND ');
            const offset = (page - 1) * limit;

            // Query mejorada (compatible con esquema existente)
            const sql = `
                SELECT 
    ot.*,
    do.nombre as deposito_origen_nombre,
    do.tipo as deposito_origen_tipo,
    dd.nombre as deposito_destino_nombre,
    dd.tipo as deposito_destino_tipo,
    COUNT(dot.id) as total_items,
    SUM(dot.cantidad_solicitada) as cantidad_total_solicitada,
    SUM(dot.cantidad_enviada) as cantidad_total_enviada,
    
    CASE 
        WHEN SUM(dot.cantidad_solicitada) > 0 THEN 
            ROUND(
                (SUM(dot.cantidad_enviada) / SUM(dot.cantidad_solicitada)) * 100, 
                2
            )
        ELSE 0 
    END as progreso,
    
    -- Compatibilidad con entidades existentes
    CASE 
        WHEN dd.tipo = 'VENDEDOR' THEN v.razonSocial
        WHEN dd.tipo = 'CLIENTE' THEN c.razonSocial
        ELSE dd.nombre
    END as entidad_destino_nombre

FROM ordenes_transferencia ot
INNER JOIN depositos do ON ot.deposito_origen_id = do.id
INNER JOIN depositos dd ON ot.deposito_destino_id = dd.id
LEFT JOIN detalle_ordenes_transferencia dot ON ot.id = dot.orden_id
LEFT JOIN vendedores v ON dd.tipo = 'VENDEDOR' AND dd.entity_id = v.vendedorId
LEFT JOIN clientes c ON dd.tipo = 'CLIENTE' AND dd.entity_id = c.clienteId
WHERE ${whereClause}
GROUP BY ot.id, do.nombre, do.tipo, dd.nombre, dd.tipo, v.razonSocial, c.razonSocial
ORDER BY ot.fecha_orden DESC
LIMIT ? OFFSET ?
            `;

            queryParams.push(parseInt(limit), parseInt(offset));
            const transferencias = await db.query(sql, queryParams);

            res.json({
                success: true,
                data: transferencias,
                pagination: {
                    current_page: parseInt(page),
                    per_page: parseInt(limit),
                    total: transferencias.length
                }
            });

        } catch (error) {
            logger.error('Error en index transferencias:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener órdenes de transferencia',
                error: error.message
            });
        }
    }

    // MANTENER: Función existente para compatibilidad
    async getOrdenes(req, res) {
        // Delegar a la nueva función index para no duplicar código
        return this.index(req, res);
    }


async enviar(req, res) {
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();

        const { detalle_id, cantidad_enviada, numero_documento, observaciones } = req.body;

        // Validaciones existentes...
        if (!detalle_id || !cantidad_enviada || isNaN(parseFloat(cantidad_enviada)) || parseFloat(cantidad_enviada) <= 0) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: 'detalle_id y cantidad_enviada son obligatorios y válidos'
            });
        }

        const cantidadEnviadaNum = parseFloat(cantidad_enviada);

        // Obtener datos del detalle
        const [detalleRows] = await connection.query(`
            SELECT 
                dot.*, 
                ot.numero_orden, 
                ot.deposito_origen_id, 
                ot.deposito_destino_id,
                ot.estado as orden_estado,
                m.descripcion as mercaderia_descripcion
            FROM detalle_ordenes_transferencia dot
            JOIN ordenes_transferencia ot ON dot.orden_id = ot.id
            JOIN mercaderias m ON dot.mercaderia_id = m.id
            WHERE dot.id = ?
        `, [detalle_id]);

        if (!detalleRows || detalleRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: 'Detalle de transferencia no encontrado'
            });
        }

        const detalleData = detalleRows[0];

        // Conversiones seguras
        const cantidadEnviadaActual = parseFloat(detalleData.cantidad_enviada) || 0;
        const cantidadSolicitada = parseFloat(detalleData.cantidad_solicitada) || 0;
        const nuevaCantidadEnviada = cantidadEnviadaActual + cantidadEnviadaNum;

        // Validaciones
        if (nuevaCantidadEnviada > cantidadSolicitada) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: `No se puede enviar ${nuevaCantidadEnviada}. Máximo permitido: ${cantidadSolicitada}`
            });
        }

        // Verificar stock disponible
        const [stockRows] = await connection.query(`
            SELECT cantidad FROM stock_depositos 
            WHERE mercaderia_id = ? AND deposito_id = ?
        `, [detalleData.mercaderia_id, detalleData.deposito_origen_id]);

        if (!stockRows || stockRows.length === 0 || (parseFloat(stockRows[0].cantidad) || 0) < cantidadEnviadaNum) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: 'Stock insuficiente en depósito origen'
            });
        }

        // ✅ CALCULAR ESTADO DEL DETALLE INDIVIDUAL
        let estadoDetalle = 'PENDIENTE';
        if (nuevaCantidadEnviada >= cantidadSolicitada) {
            estadoDetalle = 'COMPLETADO';
        } else if (nuevaCantidadEnviada > 0) {
            estadoDetalle = 'PARCIAL';
        }

        console.log('📊 Estado del detalle:', {
            detalle_id: detalle_id,
            cantidad_solicitada: cantidadSolicitada,
            cantidad_enviada_anterior: cantidadEnviadaActual,
            cantidad_a_enviar: cantidadEnviadaNum,
            nueva_cantidad_enviada: nuevaCantidadEnviada,
            estado_anterior: detalleData.estado,
            nuevo_estado: estadoDetalle
        });

        // ✅ ACTUALIZAR DETALLE con cantidad Y estado
        await connection.query(`
            UPDATE detalle_ordenes_transferencia 
            SET cantidad_enviada = ?, estado = ?
            WHERE id = ?
        `, [nuevaCantidadEnviada, estadoDetalle, detalle_id]);

        // Registrar movimiento de stock
        await connection.query(`
            INSERT INTO movimientos_stock (
                tipo_movimiento, mercaderia_id, deposito_origen_id, deposito_destino_id, 
                cantidad, motivo, numero_documento, usuario_id, observaciones
            ) VALUES (
                'TRANSFERENCIA', ?, ?, ?, ?, ?, ?, ?, ?
            )
        `, [
            detalleData.mercaderia_id,
            detalleData.deposito_origen_id,
            detalleData.deposito_destino_id,
            cantidadEnviadaNum,
            `Transferencia según orden ${detalleData.numero_orden}`,
            numero_documento || `ENV-${Date.now()}`,
            req.user?.id || 1,
            observaciones || null
        ]);

        // ✅ ACTUALIZAR ESTADO DE LA ORDEN (basado en todos los detalles)
        const [todosLosDetalles] = await connection.query(`
            SELECT id, cantidad_solicitada, cantidad_enviada, estado
            FROM detalle_ordenes_transferencia 
            WHERE orden_id = ?
        `, [detalleData.orden_id]);

        // Calcular estado de la orden considerando el detalle que acabamos de actualizar
        const detallesActualizados = todosLosDetalles.map(d => {
            if (d.id === parseInt(detalle_id)) {
                return {
                    ...d,
                    cantidad_enviada: nuevaCantidadEnviada,
                    estado: estadoDetalle
                };
            }
            return d;
        });

        const totalItems = detallesActualizados.length;
        const itemsCompletados = detallesActualizados.filter(d => d.estado === 'COMPLETADO').length;
        const itemsConEnvios = detallesActualizados.filter(d => 
            d.estado === 'PARCIAL' || d.estado === 'COMPLETADO'
        ).length;

        let estadoOrden = 'PENDIENTE';
        if (itemsCompletados === totalItems) {
            estadoOrden = 'COMPLETADA';
        } else if (itemsConEnvios > 0) {
            estadoOrden = 'PARCIAL';
        }

        console.log('📋 Estado de la orden:', {
            orden_id: detalleData.orden_id,
            total_items: totalItems,
            items_completados: itemsCompletados,
            items_con_envios: itemsConEnvios,
            estado_anterior: detalleData.orden_estado,
            nuevo_estado: estadoOrden
        });

        // Actualizar estado de la orden
        const fechaCompleta = estadoOrden === 'COMPLETADA' ? 'NOW()' : 'NULL';
        await connection.query(`
            UPDATE ordenes_transferencia 
            SET estado = ?, fecha_completada = ${fechaCompleta}
            WHERE id = ?
        `, [estadoOrden, detalleData.orden_id]);

        await connection.commit();

        res.json({
            success: true,
            message: 'Mercadería enviada exitosamente',
            datos: {
                detalle_id: detalle_id,
                cantidad_enviada: cantidadEnviadaNum,
                cantidad_total_enviada: nuevaCantidadEnviada,
                cantidad_pendiente: cantidadSolicitada - nuevaCantidadEnviada,
                estado_detalle: estadoDetalle,
                estado_orden: estadoOrden,
                numero_orden: detalleData.numero_orden
            }
        });

    } catch (error) {
        await connection.rollback();
        logger.error('Error en enviarMercaderia:', error);
        res.status(500).json({
            success: false,
            message: 'Error al enviar mercadería',
            error: error.message
        });
    } finally {
        connection.release();
    }
}

    // MANTENER: Función existente para compatibilidad
    async enviarMercaderia(req, res) {
        // Delegar a la nueva función enviar
        return this.enviar(req, res);
    }

    // MIGRACIÓN: cancelarOrden() -> cancelar() más completo
    async cancelar(req, res) {
        const { id } = req.params;
        const { 
            motivo_cancelacion = 'Cancelado por usuario',
            reversar_envios = true 
        } = req.body;

        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            // Verificar orden (compatible con código existente)
            const [orden] = await connection.query(
                'SELECT * FROM ordenes_transferencia WHERE id = ?',
                [id]
            );

            if (!orden.length) {
                await connection.rollback();
                return res.status(404).json({
                    success: false,
                    message: 'Orden de transferencia no encontrada'
                });
            }

            if (['COMPLETADA', 'CANCELADA'].includes(orden[0].estado)) {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    message: `No se puede cancelar una orden ${orden[0].estado.toLowerCase()}`
                });
            }

            // MEJORA: Opción de reversar envíos (nueva funcionalidad)
            if (reversar_envios) {
                const [detallesEnviados] = await connection.query(
                    'SELECT * FROM detalle_ordenes_transferencia WHERE orden_id = ? AND cantidad_enviada > 0',
                    [id]
                );

                for (const detalle of detallesEnviados) {
                    // Registrar devolución
                    if (MovimientoStock && MovimientoStock.registrarMovimiento) {
                        await MovimientoStock.registrarMovimiento({
                            tipo_movimiento: 'DEVOLUCION',
                            mercaderia_id: detalle.mercaderia_id,
                            deposito_origen_id: orden[0].deposito_destino_id,
                            deposito_destino_id: orden[0].deposito_origen_id,
                            cantidad: detalle.cantidad_enviada,
                            motivo: `Cancelación de orden ${orden[0].numero_orden}`,
                            observaciones: motivo_cancelacion,
                            usuario_id: req.user?.id || 1
                        });
                    }
                }
            }

            // Cancelar orden (mejorado del código existente)
            await connection.query(`
                UPDATE ordenes_transferencia 
                SET estado = 'CANCELADA', 
                    observaciones = CONCAT(COALESCE(observaciones, ''), '\\n--- CANCELADA ---\\n', ?)
                WHERE id = ?
            `, [motivo_cancelacion, id]);

            await connection.commit();

            res.json({
                success: true,
                message: 'Orden de transferencia cancelada exitosamente',
                data: {
                    id,
                    estado: 'CANCELADA',
                    envios_revertidos: reversar_envios
                }
            });

        } catch (error) {
            await connection.rollback();
            logger.error('Error en cancelar transferencia:', error);
            res.status(500).json({
                success: false,
                message: 'Error al cancelar orden de transferencia',
                error: error.message
            });
        } finally {
            connection.release();
        }
    }

    // MANTENER: Función existente para compatibilidad
    async cancelarOrden(req, res) {
        // Delegar a la nueva función cancelar
        return this.cancelar(req, res);
    }

    // =============================================
    // FUNCIONES NUEVAS - AGREGAN FUNCIONALIDAD
    // =============================================

    // NUEVA: Obtener orden completa con detalles
    async show(req, res) {
    try {
        const { id } = req.params;

        if (!id || isNaN(id)) {
            return res.status(400).json({
                success: false,
                message: 'ID de orden inválido'
            });
        }

        // Obtener orden con JOIN para nombres de depósitos
        const orden = await db.query(`
            SELECT 
                ot.*,
                do.nombre as deposito_origen_nombre,
                dd.nombre as deposito_destino_nombre,
                CASE 
                    WHEN dd.tipo = 'VENDEDOR' THEN v.razonSocial
                    WHEN dd.tipo = 'CLIENTE' THEN c.razonSocial
                    ELSE dd.nombre
                END as entidad_destino_nombre
            FROM ordenes_transferencia ot
            INNER JOIN depositos do ON ot.deposito_origen_id = do.id
            INNER JOIN depositos dd ON ot.deposito_destino_id = dd.id
            LEFT JOIN vendedores v ON dd.tipo = 'VENDEDOR' AND dd.entity_id = v.vendedorId
            LEFT JOIN clientes c ON dd.tipo = 'CLIENTE' AND dd.entity_id = c.clienteId
            WHERE ot.id = ?
        `, [id]);

        if (!orden || orden.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Orden de transferencia no encontrada'
            });
        }

        // Obtener detalles usando función existente
        const detalles = await this.getDetallesOrdenData(id);

        // Calcular resumen
        const resumen = {
            total_items: detalles.length,
            cantidad_total_solicitada: detalles.reduce((sum, d) => sum + (d.cantidad_solicitada || 0), 0),
            cantidad_total_enviada: detalles.reduce((sum, d) => sum + (d.cantidad_enviada || 0), 0)
        };

        // Estructurar respuesta consistente
        const ordenData = {
            ...orden[0], // Propiedades de la orden
            // Asegurar que todas las propiedades necesarias existan
            numero_orden: orden[0].numero_orden || `ORD-${orden[0].id}`,
            estado: orden[0].estado || 'PENDIENTE',
            fecha_orden: orden[0].fecha_orden || new Date(),
            deposito_origen_nombre: orden[0].deposito_origen_nombre || 'No especificado',
            deposito_destino_nombre: orden[0].deposito_destino_nombre || 'No especificado'
        };

        res.json({
            success: true,
            data: {
                orden: ordenData, // Retorna el objeto directamente, no el array
                detalles: detalles,
                resumen: resumen
            },
            message: 'Orden obtenida correctamente'
        });

    } catch (error) {
        logger.error('Error en show transferencia:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener orden de transferencia',
            error: error.message
        });
    }
}
    // NUEVA: Crear orden de transferencia
    async create(req, res) {
        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            const {
                deposito_origen_id,
                deposito_destino_id,
                observaciones = '',
                items = []
            } = req.body;

            // Validaciones básicas
            if (!deposito_origen_id || !deposito_destino_id || !items.length) {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Faltan datos requeridos'
                });
            }

            // Verificar stock para cada item
            for (const item of items) {
                const [stock] = await connection.query(
                    'SELECT cantidad FROM stock_depositos WHERE mercaderia_id = ? AND deposito_id = ?',
                    [item.mercaderia_id, deposito_origen_id]
                );

                if (!stock.length || stock[0].cantidad < item.cantidad_solicitada) {
                    await connection.rollback();
                    return res.status(400).json({
                        success: false,
                        message: `Stock insuficiente para mercadería ID ${item.mercaderia_id}`
                    });
                }
            }

            // USAR modelo existente si está disponible
            let ordenId;
            if (OrdenTransferencia && OrdenTransferencia.crearOrdenCompleta) {
                ordenId = await OrdenTransferencia.crearOrdenCompleta({
                    deposito_origen_id,
                    deposito_destino_id,
                    usuario_id: req.user?.id || 1,
                    observaciones
                }, items);
            } else {
                // Fallback: crear manualmente
                const numeroOrden = `ORD-${Date.now()}`;
                const [result] = await connection.query(`
                    INSERT INTO ordenes_transferencia 
                    (numero_orden, deposito_origen_id, deposito_destino_id, estado, observaciones, usuario_id)
                    VALUES (?, ?, ?, 'PENDIENTE', ?, ?)
                `, [numeroOrden, deposito_origen_id, deposito_destino_id, observaciones, req.user?.id || 1]);

                ordenId = result.insertId;

                // Crear detalles
                for (const item of items) {
                    await connection.query(`
                        INSERT INTO detalle_ordenes_transferencia 
                        (orden_id, mercaderia_id, cantidad_solicitada, cantidad_enviada)
                        VALUES (?, ?, ?, 0)
                    `, [ordenId, item.mercaderia_id, item.cantidad_solicitada]);
                }
            }

            await connection.commit();

            res.status(201).json({
                success: true,
                message: 'Orden de transferencia creada exitosamente',
                data: { id: ordenId }
            });

        } catch (error) {
            await connection.rollback();
            logger.error('Error en create transferencia:', error);
            res.status(500).json({
                success: false,
                message: 'Error al crear orden de transferencia',
                error: error.message
            });
        } finally {
            connection.release();
        }
    }

    // NUEVA: Actualizar orden
    async update(req, res) {
        // Implementación básica - puede extenderse según necesidades
        const { id } = req.params;
        const { observaciones } = req.body;

        try {
            await db.query(
                'UPDATE ordenes_transferencia SET observaciones = ? WHERE id = ?',
                [observaciones, id]
            );

            res.json({
                success: true,
                message: 'Orden actualizada exitosamente'
            });

        } catch (error) {
            logger.error('Error en update transferencia:', error);
            res.status(500).json({
                success: false,
                message: 'Error al actualizar orden',
                error: error.message
            });
        }
    }

    // =============================================
    // FUNCIONES AUXILIARES Y DE COMPATIBILIDAD
    // =============================================

    // MANTENER: Funciones específicas existentes
    async getDetallesOrden(req, res) {
        try {
            const { id } = req.params;
            const detalles = await this.getDetallesOrdenData(id);

            res.json({
                success: true,
                data: detalles
            });

        } catch (error) {
            logger.error('Error en getDetallesOrden:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener detalles de la orden',
                error: error.message
            });
        }
    }

    // Función auxiliar para obtener detalles (reutilizable)
    async getDetallesOrdenData(ordenId) {
    try {
        const detalles = await db.query(`
            SELECT 
                dot.*,
                m.descripcion as mercaderia_descripcion,
                m.codigo_sku,
                m.unidad_medida,
                (dot.cantidad_solicitada - dot.cantidad_enviada) as cantidad_pendiente
            FROM detalle_ordenes_transferencia dot
            LEFT JOIN mercaderias m ON dot.mercaderia_id = m.id
            WHERE dot.orden_id = ?
            ORDER BY dot.id
        `, [ordenId]);

        return detalles || [];
    } catch (error) {
        logger.error('Error obteniendo detalles de orden:', error);
        return [];
    }
}

    // MANTENER: Funciones específicas para vendedores y clientes
    async getOrdenesPendientesVendedor(req, res) {
        try {
            const { vendedorId } = req.params;

            const sql = `
                SELECT 
                    o.*,
                    do.nombre as deposito_origen_nombre,
                    dd.nombre as deposito_destino_nombre,
                    COUNT(d.id) as total_items,
                    SUM(d.cantidad_solicitada) as cantidad_total_solicitada,
                    SUM(d.cantidad_enviada) as cantidad_total_enviada
                FROM ordenes_transferencia o
                JOIN depositos do ON o.deposito_origen_id = do.id
                JOIN depositos dd ON o.deposito_destino_id = dd.id
                LEFT JOIN detalle_ordenes_transferencia d ON o.id = d.orden_id
                WHERE (
                    (do.tipo = 'CENTRAL' AND dd.tipo = 'VENDEDOR' AND dd.entity_id = ?) OR
                    (do.tipo = 'VENDEDOR' AND do.entity_id = ?)
                )
                AND o.estado IN ('PENDIENTE', 'PARCIAL')
                GROUP BY o.id
                ORDER BY o.fecha_orden DESC
            `;

            const ordenes = await db.query(sql, [vendedorId, vendedorId]);

            res.json({
                success: true,
                data: ordenes,
                total: ordenes.length
            });

        } catch (error) {
            logger.error('Error en getOrdenesPendientesVendedor:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener órdenes pendientes del vendedor',
                error: error.message
            });
        }
    }

    async getOrdenesPendientesCliente(req, res) {
        try {
            const { clienteId } = req.params;

            const sql = `
                SELECT 
                    o.*,
                    do.nombre as deposito_origen_nombre,
                    dd.nombre as deposito_destino_nombre,
                    COUNT(d.id) as total_items,
                    SUM(d.cantidad_solicitada) as cantidad_total_solicitada,
                    SUM(d.cantidad_enviada) as cantidad_total_enviada
                FROM ordenes_transferencia o
                JOIN depositos do ON o.deposito_origen_id = do.id
                JOIN depositos dd ON o.deposito_destino_id = dd.id
                LEFT JOIN detalle_ordenes_transferencia d ON o.id = d.orden_id
                WHERE dd.tipo = 'CLIENTE' 
                AND dd.entity_id = ?
                AND o.estado IN ('PENDIENTE', 'PARCIAL')
                GROUP BY o.id
                ORDER BY o.fecha_orden DESC
            `;

            const ordenes = await db.query(sql, [clienteId]);

            res.json({
                success: true,
                data: ordenes,
                total: ordenes.length
            });

        } catch (error) {
            logger.error('Error en getOrdenesPendientesCliente:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener órdenes pendientes del cliente',
                error: error.message
            });
        }
    }
}

module.exports = new TransferenciasController();