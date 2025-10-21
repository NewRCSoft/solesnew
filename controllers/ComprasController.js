// =============================================
// ComprasController.js - MODIFICADO con IVA y Fecha Vencimiento
// Actualizar tu ComprasController existente con estos cambios
// =============================================

const db = require('../config/database'); // Usar tu configuración existente
const logger = require('../config/logger'); // Usar tu logger existente

class ComprasController {
    
    // =============================================
    // 🆕 FUNCIÓN MODIFICADA: crearRecepcion
    // =============================================
    static async crearRecepcion(req, res) {
        const connection = await db.getConnection();
        
        try {
            await connection.beginTransaction();
            
            const {
                proveedor_id,
                fecha_recepcion,
                fecha_vencimiento_documento, // 🆕 NUEVO CAMPO
                items,
                orden_compra_id,
                numero_remito,
                numero_factura,
                observaciones
            } = req.body;
            
            // Generar número de recepción (mantener tu lógica existente)
            const numeroRecepcion = `REC-${Date.now()}`;
            
            // 🆕 CALCULAR TOTAL CON IVA
            let total = 0;
            for (const item of items) {
                const cantidad = item.cantidad_recibida;
                const precio = item.precio_unitario;
                const porcentajeIva = item.porcentaje_iva || 0;
                
                const precioConIva = precio + (precio * (porcentajeIva / 100));
                total += cantidad * precioConIva;
            }
            
            // 🆕 CREAR RECEPCIÓN CON FECHA DE VENCIMIENTO
            const [recepcionResult] = await connection.query(`
                INSERT INTO recepciones_mercaderia (
                    numero_recepcion, proveedor_id, fecha_recepcion,
                    fecha_vencimiento_documento, numero_remito, numero_factura, 
                    total, observaciones, usuario_id, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
            `, [
                numeroRecepcion, 
                proveedor_id, 
                fecha_recepcion,
                fecha_vencimiento_documento || null, // 🆕 NUEVO CAMPO
                numero_remito || null, 
                numero_factura || null, 
                total, 
                observaciones || null,
                req.user?.id || 1 // Usuario autenticado
            ]);
            
            const recepcionId = recepcionResult.insertId;
            
            // Obtener depósito central (mantener tu lógica existente)
            const [depositoCentral] = await connection.query(`
                SELECT id FROM depositos WHERE tipo = 'CENTRAL' AND activo = 1 LIMIT 1
            `);
            
            if (!depositoCentral || depositoCentral.length === 0) {
                throw new Error('No se encontró depósito central configurado');
            }
            
            const depositoCentralId = depositoCentral[0].id;
            
            // 🆕 CREAR DETALLES CON IVA
            const detallesCreados = [];
            let subtotalSinIva = 0;
            let totalIvaGeneral = 0;
            
            for (const item of items) {
                const {
                    mercaderia_id,
                    cantidad_recibida,
                    precio_unitario,
                    porcentaje_iva = 0, // 🆕 Default 0%
                    numero_lote,
                    fecha_vencimiento,
                    observaciones: obsItem
                } = item;
                
                // 🆕 CALCULAR VALORES DE IVA
                const ivaUnitario = precio_unitario * (porcentaje_iva / 100);
                const precioConIva = precio_unitario + ivaUnitario;
                const subtotalItem = cantidad_recibida * precio_unitario;
                const ivaItem = cantidad_recibida * ivaUnitario;
                
                subtotalSinIva += subtotalItem;
                totalIvaGeneral += ivaItem;
                
                // 🆕 INSERTAR DETALLE CON CAMPOS DE IVA
                const [detalleResult] = await connection.query(`
                    INSERT INTO detalle_recepciones (
                        recepcion_id, mercaderia_id, cantidad_recibida, 
                        precio_unitario, porcentaje_iva, iva_unitario, precio_con_iva,
                        numero_lote, fecha_vencimiento, observaciones,
                        created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
                `, [
                    recepcionId,
                    mercaderia_id,
                    cantidad_recibida,
                    precio_unitario,
                    porcentaje_iva, // 🆕 NUEVO
                    ivaUnitario, // 🆕 CALCULADO
                    precioConIva, // 🆕 CALCULADO
                    numero_lote || null,
                    fecha_vencimiento || null,
                    obsItem || null
                ]);
                
                detallesCreados.push({
                    id: detalleResult.insertId,
                    mercaderia_id,
                    cantidad_recibida,
                    precio_unitario,
                    porcentaje_iva,
                    iva_unitario: parseFloat(ivaUnitario.toFixed(2)),
                    precio_con_iva: parseFloat(precioConIva.toFixed(2)),
                    subtotal_sin_iva: parseFloat(subtotalItem.toFixed(2)),
                    iva_total: parseFloat(ivaItem.toFixed(2))
                });
                
                // 🚀 MANTENER TU LÓGICA EXISTENTE DE STOCK
                // Crear/actualizar lote si tiene información de lote
                let loteId = null;
                if (numero_lote) {
                    try {
                        const [loteResult] = await connection.query(`
                            INSERT INTO lotes_mercaderia (
                                mercaderia_id, numero_lote, cantidad_inicial, cantidad_actual,
                                fecha_vencimiento, precio_costo, proveedor_id,
                                created_at, updated_at
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
                        `, [
                            mercaderia_id, 
                            numero_lote, 
                            cantidad_recibida,
                            cantidad_recibida, 
                            fecha_vencimiento, 
                            precio_unitario,
                            proveedor_id
                        ]);
                        loteId = loteResult.insertId;
                        
                        // Actualizar stock en depósito por lote
                        await connection.query(`
                            INSERT INTO stock_lotes_depositos (lote_id, deposito_id, cantidad)
                            VALUES (?, ?, ?)
                            ON DUPLICATE KEY UPDATE cantidad = cantidad + VALUES(cantidad)
                        `, [loteId, depositoCentralId, cantidad_recibida]);
                    } catch (loteError) {
                        console.log('Warning: No se pudo crear lote:', loteError.message);
                    }
                }
                
                // Actualizar stock general en depósito
                await connection.query(`
                    INSERT INTO stock_depositos (mercaderia_id, deposito_id, cantidad)
                    VALUES (?, ?, ?)
                    ON DUPLICATE KEY UPDATE cantidad = cantidad + VALUES(cantidad)
                `, [mercaderia_id, depositoCentralId, cantidad_recibida]);
                
                // Registrar movimiento de stock (mantener tu lógica)
                await connection.query(`
                    INSERT INTO movimientos_stock (
                        tipo_movimiento, mercaderia_id, deposito_destino_id, cantidad,
                        precio_unitario, precio_costo, motivo, numero_documento,
                        recepcion_id, lote_id, numero_lote, fecha_vencimiento,
                        usuario_id, created_at
                    ) VALUES (
                        'COMPRA', ?, ?, ?, ?, ?, 'Recepción de mercadería', ?,
                        ?, ?, ?, ?, ?, NOW()
                    )
                `, [
                    mercaderia_id, 
                    depositoCentralId, 
                    cantidad_recibida,
                    precio_unitario, 
                    precioConIva, // 🆕 Usar precio con IVA como costo
                    numeroRecepcion,
                    recepcionId, 
                    loteId, 
                    numero_lote, 
                    fecha_vencimiento, 
                    req.user?.id || 1
                ]);
                
                // Si viene de una orden de compra, actualizar cantidades recibidas
                if (orden_compra_id && item.detalle_orden_id) {
                    await connection.query(`
                        UPDATE detalle_ordenes_compra 
                        SET cantidad_recibida = cantidad_recibida + ?
                        WHERE id = ?
                    `, [cantidad_recibida, item.detalle_orden_id]);
                }
            }
            
            // Si es de una orden de compra, verificar si está completa
            if (orden_compra_id) {
                const [estadoOrden] = await connection.query(`
                    SELECT 
                        COUNT(*) as total_items,
                        SUM(CASE WHEN cantidad_recibida >= cantidad_solicitada THEN 1 ELSE 0 END) as items_completos
                    FROM detalle_ordenes_compra 
                    WHERE orden_compra_id = ?
                `, [orden_compra_id]);
                
                let nuevoEstado = 'PARCIAL';
                if (estadoOrden[0].items_completos === estadoOrden[0].total_items) {
                    nuevoEstado = 'RECIBIDA';
                }
                
                await connection.query(`
                    UPDATE ordenes_compra SET estado = ?, updated_at = NOW() 
                    WHERE id = ?
                `, [nuevoEstado, orden_compra_id]);
            }
            
            await connection.commit();
            
            // 🆕 RESPUESTA CON INFORMACIÓN DE IVA
            const totales = {
                subtotal_sin_iva: parseFloat(subtotalSinIva.toFixed(2)),
                total_iva: parseFloat(totalIvaGeneral.toFixed(2)),
                total_con_iva: parseFloat((subtotalSinIva + totalIvaGeneral).toFixed(2)),
                cantidad_items: detallesCreados.length
            };
            
            logger.info('Recepción creada con IVA', {
                recepcion_id: recepcionId,
                numero_recepcion: numeroRecepcion,
                proveedor_id,
                fecha_vencimiento_documento,
                totales,
                usuario_id: req.user?.id
            });
            
            res.json({
                success: true,
                data: {
                    id: recepcionId,
                    numero_recepcion: numeroRecepcion,
                    fecha_vencimiento_documento,
                    totales,
                    detalles: detallesCreados
                },
                message: 'Recepción de mercadería creada exitosamente con IVA detallado'
            });
            
        } catch (error) {
            await connection.rollback();
            logger.error('Error creando recepción:', error);
            
            res.status(500).json({
                success: false,
                message: 'Error al crear recepción de mercadería',
                error: error.message
            });
        } finally {
            connection.release();
        }
    }
    
