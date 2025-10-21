// =============================================
// models/Mercaderia.js - Modelo de Mercaderías ACTUALIZADO (Code 128)
// =============================================
const BaseModel = require('./BaseModel');
const db = require('../config/database');
const logger = require('../config/logger');

class Mercaderia extends BaseModel {
    constructor() {
        super('mercaderias', 'id');
    }

    async findBySku(codigo_sku) {
        try {
            const sql = `SELECT * FROM ${this.tableName} WHERE codigo_sku = ?`;
            const rows = await db.query(sql, [codigo_sku]);
            return rows[0] || null;
        } catch (error) {
            logger.error('Error en findBySku:', error);
            throw error;
        }
    }

   

    

    async findWithStock() {
        try {
            const sql = `
                SELECT 
                    m.id,
                    m.descripcion,
                    m.codigo_sku,
                    m.precio_costo,
                    m.precio_venta,
                    m.stock_minimo,
                    m.unidad_medida,
                    m.imagen,
                    m.activo,
                    c.categoria as categoria,
                    COALESCE(SUM(sd.cantidad), 0) as stock_total
                FROM ${this.tableName} m
                LEFT JOIN categorias c ON m.id_categoria = c.id
                LEFT JOIN stock_depositos sd ON m.id = sd.mercaderia_id
                WHERE m.activo = 1
                GROUP BY m.id
                ORDER BY m.descripcion
            `;
            const rows = await db.query(sql);
            return rows;
        } catch (error) {
            logger.error('Error en findWithStock:', error);
            throw error;
        }
    }

    // NUEVO: Buscar mercaderías con stock bajo
    async findLowStock() {
        try {
            const sql = `
                SELECT 
                    m.id,
                    m.descripcion,
                    m.codigo_sku,
                    m.stock_minimo,
                    COALESCE(SUM(sd.cantidad), 0) as stock_actual
                FROM ${this.tableName} m
                LEFT JOIN stock_depositos sd ON m.id = sd.mercaderia_id
                WHERE m.activo = 1
                GROUP BY m.id
                HAVING stock_actual <= m.stock_minimo AND m.stock_minimo > 0
                ORDER BY (stock_actual / NULLIF(m.stock_minimo, 0)) ASC
            `;
            const rows = await db.query(sql);
            return rows;
        } catch (error) {
            logger.error('Error en findLowStock:', error);
            throw error;
        }
    }

    // NUEVO: Buscar con filtros avanzados
    async findWithFilters(filters = {}) {
        try {
            let sql = `
                SELECT 
                    m.id,
                    m.descripcion,
                    m.codigo_sku,
                    m.precio_costo,
                    m.precio_venta,
                    m.stock_minimo,
                    m.unidad_medida,
                    m.imagen,
                    m.activo,
                    m.fecha_creacion,
                    c.categoria as categoria,
                    COALESCE(SUM(sd.cantidad), 0) as stock_total
                FROM ${this.tableName} m
                LEFT JOIN categorias c ON m.id_categoria = c.id
                LEFT JOIN stock_depositos sd ON m.id = sd.mercaderia_id
                WHERE 1=1
            `;
            
            const params = [];

            // Filtrar por activos
            if (filters.activo !== undefined) {
                sql += ` AND m.activo = ?`;
                params.push(filters.activo);
            }

            // Filtrar por categoría
            if (filters.categoria_id) {
                sql += ` AND m.id_categoria = ?`;
                params.push(filters.categoria_id);
            }

            // Buscar por texto
            if (filters.busqueda) {
                sql += ` AND (m.descripcion LIKE ? OR m.codigo_sku LIKE ? )`;
                const busqueda = `%${filters.busqueda}%`;
                params.push(busqueda, busqueda, busqueda);
            }

            // Filtrar por stock
            if (filters.solo_con_stock) {
                sql += ` GROUP BY m.id HAVING stock_total > 0`;
            } else if (filters.solo_sin_stock) {
                sql += ` GROUP BY m.id HAVING stock_total = 0`;
            } else {
                sql += ` GROUP BY m.id`;
            }

            // Ordenamiento
            const orderBy = filters.order_by || 'descripcion';
            const orderDirection = filters.order_direction || 'ASC';
            sql += ` ORDER BY ${orderBy} ${orderDirection}`;

            // Paginación
            if (filters.limit) {
                sql += ` LIMIT ?`;
                params.push(parseInt(filters.limit));
                
                if (filters.offset) {
                    sql += ` OFFSET ?`;
                    params.push(parseInt(filters.offset));
                }
            }

            const rows = await db.query(sql, params);
            return rows;
        } catch (error) {
            logger.error('Error en findWithFilters:', error);
            throw error;
        }
    }

