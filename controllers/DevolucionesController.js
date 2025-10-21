// =============================================
// controllers/DevolucionesController.js - Implementación Completa con Base de Datos
// =============================================
const BaseModel = require('../models/BaseModel');
const db = require('../config/database');
const logger = require('../config/logger');

class DevolucionesController {
    constructor() {
        this.devolucionModel = new BaseModel('devoluciones_proveedores', 'id');
    }

    // ============= DEVOLUCIONES A PROVEEDORES =============
    
    static async getDevoluciones(req, res) {
        try {
            const { page = 1, limit = 10, estado, proveedor_id, fecha_desde, fecha_hasta } = req.query;
            
            let whereClause = 'WHERE 1=1';
            let params = [];
            
            if (estado) {
                whereClause += ' AND dp.estado = ?';
                params.push(estado);
            }
            
            if (proveedor_id) {
                whereClause += ' AND dp.proveedor_id = ?';
                params.push(proveedor_id);
            }
            
            if (fecha_desde) {
                whereClause += ' AND dp.fecha_devolucion >= ?';
                params.push(fecha_desde);
            }
            
            if (fecha_hasta) {
                whereClause += ' AND dp.fecha_devolucion <= ?';
                params.push(fecha_hasta);
            }

            const sql = `
                SELECT 
                    dp.id,
                    dp.numero_devolucion,
                    dp.proveedor_id,
                    p.razonSocial as proveedor_nombre,
                    dp.fecha_devolucion,
                    dp.motivo,
                    dp.estado,
                    dp.numero_nota_credito,
                    dp.monto_total,
                    dp.observaciones,
                    dp.fecha_creacion,
                    COUNT(ddp.id) as total_items,
                    SUM(ddp.cantidad * ddp.precio_unitario) as valor_calculado
                FROM devoluciones_proveedores dp
                LEFT JOIN proveedores p ON dp.proveedor_id = p.proveedorId
                LEFT JOIN detalle_devoluciones_proveedores ddp ON dp.id = ddp.devolucion_id
                ${whereClause}
                GROUP BY dp.id
                ORDER BY dp.fecha_devolucion DESC
                LIMIT ? OFFSET ?
            `;
            
            const offset = (page - 1) * limit;
            params.push(parseInt(limit), parseInt(offset));
            
            const devoluciones = await db.query(sql, params);
            
            // Contar total para paginación
            const countSql = `
                SELECT COUNT(DISTINCT dp.id) as total
                FROM devoluciones_proveedores dp
                LEFT JOIN proveedores p ON dp.proveedor_id = p.proveedorId
                ${whereClause}
            `;
            const [countResult] = await db.query(countSql, params.slice(0, -2));
            
            res.json({
                success: true,
                data: {
                    devoluciones,
                    pagination: {
                        page: parseInt(page),
                        limit: parseInt(limit),
                        total: countResult.total,
                        pages: Math.ceil(countResult.total / limit)
                    }
                },
                message: 'Devoluciones obtenidas correctamente'
            });
        } catch (error) {
            logger.error('Error en getDevoluciones:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener devoluciones',
                error: error.message
            });
        }
    }

    static async getDevolucionById(req, res) {
        try {
            const { id } = req.params;
            
            // Obtener devolución principal
            const [devolucion] = await db.query(`
                SELECT 
                    dp.*,
                    p.razonSocial as proveedor_nombre,
                    p.domicilio as proveedor_direccion,
                    p.telefono as proveedor_telefono,
                    p.email as proveedor_email,
                    u.nombre as usuario_nombre
                FROM devoluciones_proveedores dp
                LEFT JOIN proveedores p ON dp.proveedor_id = p.proveedorId
                LEFT JOIN usuarios u ON dp.usuario_id = u.id
                WHERE dp.id = ?
            `, [id]);
            
            if (!devolucion) {
                return res.status(404).json({
                    success: false,
                    message: 'Devolución no encontrada'
                });
            }
            
            // Obtener detalles de la devolución
            const detalles = await db.query(`
                SELECT 
                    ddp.*,
                    m.descripcion as mercaderia_descripcion,
                    m.codigo_sku,
                    m.unidad_medida,
                    lm.numero_lote,
                    lm.fecha_vencimiento,
                    ddp.cantidad * ddp.precio_unitario as subtotal
                FROM detalle_devoluciones_proveedores ddp
                LEFT JOIN mercaderias m ON ddp.mercaderia_id = m.id
                LEFT JOIN lotes_mercaderia lm ON ddp.lote_id = lm.id
                WHERE ddp.devolucion_id = ?
                ORDER BY ddp.id
            `, [id]);
            
            devolucion.detalles = detalles;
            
            res.json({
                success: true,
                data: devolucion,
                message: 'Devolución obtenida correctamente'
            });
        } catch (error) {
            logger.error('Error en getDevolucionById:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener devolución',
                error: error.message
            });
        }
    }

    static async crearDevolucion(req, res) {
        const connection = await db.getConnection();
        
        try {
            await connection.beginTransaction();
            
            const {
                proveedor_id,
                fecha_devolucion,
                motivo,
                items,
                numero_nota_credito,
                observaciones
            } = req.body;
            
            // Validar que todos los items tengan stock disponible
            for (const item of items) {
                if (item.lote_id) {
                    // Verificar stock en lote específico
                    const [stockLote] = await connection.query(`
                        SELECT SUM(sld.cantidad) as stock_disponible
                        FROM stock_lotes_depositos sld
                        WHERE sld.lote_id = ?
                    `, [item.lote_id]);
                    
                    if (!stockLote || stockLote.stock_disponible < item.cantidad) {
                        throw new Error(`Stock insuficiente en lote ${item.numero_lote} para mercadería ${item.mercaderia_id}`);
                    }
                } else {
                    // Verificar stock general
                    const [stockGeneral] = await connection.query(`
                        SELECT SUM(sd.cantidad) as stock_disponible
                        FROM stock_depositos sd
                        WHERE sd.mercaderia_id = ?
                    `, [item.mercaderia_id]);
                    
                    if (!stockGeneral || stockGeneral.stock_disponible < item.cantidad) {
                        throw new Error(`Stock insuficiente para mercadería ${item.mercaderia_id}`);
                    }
                }
            }
            
            // Generar número de devolución
            const numeroDevolucion = `DEV-${Date.now()}`;
            
            // Calcular monto total
            let montoTotal = 0;
            for (const item of items) {
                montoTotal += item.cantidad * item.precio_unitario;
            }
            
            // Crear devolución
            const [devolucionResult] = await connection.query(`
                INSERT INTO devoluciones_proveedores (
                    numero_devolucion, proveedor_id, fecha_devolucion,
                    motivo, estado, numero_nota_credito, monto_total,
                    observaciones, usuario_id
                ) VALUES (?, ?, ?, ?, 'PENDIENTE', ?, ?, ?, ?)
            `, [
                numeroDevolucion, proveedor_id, fecha_devolucion,
                motivo, numero_nota_credito, montoTotal,
                observaciones, req.user?.id || 1
            ]);
            
            const devolucionId = devolucionResult.insertId;
            
            // Crear detalles
            for (const item of items) {
                await connection.query(`
                    INSERT INTO detalle_devoluciones_proveedores (
                        devolucion_id, mercaderia_id, lote_id, cantidad,
                        precio_unitario, motivo_detalle
                    ) VALUES (?, ?, ?, ?, ?, ?)
                `, [
                    devolucionId, item.mercaderia_id, item.lote_id,
                    item.cantidad, item.precio_unitario, item.motivo_detalle
                ]);
            }
            
            await connection.commit();
            
            // Obtener devolución completa creada
            const devolucionCompleta = await DevolucionesController.getDevolucionCompletaById(devolucionId);
            
            res.status(201).json({
                success: true,
                data: devolucionCompleta,
                message: 'Devolución creada correctamente'
            });
            
        } catch (error) {
            await connection.rollback();
            logger.error('Error en crearDevolucion:', error);
            res.status(500).json({
                success: false,
                message: 'Error al crear devolución',
                error: error.message
            });
        } finally {
            connection.release();
        }
    }

    static async procesarDevolucion(req, res) {
        const connection = await db.getConnection();
        
        try {
            await connection.beginTransaction();
            
            const { id } = req.params;
            const { accion, observaciones_procesamiento } = req.body;
            
            // Validar acción
            if (!['PROCESAR', 'RECHAZAR', 'RESOLVER'].includes(accion)) {
                return res.status(400).json({
                    success: false,
                    message: 'Acción inválida. Use: PROCESAR, RECHAZAR, RESOLVER'
                });
            }
            
            // Obtener devolución
            const [devolucion] = await connection.query(`
                SELECT * FROM devoluciones_proveedores WHERE id = ?
            `, [id]);
            
            if (!devolucion) {
                return res.status(404).json({
                    success: false,
                    message: 'Devolución no encontrada'
                });
            }
            
            if (devolucion.estado === 'RESUELTA') {
                return res.status(400).json({
                    success: false,
                    message: 'La devolución ya está resuelta'
                });
            }
            
            let nuevoEstado = devolucion.estado;
            
            switch (accion) {
                case 'PROCESAR':
                    if (devolucion.estado !== 'PENDIENTE') {
                        throw new Error('Solo se pueden procesar devoluciones pendientes');
                    }
                    
                    // Obtener detalles para reducir stock
                    const detalles = await connection.query(`
                        SELECT * FROM detalle_devoluciones_proveedores 
                        WHERE devolucion_id = ?
                    `, [id]);
                    
                    // Obtener depósito central (donde sale la mercadería)
                    const [depositoCentral] = await connection.query(`
                        SELECT id FROM depositos WHERE tipo = 'CENTRAL' AND activo = 1 LIMIT 1
                    `);
                    
                    if (!depositoCentral) {
                        throw new Error('No se encontró depósito central configurado');
                    }
                    
                    const depositoCentralId = depositoCentral.id;
                    
                    for (const detalle of detalles) {
                        // Reducir stock por lote si corresponde
                        if (detalle.lote_id) {
                            // Verificar stock disponible en lote
                            const [stockLote] = await connection.query(`
                                SELECT cantidad FROM stock_lotes_depositos
                                WHERE lote_id = ? AND deposito_id = ?
                            `, [detalle.lote_id, depositoCentralId]);
                            
                            if (!stockLote || stockLote.cantidad < detalle.cantidad) {
                                throw new Error(`Stock insuficiente en lote para procesar devolución`);
                            }
                            
                            // Reducir stock en lote
                            await connection.query(`
                                UPDATE stock_lotes_depositos 
                                SET cantidad = cantidad - ?
                                WHERE lote_id = ? AND deposito_id = ?
                            `, [detalle.cantidad, detalle.lote_id, depositoCentralId]);
                            
                            // Actualizar cantidad actual del lote
                            await connection.query(`
                                UPDATE lotes_mercaderia 
                                SET cantidad_actual = cantidad_actual - ?
                                WHERE id = ?
                            `, [detalle.cantidad, detalle.lote_id]);
                        }
                        
                        // Reducir stock general en depósito
                        await connection.query(`
                            UPDATE stock_depositos 
                            SET cantidad = cantidad - ?
                            WHERE mercaderia_id = ? AND deposito_id = ?
                        `, [detalle.cantidad, detalle.mercaderia_id, depositoCentralId]);
                        
                        // Registrar movimiento de stock
                        await connection.query(`
                            INSERT INTO movimientos_stock (
                                tipo_movimiento, mercaderia_id, deposito_origen_id, cantidad,
                                precio_unitario, motivo, numero_documento, usuario_id
                            ) VALUES (
                                'DEVOLUCION', ?, ?, ?, ?, 'Devolución a proveedor', ?, ?
                            )
                        `, [
                            detalle.mercaderia_id, depositoCentralId, detalle.cantidad,
                            detalle.precio_unitario, devolucion.numero_devolucion,
                            req.user?.id || 1
                        ]);
                    }
                    
                    nuevoEstado = 'PROCESADA';
                    break;
                    
                case 'RECHAZAR':
                    if (devolucion.estado !== 'PENDIENTE') {
                        throw new Error('Solo se pueden rechazar devoluciones pendientes');
                    }
                    nuevoEstado = 'PENDIENTE'; // Mantiene pendiente pero se puede registrar el rechazo
                    break;
                    
                case 'RESOLVER':
                    if (devolucion.estado !== 'PROCESADA') {
                        throw new Error('Solo se pueden resolver devoluciones procesadas');
                    }
                    nuevoEstado = 'RESUELTA';
                    break;
            }
            
            // Actualizar estado de la devolución
            const observacionesActualizadas = observaciones_procesamiento 
                ? `${devolucion.observaciones || ''}\n--- ${accion} ---\n${observaciones_procesamiento}`
                : devolucion.observaciones;
            
            await connection.query(`
                UPDATE devoluciones_proveedores 
                SET estado = ?, observaciones = ?
                WHERE id = ?
            `, [nuevoEstado, observacionesActualizadas, id]);
            
            await connection.commit();
            
            res.json({
                success: true,
                data: {
                    id,
                    accion,
                    nuevo_estado: nuevoEstado,
                    fecha_procesamiento: new Date()
                },
                message: `Devolución ${accion.toLowerCase()}da correctamente`
            });
            
        } catch (error) {
            await connection.rollback();
            logger.error('Error en procesarDevolucion:', error);
            res.status(500).json({
                success: false,
                message: 'Error al procesar devolución',
                error: error.message
            });
        } finally {
            connection.release();
        }
    }

    // ============= MÉTODOS DE CONSULTA ADICIONALES =============
    
    static async getDevolucionesPorProveedor(req, res) {
        try {
            const { proveedor_id } = req.params;
            const { estado, fecha_desde, fecha_hasta } = req.query;
            
            let whereClause = 'WHERE dp.proveedor_id = ?';
            let params = [proveedor_id];
            
            if (estado) {
                whereClause += ' AND dp.estado = ?';
                params.push(estado);
            }
            
            if (fecha_desde) {
                whereClause += ' AND dp.fecha_devolucion >= ?';
                params.push(fecha_desde);
            }
            
            if (fecha_hasta) {
                whereClause += ' AND dp.fecha_devolucion <= ?';
                params.push(fecha_hasta);
            }
            
            const sql = `
                SELECT 
                    dp.*,
                    COUNT(ddp.id) as total_items,
                    SUM(ddp.cantidad * ddp.precio_unitario) as monto_calculado
                FROM devoluciones_proveedores dp
                LEFT JOIN detalle_devoluciones_proveedores ddp ON dp.id = ddp.devolucion_id
                ${whereClause}
                GROUP BY dp.id
                ORDER BY dp.fecha_devolucion DESC
            `;
            
            const devoluciones = await db.query(sql, params);
            
            res.json({
                success: true,
                data: devoluciones,
                message: 'Devoluciones por proveedor obtenidas correctamente'
            });
        } catch (error) {
            logger.error('Error en getDevolucionesPorProveedor:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener devoluciones por proveedor',
                error: error.message
            });
        }
    }

    static async getEstadisticasDevoluciones(req, res) {
        try {
            const { fecha_desde, fecha_hasta } = req.query;
            
            let whereClause = 'WHERE 1=1';
            let params = [];
            
            if (fecha_desde) {
                whereClause += ' AND dp.fecha_devolucion >= ?';
                params.push(fecha_desde);
            }
            
            if (fecha_hasta) {
                whereClause += ' AND dp.fecha_devolucion <= ?';
                params.push(fecha_hasta);
            }
            
            // Total de devoluciones por estado
            const estadisticasEstado = await db.query(`
                SELECT 
                    estado,
                    COUNT(*) as cantidad,
                    SUM(monto_total) as monto_total
                FROM devoluciones_proveedores dp
                ${whereClause}
                GROUP BY estado
            `, params);
            
            // Devoluciones por proveedor
            const estadisticasProveedor = await db.query(`
                SELECT 
                    p.razonSocial as proveedor,
                    COUNT(dp.id) as cantidad_devoluciones,
                    SUM(dp.monto_total) as monto_total_devuelto
                FROM devoluciones_proveedores dp
                JOIN proveedores p ON dp.proveedor_id = p.proveedorId
                ${whereClause}
                GROUP BY dp.proveedor_id, p.razonSocial
                ORDER BY monto_total_devuelto DESC
                LIMIT 10
            `, params);
            
            // Productos más devueltos
            const productosMasDevueltos = await db.query(`
                SELECT 
                    m.descripcion as mercaderia,
                    m.codigo_sku,
                    SUM(ddp.cantidad) as cantidad_total_devuelta,
                    COUNT(DISTINCT dp.id) as devoluciones_involucradas,
                    AVG(ddp.precio_unitario) as precio_promedio
                FROM detalle_devoluciones_proveedores ddp
                JOIN devoluciones_proveedores dp ON ddp.devolucion_id = dp.id
                JOIN mercaderias m ON ddp.mercaderia_id = m.id
                ${whereClause.replace('dp.', 'dp.')}
                GROUP BY ddp.mercaderia_id, m.descripcion, m.codigo_sku
                ORDER BY cantidad_total_devuelta DESC
                LIMIT 10
            `, params);
            
            res.json({
                success: true,
                data: {
                    por_estado: estadisticasEstado,
                    por_proveedor: estadisticasProveedor,
                    productos_mas_devueltos: productosMasDevueltos
                },
                message: 'Estadísticas de devoluciones obtenidas correctamente'
            });
        } catch (error) {
            logger.error('Error en getEstadisticasDevoluciones:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener estadísticas de devoluciones',
                error: error.message
            });
        }
    }

    // ============= MÉTODOS AUXILIARES =============
    
    static async getDevolucionCompletaById(id) {
        const [devolucion] = await db.query(`
            SELECT dp.*, p.razonSocial as proveedor_nombre
            FROM devoluciones_proveedores dp
            LEFT JOIN proveedores p ON dp.proveedor_id = p.proveedorId
            WHERE dp.id = ?
        `, [id]);
        
        if (devolucion) {
            const detalles = await db.query(`
                SELECT ddp.*, m.descripcion as mercaderia_descripcion,
                       lm.numero_lote
                FROM detalle_devoluciones_proveedores ddp
                LEFT JOIN mercaderias m ON ddp.mercaderia_id = m.id
                LEFT JOIN lotes_mercaderia lm ON ddp.lote_id = lm.id
                WHERE ddp.devolucion_id = ?
            `, [id]);
            
            devolucion.detalles = detalles;
        }
        
        return devolucion;
    }

    static async validarStockParaDevolucion(items) {
        const errores = [];
        
        for (const item of items) {
            if (item.lote_id) {
                // Verificar stock en lote específico
                const [stockLote] = await db.query(`
                    SELECT SUM(sld.cantidad) as stock_disponible
                    FROM stock_lotes_depositos sld
                    WHERE sld.lote_id = ?
                `, [item.lote_id]);
                
                if (!stockLote || stockLote.stock_disponible < item.cantidad) {
                    errores.push(`Stock insuficiente en lote ${item.numero_lote || item.lote_id}`);
                }
            } else {
                // Verificar stock general
                const [stockGeneral] = await db.query(`
                    SELECT SUM(sd.cantidad) as stock_disponible
                    FROM stock_depositos sd
                    WHERE sd.mercaderia_id = ?
                `, [item.mercaderia_id]);
                
                if (!stockGeneral || stockGeneral.stock_disponible < item.cantidad) {
                    errores.push(`Stock insuficiente para mercadería ID ${item.mercaderia_id}`);
                }
            }
        }
        
        return errores;
    }
}

module.exports = DevolucionesController;