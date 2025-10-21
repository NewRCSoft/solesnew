// =============================================
// models/LoteMercaderia.js - Modelo de Lotes
// =============================================
const BaseModel = require('./BaseModel');

class LoteMercaderia extends BaseModel {
    constructor() {
        super('lotes_mercaderia', 'id');
    }

    async getLotesProximosVencer(diasLimite = 30) {
        try {
            const sql = `
                SELECT 
                    lm.*,
                    m.descripcion as mercaderia_descripcion,
                    m.codigo_sku,
                    p.razonSocial as proveedor_nombre,
                    DATEDIFF(lm.fecha_vencimiento, CURDATE()) as dias_para_vencer,
                    SUM(sld.cantidad) as stock_total,
                    CASE 
                        WHEN DATEDIFF(lm.fecha_vencimiento, CURDATE()) <= 0 THEN 'VENCIDO'
                        WHEN DATEDIFF(lm.fecha_vencimiento, CURDATE()) <= 7 THEN 'CRITICO'
                        WHEN DATEDIFF(lm.fecha_vencimiento, CURDATE()) <= 30 THEN 'PROXIMO'
                        ELSE 'OK'
                    END as estado_vencimiento
                FROM ${this.tableName} lm
                JOIN mercaderias m ON lm.mercaderia_id = m.id
                JOIN proveedores p ON lm.proveedor_id = p.proveedorId
                LEFT JOIN stock_lotes_depositos sld ON lm.id = sld.lote_id
                WHERE lm.activo = 1 
                AND lm.fecha_vencimiento IS NOT NULL
                AND lm.fecha_vencimiento <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
                AND lm.cantidad_actual > 0
                GROUP BY lm.id
                ORDER BY lm.fecha_vencimiento ASC
            `;

            return await db.query(sql, [diasLimite]);
        } catch (error) {
            throw error;
        }
    }

    async getLotesPorMercaderia(mercaderiaId) {
        try {
            const sql = `
                SELECT 
                    lm.*,
                    p.razonSocial as proveedor_nombre,
                    SUM(sld.cantidad) as stock_total,
                    COUNT(DISTINCT sld.deposito_id) as depositos_con_stock,
                    DATEDIFF(lm.fecha_vencimiento, CURDATE()) as dias_para_vencer
                FROM ${this.tableName} lm
                JOIN proveedores p ON lm.proveedor_id = p.proveedorId
                LEFT JOIN stock_lotes_depositos sld ON lm.id = sld.lote_id
                WHERE lm.mercaderia_id = ? AND lm.activo = 1
                GROUP BY lm.id
                ORDER BY lm.fecha_vencimiento ASC
            `;

            return await db.query(sql, [mercaderiaId]);
        } catch (error) {
            throw error;
        }
    }

    async actualizarCantidadLote(loteId, cantidad, operacion = 'resta') {
        try {
            const operador = operacion === 'suma' ? '+' : '-';
            const sql = `
                UPDATE ${this.tableName} 
                SET cantidad_actual = cantidad_actual ${operador} ?
                WHERE id = ? AND cantidad_actual >= ?
            `;

            const result = await db.query(sql, [Math.abs(cantidad), loteId, operacion === 'resta' ? cantidad : 0]);
            return result.affectedRows > 0;
        } catch (error) {
            throw error;
        }
    }
}

module.exports = new LoteMercaderia();