    async buscarConStockDeposito(termino, depositoId) {
    try {
        const rows = await db.query(`
            SELECT 
                m.id as mercaderia_id,
                m.codigo_sku,
                m.descripcion,
                m.precio_venta,
                c.categoria,
                COALESCE(sd.cantidad, 0) as stock_deposito
            FROM mercaderias m
            LEFT JOIN categorias c ON m.id_categoria = c.id
            LEFT JOIN stock_depositos sd ON m.id = sd.mercaderia_id AND sd.deposito_id = ?
            WHERE m.activo = 1
            AND (m.codigo_sku LIKE ? OR m.descripcion LIKE ?)
            ORDER BY sd.cantidad DESC, m.descripcion ASC
            LIMIT 20
        `, [depositoId, `%${termino}%`, `%${termino}%`]);
        
        // ASEGURAR QUE SIEMPRE RETORNE UN ARRAY
        if (Array.isArray(rows)) {
            return rows;
        } else if (rows) {
            return [rows]; // Convertir objeto único a array
        } else {
            return [];
        }
    } catch (error) {
        logger.error('Error en buscarConStockDeposito:', error);
        throw error;
    }
}

    // MEJORADO: Crear con validaciones completas
    async create(data) {
        try {
            // Validaciones
            if (!data.descripcion || data.descripcion.trim() === '') {
                throw new Error('La descripción es requerida');
            }

            if (!data.codigo_sku || data.codigo_sku.trim() === '') {
                throw new Error('El código SKU es requerido');
            }

           

            // Verificar unicidad de SKU
            const existingSku = await this.findBySku(data.codigo_sku);
            if (existingSku) {
                throw new Error('El código SKU ya existe');
            }

            

            // Valores por defecto
            data.precio_costo = data.precio_costo || 0;
            data.precio_venta = data.precio_venta || 0;
            data.stock_minimo = data.stock_minimo || 0;
            data.cotizacion = data.cotizacion || 1;
            data.activo = data.activo !== undefined ? data.activo : 1;

            return await super.create(data);
        } catch (error) {
            logger.error('Error en create:', error);
            throw error;
        }
    }

    // NUEVO: Actualizar imagen
    async updateImage(id, imageBase64) {
        try {
            if (!imageBase64) {
                throw new Error('Imagen requerida');
            }

            // Validar formato base64
            const base64Pattern = /^data:image\/(jpeg|jpg|png|gif);base64,/;
            if (!base64Pattern.test(imageBase64)) {
                throw new Error('Formato de imagen inválido');
            }

            const sql = `UPDATE ${this.tableName} SET imagen = ?, ultima_modificacion = CURRENT_TIMESTAMP WHERE id = ?`;
            const result = await db.query(sql, [imageBase64, id]);
            
            if (result.affectedRows === 0) {
                throw new Error('Mercadería no encontrada');
            }

            return await this.findById(id);
        } catch (error) {
            logger.error('Error en updateImage:', error);
            throw error;
        }
    }

    // NUEVO: Eliminar imagen
    async removeImage(id) {
        try {
            const sql = `UPDATE ${this.tableName} SET imagen = NULL, ultima_modificacion = CURRENT_TIMESTAMP WHERE id = ?`;
            const result = await db.query(sql, [id]);
            
            if (result.affectedRows === 0) {
                throw new Error('Mercadería no encontrada');
            }

            return await this.findById(id);
        } catch (error) {
            logger.error('Error en removeImage:', error);
            throw error;
        }
    }