    // =============================================
    // 🆕 NUEVA FUNCIÓN: Obtener recepciones con información de IVA y vencimientos
    // =============================================
    static async getRecepcionesConIva(req, res) {
        try {
            const {
                page = 1,
                limit = 10,
                proveedor_id,
                fecha_desde,
                fecha_hasta,
                estado_vencimiento,
                porcentaje_iva
            } = req.query;
            
            let whereClause = 'WHERE 1=1';
            let params = [];
            
            if (proveedor_id) {
                whereClause += ' AND rm.proveedor_id = ?';
                params.push(proveedor_id);
            }
            
            if (fecha_desde) {
                whereClause += ' AND rm.fecha_recepcion >= ?';
                params.push(fecha_desde);
            }
            
            if (fecha_hasta) {
                whereClause += ' AND rm.fecha_recepcion <= ?';
                params.push(fecha_hasta);
            }
            
            if (porcentaje_iva !== undefined) {
                whereClause += ' AND dr.porcentaje_iva = ?';
                params.push(parseFloat(porcentaje_iva));
            }
            
            // 🆕 Filtro por estado de vencimiento
            if (estado_vencimiento) {
                switch (estado_vencimiento) {
                    case 'vencido':
                        whereClause += ' AND rm.fecha_vencimiento_documento < CURDATE()';
                        break;
                    case 'vence_pronto':
                        whereClause += ' AND rm.fecha_vencimiento_documento BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)';
                        break;
                    case 'vigente':
                        whereClause += ' AND rm.fecha_vencimiento_documento > DATE_ADD(CURDATE(), INTERVAL 7 DAY)';
                        break;
                }
            }
            
            const sql = `
                SELECT 
                    rm.id,
                    rm.numero_recepcion,
                    rm.proveedor_id,
                    p.razonSocial as proveedor_nombre,
                    rm.fecha_recepcion,
                    rm.fecha_vencimiento_documento,
                    CASE 
                        WHEN rm.fecha_vencimiento_documento IS NULL THEN 'SIN_FECHA'
                        WHEN rm.fecha_vencimiento_documento < CURDATE() THEN 'VENCIDO'
                        WHEN rm.fecha_vencimiento_documento BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY) THEN 'VENCE_PRONTO'
                        ELSE 'VIGENTE'
                    END as estado_vencimiento,
                    DATEDIFF(rm.fecha_vencimiento_documento, CURDATE()) as dias_para_vencimiento,
                    rm.numero_remito,
                    rm.numero_factura,
                    rm.total,
                    rm.observaciones,
                    rm.created_at,
                    COUNT(DISTINCT dr.id) as total_items,
                    SUM(dr.cantidad_recibida * dr.precio_unitario) as subtotal_sin_iva,
                    SUM(dr.cantidad_recibida * dr.iva_unitario) as total_iva_calculado,
                    AVG(dr.porcentaje_iva) as promedio_iva
                FROM recepciones_mercaderia rm
                LEFT JOIN proveedores p ON rm.proveedor_id = p.proveedorId
                LEFT JOIN detalle_recepciones dr ON rm.id = dr.recepcion_id
                ${whereClause}
                GROUP BY rm.id, p.razonSocial
                ORDER BY rm.fecha_recepcion DESC
                LIMIT ? OFFSET ?
            `;
            
            const offset = (page - 1) * limit;
            params.push(parseInt(limit), parseInt(offset));
            
            const recepciones = await db.query(sql, params);
            
            // Contar total
            const countSql = `
                SELECT COUNT(DISTINCT rm.id) as total
                FROM recepciones_mercaderia rm
                LEFT JOIN detalle_recepciones dr ON rm.id = dr.recepcion_id
                ${whereClause}
            `;
            const [totalResult] = await db.query(countSql, params.slice(0, -2));
            
            res.json({
                success: true,
                data: recepciones,
                pagination: {
                    current_page: parseInt(page),
                    per_page: parseInt(limit),
                    total: totalResult.total,
                    total_pages: Math.ceil(totalResult.total / limit)
                },
                message: 'Recepciones con información de IVA obtenidas correctamente'
            });
            
        } catch (error) {
            logger.error('Error obteniendo recepciones con IVA:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener recepciones',
                error: error.message
            });
        }
    }
    
    // =============================================
    // 🆕 NUEVA FUNCIÓN: Alertas de vencimientos
    // =============================================
    static async getAlertasVencimientos(req, res) {
        try {
            const { dias = 30 } = req.query;
            
            const sql = `
                SELECT 
                    rm.id,
                    rm.numero_recepcion,
                    rm.numero_factura,
                    rm.numero_remito,
                    rm.fecha_recepcion,
                    rm.fecha_vencimiento_documento,
                    p.razonSocial as proveedor,
                    p.telefono as proveedor_telefono,
                    p.email as proveedor_email,
                    DATEDIFF(rm.fecha_vencimiento_documento, CURDATE()) as dias_para_vencimiento,
                    CASE 
                        WHEN rm.fecha_vencimiento_documento < CURDATE() THEN 'VENCIDO'
                        WHEN DATEDIFF(rm.fecha_vencimiento_documento, CURDATE()) <= 7 THEN 'VENCE_PRONTO'
                        ELSE 'VIGENTE'
                    END as estado_vencimiento,
                    rm.total as total_compra
                FROM recepciones_mercaderia rm
                JOIN proveedores p ON rm.proveedor_id = p.proveedorId
                WHERE rm.fecha_vencimiento_documento IS NOT NULL
                  AND rm.fecha_vencimiento_documento <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
                ORDER BY rm.fecha_vencimiento_documento ASC
            `;
            
            const alertas = await db.query(sql, [parseInt(dias)]);
            
            // Calcular estadísticas
            const vencidos = alertas.filter(a => a.estado_vencimiento === 'VENCIDO');
            const vencenPronto = alertas.filter(a => a.estado_vencimiento === 'VENCE_PRONTO');
            const montoTotalVencido = vencidos.reduce((sum, a) => sum + parseFloat(a.total_compra || 0), 0);
            
            res.json({
                success: true,
                data: alertas,
                resumen: {
                    vencidos: vencidos.length,
                    vencen_pronto: vencenPronto.length,
                    total_alertas: alertas.length,
                    monto_total_vencido: montoTotalVencido,
                    dias_filtro: parseInt(dias)
                },
                message: 'Alertas de vencimientos obtenidas correctamente'
            });
            
        } catch (error) {
            logger.error('Error obteniendo alertas de vencimientos:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener alertas',
                error: error.message
            });
        }
    }
    
    // =============================================
    // 🆕 NUEVA FUNCIÓN: Reporte de IVA por período
    // =============================================
    static async getReporteIva(req, res) {
        try {
            const { fecha_desde, fecha_hasta, proveedor_id } = req.query;
            
            if (!fecha_desde || !fecha_hasta) {
                return res.status(400).json({
                    success: false,
                    message: 'Fecha desde y hasta son requeridas'
                });
            }
            
            let whereClause = 'WHERE rm.fecha_recepcion BETWEEN ? AND ?';
            let params = [fecha_desde, fecha_hasta];
            
            if (proveedor_id) {
                whereClause += ' AND rm.proveedor_id = ?';
                params.push(proveedor_id);
            }
            
            const sql = `
                SELECT 
                    dr.porcentaje_iva,
                    COUNT(DISTINCT rm.id) as cantidad_recepciones,
                    COUNT(dr.id) as cantidad_items,
                    SUM(dr.cantidad_recibida) as cantidad_total,
                    SUM(dr.cantidad_recibida * dr.precio_unitario) as subtotal_sin_iva,
                    SUM(dr.cantidad_recibida * dr.iva_unitario) as total_iva,
                    SUM(dr.cantidad_recibida * dr.precio_con_iva) as total_con_iva,
                    AVG(dr.precio_unitario) as precio_promedio,
                    MIN(rm.fecha_recepcion) as primera_recepcion,
                    MAX(rm.fecha_recepcion) as ultima_recepcion
                FROM recepciones_mercaderia rm
                JOIN detalle_recepciones dr ON rm.id = dr.recepcion_id
                ${whereClause}
                GROUP BY dr.porcentaje_iva
                ORDER BY dr.porcentaje_iva
            `;
            
            const reporte = await db.query(sql, params);
            
            // Calcular totales generales
            const totales = reporte.reduce((acc, item) => {
                acc.subtotal_sin_iva += parseFloat(item.subtotal_sin_iva || 0);
                acc.total_iva += parseFloat(item.total_iva || 0);
                acc.total_con_iva += parseFloat(item.total_con_iva || 0);
                acc.cantidad_items += parseInt(item.cantidad_items || 0);
                return acc;
            }, {
                subtotal_sin_iva: 0,
                total_iva: 0,
                total_con_iva: 0,
                cantidad_items: 0
            });
            
            res.json({
                success: true,
                data: reporte,
                totales,
                periodo: {
                    desde: fecha_desde,
                    hasta: fecha_hasta
                },
                proveedor_id: proveedor_id || null,
                message: 'Reporte de IVA generado correctamente'
            });
            
        } catch (error) {
            logger.error('Error generando reporte de IVA:', error);
            res.status(500).json({
                success: false,
                message: 'Error generando reporte',
                error: error.message
            });
        }
    }
    
    // 🚀 MANTENER TUS FUNCIONES EXISTENTES
    // getRecepciones, getRecepcionById, etc.
    // Solo agregar las nuevas funciones arriba
    // =============================================
