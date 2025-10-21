// =============================================
// models/RecepcionMercaderia.js - Modelo de Recepciones
// =============================================
const BaseModel = require('./BaseModel');

class RecepcionMercaderia extends BaseModel {
    constructor() {
        super('recepciones_mercaderia', 'id');
    }

    async generateNumeroRecepcion() {
        try {
            const fecha = new Date();
            const año = fecha.getFullYear();
            const mes = String(fecha.getMonth() + 1).padStart(2, '0');
            const dia = String(fecha.getDate()).padStart(2, '0');
            
            const sql = `
                SELECT numero_recepcion 
                FROM ${this.tableName} 
                WHERE numero_recepcion LIKE ?
                ORDER BY numero_recepcion DESC 
                LIMIT 1
            `;
            const patron = `REC-${año}${mes}${dia}-%`;
            const result = await db.query(sql, [patron]);
            
            let siguiente = 1;
            if (result.length > 0) {
                const ultimoNumero = result[0].numero_recepcion;
                const secuencia = parseInt(ultimoNumero.split('-')[2]) + 1;
                siguiente = secuencia;
            }
            
            return `REC-${año}${mes}${dia}-${String(siguiente).padStart(3, '0')}`;
        } catch (error) {
            throw error;
        }
    }

    async crearRecepcionCompleta(recepcionData, items) {
        try {
            return await db.transaction(async (connection) => {
                // Generar número de recepción
                const numeroRecepcion = await this.generateNumeroRecepcion();
                
                // Crear recepción
                const [recepcionResult] = await connection.execute(`
                    INSERT INTO ${this.tableName} 
                    (numero_recepcion, orden_compra_id, proveedor_id, fecha_recepcion, 
                     numero_remito, numero_factura, observaciones, usuario_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    numeroRecepcion,
                    recepcionData.orden_compra_id || null,
                    recepcionData.proveedor_id,
                    recepcionData.fecha_recepcion,
                    recepcionData.numero_remito || null,
                    recepcionData.numero_factura || null,
                    recepcionData.observaciones || null,
                    recepcionData.usuario_id
                ]);
                
                const recepcionId = recepcionResult.insertId;
                
                // Obtener depósito central
                const [depositoCentralResult] = await connection.execute(
                    'SELECT id FROM depositos WHERE tipo = ? AND activo = 1 LIMIT 1',
                    ['CENTRAL']
                );
                
                if (depositoCentralResult.length === 0) {
                    throw new Error('No se encontró el depósito central');
                }
                
                const depositoCentralId = depositoCentralResult[0].id;
                
                // Crear detalles y actualizar stock
                for (const item of items) {
                    // Insertar detalle de recepción
                    await connection.execute(`
                        INSERT INTO detalle_recepciones 
                        (recepcion_id, detalle_orden_id, mercaderia_id, cantidad_recibida, 
                         precio_unitario, numero_lote, fecha_vencimiento, observaciones)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        recepcionId,
                        item.detalle_orden_id || null,
                        item.mercaderia_id,
                        item.cantidad_recibida,
                        item.precio_unitario,
                        item.numero_lote || null,
                        item.fecha_vencimiento || null,
                        item.observaciones || null
                    ]);

                    // Registrar movimiento de stock
                    await connection.execute(`
                        INSERT INTO movimientos_stock 
                        (tipo_movimiento, mercaderia_id, deposito_destino_id, cantidad, 
                         precio_unitario, precio_costo, motivo, recepcion_id, numero_lote, 
                         fecha_vencimiento, usuario_id)
                        VALUES ('COMPRA', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        item.mercaderia_id,
                        depositoCentralId,
                        item.cantidad_recibida,
                        item.precio_unitario,
                        item.precio_unitario, // precio_costo = precio_unitario para compras
                        'Recepción de mercadería',
                        recepcionId,
                        item.numero_lote || null,
                        item.fecha_vencimiento || null,
                        recepcionData.usuario_id
                    ]);

                    // Actualizar cantidad recibida en orden de compra si aplica
                    if (item.detalle_orden_id) {
                        await connection.execute(`
                            UPDATE detalle_ordenes_compra 
                            SET cantidad_recibida = cantidad_recibida + ?
                            WHERE id = ?
                        `, [item.cantidad_recibida, item.detalle_orden_id]);
                    }
                }
                
                return recepcionId;
            });
        } catch (error) {
            throw error;
        }
    }

    async getRecepcionConDetalles(recepcionId) {
        try {
            const sql = `
                SELECT 
                    rm.*,
                    p.razonSocial as proveedor_nombre,
                    oc.numero_orden,
                    u.nombre as usuario_nombre
                FROM ${this.tableName} rm
                LEFT JOIN proveedores p ON rm.proveedor_id = p.proveedorId
                LEFT JOIN ordenes_compra oc ON rm.orden_compra_id = oc.id
                LEFT JOIN usuarios u ON rm.usuario_id = u.id
                WHERE rm.id = ?
            `;
            
            const recepciones = await db.query(sql, [recepcionId]);
            if (recepciones.length === 0) return null;
            
            const recepcion = recepciones[0];
            
            // Obtener detalles
            const detallesSql = `
                SELECT 
                    dr.*,
                    m.descripcion as mercaderia_descripcion,
                    m.codigo_sku,
                    doc.cantidad_solicitada,
                    doc.precio_unitario as precio_orden
                FROM detalle_recepciones dr
                JOIN mercaderias m ON dr.mercaderia_id = m.id
                LEFT JOIN detalle_ordenes_compra doc ON dr.detalle_orden_id = doc.id
                WHERE dr.recepcion_id = ?
                ORDER BY m.descripcion
            `;
            
            const detalles = await db.query(detallesSql, [recepcionId]);
            recepcion.detalles = detalles;
            
            return recepcion;
        } catch (error) {
            throw error;
        }
    }
}

module.exports = new RecepcionMercaderia();