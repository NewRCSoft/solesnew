// =============================================
// models/OrdenTransferencia.js - Modelo de Órdenes de Transferencia
// =============================================
const BaseModel = require('./BaseModel');
const db = require('../config/database');

class OrdenTransferencia extends BaseModel {
    constructor() {
        super('ordenes_transferencia', 'id');
    }

    async generateNumeroOrden() {
        try {
            const fecha = new Date();
            const año = fecha.getFullYear();
            const mes = String(fecha.getMonth() + 1).padStart(2, '0');
            const dia = String(fecha.getDate()).padStart(2, '0');
            
            // Buscar el último número del día
            const sql = `
                SELECT numero_orden 
                FROM ${this.tableName} 
                WHERE numero_orden LIKE ?
                ORDER BY numero_orden DESC 
                LIMIT 1
            `;
            const patron = `TR-${año}${mes}${dia}-%`;
            const result = await db.query(sql, [patron]);
            
            let siguiente = 1;
            if (result.length > 0) {
                const ultimoNumero = result[0].numero_orden;
                const secuencia = parseInt(ultimoNumero.split('-')[2]) + 1;
                siguiente = secuencia;
            }
            
            return `TR-${año}${mes}${dia}-${String(siguiente).padStart(4, '0')}`;
        } catch (error) {
            throw error;
        }
    }

    async crearOrdenCompleta(ordenData, items) {
        try {
            return await db.transaction(async (connection) => {
                // Generar número de orden
                const numeroOrden = await this.generateNumeroOrden();
                
                // Crear orden
                const [ordenResult] = await connection.execute(`
                    INSERT INTO ${this.tableName} 
                    (numero_orden, deposito_origen_id, deposito_destino_id, usuario_id, observaciones)
                    VALUES (?, ?, ?, ?, ?)
                `, [
                    numeroOrden,
                    ordenData.deposito_origen_id,
                    ordenData.deposito_destino_id,
                    ordenData.usuario_id,
                    ordenData.observaciones || null
                ]);
                
                const ordenId = ordenResult.insertId;
                
                // Crear detalles
                for (const item of items) {
                    await connection.execute(`
                        INSERT INTO detalle_ordenes_transferencia 
                        (orden_id, mercaderia_id, cantidad_solicitada, precio_unitario)
                        VALUES (?, ?, ?, ?)
                    `, [
                        ordenId,
                        item.mercaderia_id,
                        item.cantidad_solicitada,
                        item.precio_unitario || 0
                    ]);
                }
                
                return ordenId;
            });
        } catch (error) {
            throw error;
        }
    }

    async getOrdenConDetalles(ordenId) {
        try {
            const sql = `
                SELECT 
                    o.*,
                    do.nombre as deposito_origen_nombre,
                    do.tipo as deposito_origen_tipo,
                    dd.nombre as deposito_destino_nombre,
                    dd.tipo as deposito_destino_tipo,
                    u.nombre as usuario_nombre
                FROM ${this.tableName} o
                LEFT JOIN depositos do ON o.deposito_origen_id = do.id
                LEFT JOIN depositos dd ON o.deposito_destino_id = dd.id
                LEFT JOIN usuarios u ON o.usuario_id = u.id
                WHERE o.id = ?
            `;
            
            const ordenes = await db.query(sql, [ordenId]);
            if (ordenes.length === 0) return null;
            
            const orden = ordenes[0];
            
            // Obtener detalles
            const detallesSql = `
                SELECT 
                    d.*,
                    m.descripcion as mercaderia_descripcion,
                    m.codigo_sku,
                    m.codigo_ean13,
                    m.precio_venta
                FROM detalle_ordenes_transferencia d
                JOIN mercaderias m ON d.mercaderia_id = m.id
                WHERE d.orden_id = ?
                ORDER BY m.descripcion
            `;
            
            const detalles = await db.query(detallesSql, [ordenId]);
            orden.detalles = detalles;
            
            return orden;
        } catch (error) {
            throw error;
        }
    }

    async actualizarEstadoOrden(ordenId) {
        try {
            // Calcular nuevo estado basado en los detalles
            const sql = `
                SELECT 
                    COUNT(*) as total_items,
                    SUM(CASE WHEN cantidad_enviada >= cantidad_solicitada THEN 1 ELSE 0 END) as items_completos,
                    SUM(CASE WHEN cantidad_enviada > 0 THEN 1 ELSE 0 END) as items_iniciados
                FROM detalle_ordenes_transferencia 
                WHERE orden_id = ?
            `;
            
            const stats = await db.query(sql, [ordenId]);
            const { total_items, items_completos, items_iniciados } = stats[0];
            
            let nuevoEstado = 'PENDIENTE';
            let fechaCompletada = null;
            
            if (items_completos === total_items) {
                nuevoEstado = 'COMPLETADA';
                fechaCompletada = new Date();
            } else if (items_iniciados > 0) {
                nuevoEstado = 'PARCIAL';
            }
            
            // Actualizar orden
            await db.query(`
                UPDATE ${this.tableName} 
                SET estado = ?, fecha_completada = ?
                WHERE id = ?
            `, [nuevoEstado, fechaCompletada, ordenId]);
            
            return nuevoEstado;
        } catch (error) {
            throw error;
        }
    }
}

module.exports = new OrdenTransferencia();