// ÓRDENES DE COMPRA
// =============================================
static async getOrdenes(req, res) {
    try {
        const {
            page = 1,
            limit = 10,
            estado,
            proveedor_id,
            fecha_desde,
            fecha_hasta
        } = req.query;

        let whereClause = 'WHERE 1=1';
        let params = [];

        if (estado) {
            whereClause += ' AND oc.estado = ?';
            params.push(estado);
        }

        if (proveedor_id) {
            whereClause += ' AND oc.proveedor_id = ?';
            params.push(proveedor_id);
        }

        if (fecha_desde) {
            whereClause += ' AND oc.fecha_orden >= ?';
            params.push(fecha_desde);
        }

        if (fecha_hasta) {
            whereClause += ' AND oc.fecha_orden <= ?';
            params.push(fecha_hasta);
        }

        const sql = `
            SELECT 
                oc.*,
                p.razonSocial as proveedor_nombre
            FROM ordenes_compra oc
            LEFT JOIN proveedores p ON oc.proveedor_id = p.proveedorId
            ${whereClause}
            ORDER BY oc.fecha_orden DESC
            LIMIT ? OFFSET ?
        `;

        const offset = (page - 1) * limit;
        params.push(parseInt(limit), parseInt(offset));

        const ordenes = await db.query(sql, params);

        res.json({
            success: true,
            data: ordenes,
            message: 'Órdenes de compra obtenidas correctamente'
        });

    } catch (error) {
        console.error('Error obteniendo órdenes:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener órdenes de compra',
            error: error.message
        });
    }
}