    // Buscar mercaderías con stock bajo
async findLowStock() {
    try {
        const sql = `
            SELECT 
                m.id,
                m.descripcion,
                m.codigo_sku,
                m.stock_minimo,
                m.precio_venta,
                c.nombre as categoria,
                COALESCE(SUM(sd.cantidad), 0) as stock_actual,
                CASE 
                    WHEN COALESCE(SUM(sd.cantidad), 0) = 0 THEN 'SIN_STOCK'
                    WHEN COALESCE(SUM(sd.cantidad), 0) <= m.stock_minimo THEN 'STOCK_BAJO'
                    ELSE 'NORMAL'
                END as estado_stock,
                (m.stock_minimo - COALESCE(SUM(sd.cantidad), 0)) as cantidad_faltante,
                -- Detalle por depósito
                GROUP_CONCAT(
                    DISTINCT CONCAT(d.nombre, ': ', IFNULL(sd.cantidad, 0))
                    ORDER BY d.nombre SEPARATOR ', '
                ) as detalle_depositos
            FROM ${this.tableName} m
            LEFT JOIN stock_depositos sd ON m.id = sd.mercaderia_id
            LEFT JOIN depositos d ON sd.deposito_id = d.id AND d.activo = 1
            LEFT JOIN categorias c ON m.categoria_id = c.id
            WHERE m.activo = 1 AND m.stock_minimo > 0
            GROUP BY m.id
            HAVING stock_actual <= m.stock_minimo
            ORDER BY 
                CASE 
                    WHEN stock_actual = 0 THEN 1
                    ELSE 2
                END,
                (stock_actual / NULLIF(m.stock_minimo, 0)) ASC,
                m.descripcion
        `;
        
        const rows = await db.query(sql);
        return rows;
    } catch (error) {
        logger.error('Error en findLowStock:', error);
        throw error;
    }
}

// Método adicional: obtener estadísticas de stock
async getStockStats() {
    try {
        const [stats] = await db.query(`
            SELECT 
                COUNT(*) as total_productos,
                COUNT(CASE WHEN m.activo = 1 THEN 1 END) as productos_activos,
                COUNT(CASE WHEN m.stock_minimo > 0 THEN 1 END) as con_stock_minimo,
                AVG(CASE WHEN m.activo = 1 THEN m.stock_minimo END) as stock_minimo_promedio,
                (SELECT COUNT(DISTINCT m2.id)
                 FROM ${this.tableName} m2
                 LEFT JOIN stock_depositos sd2 ON m2.id = sd2.mercaderia_id
                 WHERE m2.activo = 1 AND m2.stock_minimo > 0
                 GROUP BY m2.id
                 HAVING COALESCE(SUM(sd2.cantidad), 0) <= m2.stock_minimo
                ) as productos_stock_bajo,
                (SELECT COUNT(DISTINCT m3.id)
                 FROM ${this.tableName} m3
                 LEFT JOIN stock_depositos sd3 ON m3.id = sd3.mercaderia_id
                 WHERE m3.activo = 1
                 GROUP BY m3.id
                 HAVING COALESCE(SUM(sd3.cantidad), 0) = 0
                ) as productos_sin_stock
            FROM ${this.tableName} m
        `);
        
        return stats;
    } catch (error) {
        logger.error('Error en getStockStats:', error);
        throw error;
    }
}

// Método para obtener productos más vendidos
async getMasVendidos(limite = 10) {
    try {
        const sql = `
            SELECT 
                m.id,
                m.descripcion,
                m.codigo_sku,
                m.precio_venta,
                c.nombre as categoria,
                SUM(dp.cantidad) as cantidad_vendida,
                SUM(dp.cantidad * dp.precio_unitario) as total_ventas,
                COUNT(DISTINCT p.id) as pedidos_diferentes,
                AVG(dp.precio_unitario) as precio_promedio
            FROM ${this.tableName} m
            INNER JOIN detalles_pedido dp ON m.id = dp.mercaderia_id
            INNER JOIN pedidos p ON dp.pedido_id = p.id
            LEFT JOIN categorias c ON m.categoria_id = c.id
            WHERE m.activo = 1 
                AND p.estado = 'COMPLETADO'
                AND p.fecha_completado >= DATE_SUB(CURDATE(), INTERVAL 3 MONTH)
            GROUP BY m.id
            ORDER BY cantidad_vendida DESC
            LIMIT ?
        `;
        
        const rows = await db.query(sql, [limite]);
        return rows;
    } catch (error) {
        logger.error('Error en getMasVendidos:', error);
        throw error;
    }
}
}

module.exports = new Mercaderia();