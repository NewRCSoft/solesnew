// =============================================
// models/StockDeposito.js - Modelo de Stock por Depósito (CORREGIDO)
// =============================================
const BaseModel = require('./BaseModel');
const db = require('../config/database');  // AGREGADO
const logger = require('../config/logger');  // AGREGADO

class StockDeposito extends BaseModel {
    constructor() {
        super('stock_depositos', 'id');
    }

    async findByMercaderiaDeposito(mercaderiaId, depositoId) {
        try {
            const sql = `SELECT * FROM ${this.tableName} WHERE mercaderia_id = ? AND deposito_id = ?`;
            const rows = await db.query(sql, [mercaderiaId, depositoId]);
            return rows[0] || null;
        } catch (error) {
            logger.error('Error en findByMercaderiaDeposito:', error);
            throw error;
        }
    }

    async updateStock(mercaderiaId, depositoId, cantidad, stockMinimo = 0) {
        try {
            const sql = `
                INSERT INTO ${this.tableName} (mercaderia_id, deposito_id, cantidad, stock_minimo)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                    cantidad = VALUES(cantidad),
                    stock_minimo = VALUES(stock_minimo),
                    fecha_actualizacion = CURRENT_TIMESTAMP
            `;
            await db.query(sql, [mercaderiaId, depositoId, cantidad, stockMinimo]);
            return await this.findByMercaderiaDeposito(mercaderiaId, depositoId);
        } catch (error) {
            logger.error('Error en updateStock:', error);
            throw error;
        }
    }

    async incrementStock(mercaderiaId, depositoId, cantidad) {
        try {
            const sql = `
                INSERT INTO ${this.tableName} (mercaderia_id, deposito_id, cantidad)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                    cantidad = cantidad + VALUES(cantidad),
                    fecha_actualizacion = CURRENT_TIMESTAMP
            `;
            await db.query(sql, [mercaderiaId, depositoId, cantidad]);
            return await this.findByMercaderiaDeposito(mercaderiaId, depositoId);
        } catch (error) {
            logger.error('Error en incrementStock:', error);
            throw error;
        }
    }

    async decrementStock(mercaderiaId, depositoId, cantidad) {
        try {
            // Verificar stock disponible
            const stockActual = await this.findByMercaderiaDeposito(mercaderiaId, depositoId);
            if (!stockActual || stockActual.cantidad < cantidad) {
                throw new Error('Stock insuficiente');
            }

            const sql = `
                UPDATE ${this.tableName} 
                SET cantidad = cantidad - ?, fecha_actualizacion = CURRENT_TIMESTAMP
                WHERE mercaderia_id = ? AND deposito_id = ?
            `;
            await db.query(sql, [cantidad, mercaderiaId, depositoId]);
            return await this.findByMercaderiaDeposito(mercaderiaId, depositoId);
        } catch (error) {
            logger.error('Error en decrementStock:', error);
            throw error;
        }
    }

    async getStockByDeposito(depositoId) {
        try {
            const sql = `
                SELECT 
                    sd.*,
                    m.descripcion,
                    m.codigo_sku,
                    m.codigo_ean13,
                    m.precio_venta,
                    c.descripcion as categoria,
                    CASE 
                        WHEN sd.cantidad <= sd.stock_minimo THEN 'BAJO'
                        WHEN sd.cantidad <= sd.stock_minimo * 1.5 THEN 'MEDIO'
                        ELSE 'OK'
                    END as estado_stock
                FROM ${this.tableName} sd
                JOIN mercaderias m ON sd.mercaderia_id = m.id
                LEFT JOIN categorias c ON m.id_categoria = c.id
                WHERE sd.deposito_id = ? AND m.activo = 1
                ORDER BY m.descripcion
            `;
            return await db.query(sql, [depositoId]);
        } catch (error) {
            logger.error('Error en getStockByDeposito:', error);
            throw error;
        }
    }

    async getStockBajo() {
        try {
            const sql = `
                SELECT 
                    sd.*,
                    m.descripcion,
                    m.codigo_sku,
                    d.nombre as deposito_nombre,
                    d.tipo as deposito_tipo
                FROM ${this.tableName} sd
                JOIN mercaderias m ON sd.mercaderia_id = m.id
                JOIN depositos d ON sd.deposito_id = d.id
                WHERE sd.cantidad <= sd.stock_minimo 
                AND m.activo = 1 
                AND d.activo = 1
                ORDER BY d.nombre, m.descripcion
            `;
            return await db.query(sql);
        } catch (error) {
            logger.error('Error en getStockBajo:', error);
            throw error;
        }
    }
}

module.exports = new StockDeposito();