static async crearOrden(req, res) {
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const {
            proveedor_id,
            fecha_orden,
            fecha_entrega_esperada,
            items,
            moneda = 'ARS',
            tipo_cambio = 1,
            impuestos = 0,
            observaciones
        } = req.body;
        
        const numeroOrden = `OC-${Date.now()}`;
        
        let subtotal = 0;
        for (const item of items) {
            subtotal += item.cantidad_solicitada * item.precio_unitario;
        }
        const total = subtotal + impuestos;
        
        const [ordenResult] = await connection.query(`
            INSERT INTO ordenes_compra (
                numero_orden, proveedor_id, fecha_orden, fecha_entrega_esperada,
                estado, subtotal, impuestos, total, moneda, tipo_cambio, observaciones,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'PENDIENTE', ?, ?, ?, ?, ?, ?, NOW(), NOW())
        `, [
            numeroOrden, proveedor_id, fecha_orden, fecha_entrega_esperada,
            subtotal, impuestos, total, moneda, tipo_cambio, observaciones
        ]);
        
        const ordenId = ordenResult.insertId;
        
        for (const item of items) {
            const subtotalItem = item.cantidad_solicitada * item.precio_unitario;
            
            await connection.query(`
                INSERT INTO detalle_ordenes_compra (
                    orden_compra_id, mercaderia_id, cantidad_solicitada, 
                    precio_unitario, subtotal, created_at
                ) VALUES (?, ?, ?, ?, ?, NOW())
            `, [ordenId, item.mercaderia_id, item.cantidad_solicitada, 
                item.precio_unitario, subtotalItem]);
        }
        
        await connection.commit();
        
        res.json({
            success: true,
            data: {
                id: ordenId,
                numero_orden: numeroOrden,
                total: total
            },
            message: 'Orden de compra creada exitosamente'
        });
        
    } catch (error) {
        await connection.rollback();
        console.error('Error creando orden:', error);
        res.status(500).json({
            success: false,
            message: 'Error al crear orden de compra',
            error: error.message
        });
    } finally {
        connection.release();
    }
}

