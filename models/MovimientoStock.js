// =============================================
// models/MovimientoStock.js - Modelo de Movimientos
// =============================================
const BaseModel = require('./BaseModel');
const db = require('../config/database');
const logger = require('../config/logger');

class MovimientoStock extends BaseModel {
    constructor() {
        super('movimientos_stock', 'id');
    }

    async registrarMovimiento(data) {
        try {
            return await db.transaction(async (connection) => {
                // Crear el movimiento
                const sql = `
                    INSERT INTO ${this.tableName} 
                    (tipo_movimiento, mercaderia_id, deposito_origen_id, deposito_destino_id, 
                     cantidad, precio_unitario, motivo, numero_documento, usuario_id, observaciones)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `;
                
                const [result] = await connection.execute(sql, [
                    data.tipo_movimiento,
                    data.mercaderia_id,
                    data.deposito_origen_id || null,
                    data.deposito_destino_id || null,
                    data.cantidad,
                    data.precio_unitario || null,
                    data.motivo || null,
                    data.numero_documento || null,
                    data.usuario_id || null,
                    data.observaciones || null
                ]);

                const movimientoId = result.insertId;

                // El trigger se encarga de actualizar el stock automáticamente
                // Pero podemos hacer validaciones adicionales aquí si es necesario

                return movimientoId;
            });
        } catch (error) {
            logger.error('Error en registrarMovimiento:', error);
            throw error;
        }
    }

    async getMovimientosByDeposito(depositoId, limit = 100) {
        try {
            const sql = `
                SELECT 
                    ms.*,
                    m.descripcion as mercaderia_descripcion,
                    m.codigo_sku,
                    do.nombre as deposito_origen_nombre,
                    dd.nombre as deposito_destino_nombre
                FROM ${this.tableName} ms
                JOIN mercaderias m ON ms.mercaderia_id = m.id
                LEFT JOIN depositos do ON ms.deposito_origen_id = do.id
                LEFT JOIN depositos dd ON ms.deposito_destino_id = dd.id
                WHERE ms.deposito_origen_id = ? OR ms.deposito_destino_id = ?
                ORDER BY ms.fecha_movimiento DESC
                LIMIT ?
            `;
            return await db.query(sql, [depositoId, depositoId, limit]);
        } catch (error) {
            logger.error('Error en getMovimientosByDeposito:', error);
            throw error;
        }
    }

    async getMovimientosByMercaderia(mercaderiaId, limit = 50) {
        try {
            const sql = `
                SELECT 
                    ms.*,
                    do.nombre as deposito_origen_nombre,
                    dd.nombre as deposito_destino_nombre
                FROM ${this.tableName} ms
                LEFT JOIN depositos do ON ms.deposito_origen_id = do.id
                LEFT JOIN depositos dd ON ms.deposito_destino_id = dd.id
                WHERE ms.mercaderia_id = ?
                ORDER BY ms.fecha_movimiento DESC
                LIMIT ?
            `;
            return await db.query(sql, [mercaderiaId, limit]);
        } catch (error) {
            logger.error('Error en getMovimientosByMercaderia:', error);
            throw error;
        }
    }
}

module.exports = new MovimientoStock();