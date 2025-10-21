// =============================================
// models/Deposito.js - Modelo de Depósitos
// =============================================
const BaseModel = require('./BaseModel');
const db = require('../config/database');
const logger = require('../config/logger');

class Deposito extends BaseModel {
    constructor() {
        super('depositos', 'id');
    }

    async findByTipo(tipo) {
        try {
            const sql = `SELECT * FROM ${this.tableName} WHERE tipo = ? AND activo = 1 ORDER BY nombre`;
            return await db.query(sql, [tipo]);
        } catch (error) {
            logger.error('Error en findByTipo:', error);
            throw error;
        }
    }

    async findByEntity(tipo, entityId) {
        try {
            const sql = `SELECT * FROM ${this.tableName} WHERE tipo = ? AND entity_id = ? AND activo = 1`;
            const rows = await db.query(sql, [tipo, entityId]);
            return rows[0] || null;
        } catch (error) {
            logger.error('Error en findByEntity:', error);
            throw error;
        }
    }

    async getDepositoCentral() {
        try {
            const sql = `SELECT * FROM ${this.tableName} WHERE tipo = 'CENTRAL' AND activo = 1 LIMIT 1`;
            const rows = await db.query(sql);
            return rows[0] || null;
        } catch (error) {
            logger.error('Error en getDepositoCentral:', error);
            throw error;
        }
    }

    async createDepositoVendedor(vendedorId, vendedorData) {
        try {
            const depositoData = {
                nombre: `Depósito - ${vendedorData.razonSocial}`,
                tipo: 'VENDEDOR',
                entity_id: vendedorId,
                direccion: vendedorData.domicilio,
                telefono: vendedorData.telefono,
                email: vendedorData.email,
                activo: 1
            };

            return await this.create(depositoData);
        } catch (error) {
            logger.error('Error en createDepositoVendedor:', error);
            throw error;
        }
    }

    async createDepositoCliente(clienteId, clienteData) {
        try {
            const depositoData = {
                nombre: `Depósito - ${clienteData.razonSocial}`,
                tipo: 'CLIENTE',
                entity_id: clienteId,
                direccion: clienteData.domicilio,
                telefono: clienteData.telefono,
                email: clienteData.email,
                activo: 1
            };

            return await this.create(depositoData);
        } catch (error) {
            logger.error('Error en createDepositoCliente:', error);
            throw error;
        }
    }

    async getDepositosConStock() {
        try {
            const sql = `
                SELECT 
                    d.*,
                    COUNT(DISTINCT sd.mercaderia_id) as total_productos,
                    SUM(sd.cantidad) as cantidad_total,
                    SUM(sd.cantidad * m.precio_venta) as valor_total
                FROM ${this.tableName} d
                LEFT JOIN stock_depositos sd ON d.id = sd.deposito_id
                LEFT JOIN mercaderias m ON sd.mercaderia_id = m.id AND m.activo = 1
                WHERE d.activo = 1
                GROUP BY d.id
                ORDER BY d.tipo, d.nombre
            `;
            return await db.query(sql);
        } catch (error) {
            logger.error('Error en getDepositosConStock:', error);
            throw error;
        }
    }
}

module.exports = new Deposito();