static async cancelarOrden(req, res) {
    try {
        const { id } = req.params;
        const { motivo } = req.body;

        const [result] = await db.query(`
            UPDATE ordenes_compra 
            SET estado = 'CANCELADA', observaciones = ?, updated_at = NOW()
            WHERE id = ?
        `, [motivo || 'Orden cancelada', id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Orden no encontrada'
            });
        }

        res.json({
            success: true,
            message: 'Orden cancelada exitosamente'
        });

    } catch (error) {
        console.error('Error cancelando orden:', error);
        res.status(500).json({
            success: false,
            message: 'Error al cancelar orden',
            error: error.message
        });
    }
}

// =============================================
// RECEPCIONES
// =============================================
static async getRecepciones(req, res) {
    try {
        const {
            page = 1,
            limit = 10,
            proveedor_id,
            fecha_desde,
            fecha_hasta
        } = req.query;

        let whereClause = 'WHERE 1=1';
        let params = [];

        if (proveedor_id) {
            whereClause += ' AND rm.proveedor_id = ?';
            params.push(proveedor_id);
        }

        if (fecha_desde) {
            whereClause += ' AND rm.fecha_recepcion >= ?';
            params.push(fecha_desde);
        }

        if (fecha_hasta) {
            whereClause += ' AND rm.fecha_recepcion <= ?';
            params.push(fecha_hasta);
        }

        const sql = `
            SELECT 
                rm.*,
                p.razonSocial as proveedor_nombre,
                COUNT(dr.id) as total_items
            FROM recepciones_mercaderia rm
            LEFT JOIN proveedores p ON rm.proveedor_id = p.proveedorId
            LEFT JOIN detalle_recepciones dr ON rm.id = dr.recepcion_id
            ${whereClause}
            GROUP BY rm.id, p.razonSocial
            ORDER BY rm.fecha_recepcion DESC
            LIMIT ? OFFSET ?
        `;

        const offset = (page - 1) * limit;
        params.push(parseInt(limit), parseInt(offset));

        const recepciones = await db.query(sql, params);

        res.json({
            success: true,
            data: recepciones,
            message: 'Recepciones obtenidas correctamente'
        });

    } catch (error) {
        console.error('Error obteniendo recepciones:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener recepciones',
            error: error.message
        });
    }
}

static async getRecepcionById(req, res) {
    try {
        const { id } = req.params;

        const [recepcion] = await db.query(`
            SELECT 
                rm.*,
                p.razonSocial as proveedor_nombre,
                p.cuit as proveedor_cuit
            FROM recepciones_mercaderia rm
            LEFT JOIN proveedores p ON rm.proveedor_id = p.proveedorId
            WHERE rm.id = ?
        `, [id]);

        if (!recepcion) {
            return res.status(404).json({
                success: false,
                message: 'Recepción no encontrada'
            });
        }

        const detalles = await db.query(`
            SELECT 
                dr.*,
                m.descripcion as mercaderia_descripcion,
                m.codigo_sku,
                m.unidad_medida
            FROM detalle_recepciones dr
            LEFT JOIN mercaderias m ON dr.mercaderia_id = m.id
            WHERE dr.recepcion_id = ?
        `, [id]);

        recepcion.detalles = detalles;

        res.json({
            success: true,
            data: recepcion,
            message: 'Recepción obtenida correctamente'
        });

    } catch (error) {
        console.error('Error obteniendo recepción:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener recepción',
            error: error.message
        });
    }
}

// =============================================
// LOTES
// =============================================
static async getLotesProximosVencer(req, res) {
    try {
        const { dias = 30 } = req.query;

        const sql = `
            SELECT 
                lm.*,
                m.descripcion as mercaderia_descripcion,
                m.codigo_sku,
                DATEDIFF(lm.fecha_vencimiento, CURDATE()) as dias_para_vencer
            FROM lotes_mercaderia lm
            JOIN mercaderias m ON lm.mercaderia_id = m.id
            WHERE lm.fecha_vencimiento IS NOT NULL
              AND lm.fecha_vencimiento <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
              AND lm.cantidad_actual > 0
            ORDER BY lm.fecha_vencimiento ASC
        `;

        const lotes = await db.query(sql, [parseInt(dias)]);

        res.json({
            success: true,
            data: lotes,
            message: 'Lotes próximos a vencer obtenidos correctamente'
        });

    } catch (error) {
        console.error('Error obteniendo lotes:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener lotes',
            error: error.message
        });
    }
}

static async getLotesPorMercaderia(req, res) {
    try {
        const { mercaderiaId } = req.params;

        const lotes = await db.query(`
            SELECT 
                lm.*,
                m.descripcion as mercaderia_descripcion,
                m.codigo_sku
            FROM lotes_mercaderia lm
            JOIN mercaderias m ON lm.mercaderia_id = m.id
            WHERE lm.mercaderia_id = ?
            ORDER BY lm.fecha_vencimiento ASC
        `, [mercaderiaId]);

        res.json({
            success: true,
            data: lotes,
            message: 'Lotes por mercadería obtenidos correctamente'
        });

    } catch (error) {
        console.error('Error obteniendo lotes por mercadería:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener lotes',
            error: error.message
        });
    }
}

// =============================================
// REPORTES
// =============================================
static async getDashboardCompras(req, res) {
    try {
        const dashboard = await db.query(`
            SELECT 
                COUNT(DISTINCT rm.id) as total_recepciones,
                COUNT(DISTINCT oc.id) as total_ordenes,
                SUM(rm.total) as total_comprado,
                COUNT(CASE WHEN oc.estado = 'PENDIENTE' THEN 1 END) as ordenes_pendientes,
                COUNT(CASE WHEN DATEDIFF(lm.fecha_vencimiento, CURDATE()) <= 30 AND lm.cantidad_actual > 0 THEN 1 END) as lotes_vencen_pronto
            FROM recepciones_mercaderia rm
            LEFT JOIN ordenes_compra oc ON 1=1
            LEFT JOIN lotes_mercaderia lm ON 1=1
            WHERE rm.fecha_recepcion >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH)
        `);

        res.json({
            success: true,
            data: dashboard[0] || {},
            message: 'Dashboard obtenido correctamente'
        });

    } catch (error) {
        console.error('Error obteniendo dashboard:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener dashboard',
            error: error.message
        });
    }
}

static async getReporteCompras(req, res) {
    try {
        const { fecha_desde, fecha_hasta, proveedor_id } = req.query;

        let whereClause = 'WHERE 1=1';
        let params = [];

        if (fecha_desde) {
            whereClause += ' AND rm.fecha_recepcion >= ?';
            params.push(fecha_desde);
        }

        if (fecha_hasta) {
            whereClause += ' AND rm.fecha_recepcion <= ?';
            params.push(fecha_hasta);
        }

        if (proveedor_id) {
            whereClause += ' AND rm.proveedor_id = ?';
            params.push(proveedor_id);
        }

        const reporte = await db.query(`
            SELECT 
                rm.*,
                p.razonSocial as proveedor_nombre,
                COUNT(dr.id) as total_items
            FROM recepciones_mercaderia rm
            LEFT JOIN proveedores p ON rm.proveedor_id = p.proveedorId
            LEFT JOIN detalle_recepciones dr ON rm.id = dr.recepcion_id
            ${whereClause}
            GROUP BY rm.id
            ORDER BY rm.fecha_recepcion DESC
        `, params);

        res.json({
            success: true,
            data: reporte,
            message: 'Reporte de compras generado correctamente'
        });

    } catch (error) {
        console.error('Error generando reporte:', error);
        res.status(500).json({
            success: false,
            message: 'Error al generar reporte',
            error: error.message
        });
    }
}

static async getReporteVencimientos(req, res) {
    try {
        const { dias = 30 } = req.query;

        const vencimientos = await db.query(`
            SELECT 
                lm.id,
                lm.numero_lote,
                lm.fecha_vencimiento,
                lm.cantidad_actual,
                m.descripcion as mercaderia,
                m.codigo_sku,
                DATEDIFF(lm.fecha_vencimiento, CURDATE()) as dias_para_vencer,
                CASE 
                    WHEN lm.fecha_vencimiento < CURDATE() THEN 'VENCIDO'
                    WHEN DATEDIFF(lm.fecha_vencimiento, CURDATE()) <= 7 THEN 'VENCE_ESTA_SEMANA'
                    ELSE 'VENCE_PRONTO'
                END as estado_vencimiento
            FROM lotes_mercaderia lm
            JOIN mercaderias m ON lm.mercaderia_id = m.id
            WHERE lm.fecha_vencimiento IS NOT NULL
              AND lm.fecha_vencimiento <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
              AND lm.cantidad_actual > 0
            ORDER BY lm.fecha_vencimiento ASC
        `, [parseInt(dias)]);

        res.json({
            success: true,
            data: vencimientos,
            message: 'Reporte de vencimientos generado correctamente'
        });

    } catch (error) {
        console.error('Error generando reporte de vencimientos:', error);
        res.status(500).json({
            success: false,
            message: 'Error al generar reporte',
            error: error.message
        });
    }
}

static async getOrdenById(req, res) {
    try {
        const { id } = req.params;

        const [orden] = await db.query(`
            SELECT 
                oc.*,
                p.razonSocial as proveedor_nombre,
                p.cuit as proveedor_cuit
            FROM ordenes_compra oc
            LEFT JOIN proveedores p ON oc.proveedor_id = p.proveedorId
            WHERE oc.id = ?
        `, [id]);

        if (!orden) {
            return res.status(404).json({
                success: false,
                message: 'Orden no encontrada'
            });
        }

        const detalles = await db.query(`
            SELECT 
                doc.*,
                m.descripcion as mercaderia_descripcion,
                m.codigo_sku,
                m.unidad_medida,
                (doc.cantidad_solicitada - IFNULL(SUM(dr.cantidad_recibida), 0)) as cantidad_pendiente
            FROM detalle_ordenes_compra doc
            LEFT JOIN mercaderias m ON doc.mercaderia_id = m.id
            LEFT JOIN detalle_recepciones dr ON doc.id = dr.detalle_orden_id
            WHERE doc.orden_compra_id = ?
            GROUP BY doc.id, m.descripcion, m.codigo_sku, m.unidad_medida
        `, [id]);

        orden.detalles = detalles;

        res.json({
            success: true,
            data: orden,
            message: 'Orden obtenida correctamente'
        });

    } catch (error) {
        console.error('Error obteniendo orden:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener orden',
            error: error.message
        });
    }
}

    
}

module.exports = ComprasController;