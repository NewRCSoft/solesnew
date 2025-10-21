// =============================================
// models/Proveedor.js - Modelo de Proveedor
// =============================================
const db = require('../config/database');
const logger = require('../utils/logger');

class Proveedor {
    constructor(data) {
        this.proveedorId = data.proveedorId || null;
        this.razonSocial = data.razonSocial;
        this.cuit = data.cuit || null;
        this.telefono = data.telefono || null;
        this.email = data.email || null;
        this.domicilio = data.domicilio || null;
        this.activo = data.activo !== undefined ? data.activo : 1;
        this.fecha_creacion = data.fecha_creacion || null;
        this.ultima_modificacion = data.ultima_modificacion || null;
    }

    // =============================================
    // MÉTODOS DE INSTANCIA
    // =============================================

    // Crear proveedor en la base de datos
    async save() {
        try {
            if (this.proveedorId) {
                // Actualizar proveedor existente
                return await this.update();
            } else {
                // Crear nuevo proveedor
                return await this.create();
            }
        } catch (error) {
            logger.error('Error en save proveedor:', error);
            throw error;
        }
    }

    // Crear nuevo proveedor
    async create() {
        try {
            const [resultado] = await db.query(
                `INSERT INTO proveedores (razonSocial, cuit, telefono, email, domicilio, activo) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    this.razonSocial,
                    this.cuit,
                    this.telefono,
                    this.email,
                    this.domicilio,
                    this.activo
                ]
            );

            this.proveedorId = resultado.insertId;
            return this;
        } catch (error) {
            logger.error('Error creando proveedor:', error);
            throw error;
        }
    }

    // Actualizar proveedor existente
    async update() {
        try {
            await db.query(
                `UPDATE proveedores SET 
                    razonSocial = ?, 
                    cuit = ?, 
                    telefono = ?, 
                    email = ?, 
                    domicilio = ?, 
                    activo = ?
                 WHERE proveedorId = ?`,
                [
                    this.razonSocial,
                    this.cuit,
                    this.telefono,
                    this.email,
                    this.domicilio,
                    this.activo,
                    this.proveedorId
                ]
            );

            return this;
        } catch (error) {
            logger.error('Error actualizando proveedor:', error);
            throw error;
        }
    }

    // Eliminar proveedor (desactivar)
    async delete() {
        try {
            // Verificar si tiene compras asociadas
            const [tieneCompras] = await db.query(
                'SELECT COUNT(*) as count FROM movimientos_mercaderias WHERE proveedor_id = ?',
                [this.proveedorId]
            );

            if (tieneCompras[0].count > 0) {
                // No eliminar físicamente, solo desactivar
                this.activo = 0;
                return await this.update();
            }

            // Si no tiene compras, eliminar físicamente
            await db.query('DELETE FROM proveedores WHERE proveedorId = ?', [this.proveedorId]);
            return true;
        } catch (error) {
            logger.error('Error eliminando proveedor:', error);
            throw error;
        }
    }

    // Obtener estadísticas del proveedor
    async getEstadisticas(mes = null, año = null) {
        try {
            let fechaCondicion = '';
            let params = [this.proveedorId];

            if (mes && año) {
                fechaCondicion = 'AND MONTH(fecha_movimiento) = ? AND YEAR(fecha_movimiento) = ?';
                params.push(mes, año);
            }

            const [estadisticas] = await db.query(`
                SELECT 
                    COUNT(*) as total_compras,
                    COALESCE(SUM(cantidad * precio_unitario), 0) as monto_total_compras,
                    COALESCE(AVG(cantidad * precio_unitario), 0) as promedio_compra,
                    MIN(fecha_movimiento) as primera_compra,
                    MAX(fecha_movimiento) as ultima_compra
                FROM movimientos_mercaderias 
                WHERE proveedor_id = ? AND tipo_movimiento = 'COMPRA' ${fechaCondicion}
            `, params);

            return estadisticas[0];
        } catch (error) {
            logger.error('Error obteniendo estadísticas del proveedor:', error);
            throw error;
        }
    }

    // Obtener compras del proveedor
    async getCompras(limit = 10, offset = 0) {
        try {
            const [compras] = await db.query(`
                SELECT 
                    mm.id,
                    mm.fecha_movimiento,
                    m.descripcion as producto,
                    m.codigo_sku,
                    mm.cantidad,
                    mm.precio_unitario,
                    (mm.cantidad * mm.precio_unitario) as total,
                    mm.observaciones
                FROM movimientos_mercaderias mm
                INNER JOIN mercaderias m ON mm.mercaderia_id = m.id
                WHERE mm.proveedor_id = ? AND mm.tipo_movimiento = 'COMPRA'
                ORDER BY mm.fecha_movimiento DESC
                LIMIT ? OFFSET ?
            `, [this.proveedorId, limit, offset]);

            return compras;
        } catch (error) {
            logger.error('Error obteniendo compras del proveedor:', error);
            throw error;
        }
    }

    // =============================================
    // MÉTODOS ESTÁTICOS
    // =============================================

    // Encontrar proveedor por ID
    static async findById(id) {
        try {
            const [proveedor] = await db.query(
                'SELECT * FROM proveedores WHERE proveedorId = ?',
                [id]
            );

            if (!proveedor || proveedor.length === 0) {
                return null;
            }

            return new Proveedor(proveedor[0]);
        } catch (error) {
            logger.error('Error buscando proveedor por ID:', error);
            throw error;
        }
    }

    // Encontrar proveedor por CUIT
    static async findByCuit(cuit) {
        try {
            const [proveedor] = await db.query(
                'SELECT * FROM proveedores WHERE cuit = ? AND activo = 1',
                [cuit]
            );

            if (!proveedor || proveedor.length === 0) {
                return null;
            }

            return new Proveedor(proveedor[0]);
        } catch (error) {
            logger.error('Error buscando proveedor por CUIT:', error);
            throw error;
        }
    }

    // Obtener todos los proveedores con filtros
    static async getAll(filters = {}) {
        try {
            const {
                search = '',
                activo = '',
                limit = 10,
                offset = 0,
                orderBy = 'razonSocial',
                orderDir = 'ASC'
            } = filters;

            let whereClause = 'WHERE 1=1';
            let params = [];

            // Filtro de búsqueda
            if (search) {
                whereClause += ` AND (razonSocial LIKE ? OR cuit LIKE ? OR email LIKE ?)`;
                const searchParam = `%${search}%`;
                params.push(searchParam, searchParam, searchParam);
            }

            // Filtro por estado activo
            if (activo !== '') {
                whereClause += ` AND activo = ?`;
                params.push(activo === 'true' ? 1 : 0);
            }

            const query = `
                SELECT * FROM proveedores 
                ${whereClause}
                ORDER BY ${orderBy} ${orderDir}
                LIMIT ? OFFSET ?
            `;

            const [proveedores] = await db.query(query, [...params, limit, offset]);

            return proveedores.map(proveedor => new Proveedor(proveedor));
        } catch (error) {
            logger.error('Error obteniendo todos los proveedores:', error);
            throw error;
        }
    }

    // Contar proveedores activos
    static async countActivos() {
        try {
            const [resultado] = await db.query(
                'SELECT COUNT(*) as count FROM proveedores WHERE activo = 1'
            );
            return resultado[0].count;
        } catch (error) {
            logger.error('Error contando proveedores activos:', error);
            throw error;
        }
    }

    // Buscar proveedores por término
    static async search(termino, limit = 10) {
        try {
            const [proveedores] = await db.query(`
                SELECT proveedorId, razonSocial, cuit, telefono, email, activo
                FROM proveedores 
                WHERE (razonSocial LIKE ? OR cuit LIKE ?) AND activo = 1
                ORDER BY razonSocial ASC
                LIMIT ?
            `, [`%${termino}%`, `%${termino}%`, limit]);

            return proveedores.map(proveedor => new Proveedor(proveedor));
        } catch (error) {
            logger.error('Error en búsqueda de proveedores:', error);
            throw error;
        }
    }

    // Validar CUIT único
    static async validateCuitUnique(cuit, excludeId = null) {
        try {
            let query = 'SELECT COUNT(*) as count FROM proveedores WHERE cuit = ? AND activo = 1';
            let params = [cuit];

            if (excludeId) {
                query += ' AND proveedorId != ?';
                params.push(excludeId);
            }

            const [resultado] = await db.query(query, params);
            return resultado[0].count === 0;
        } catch (error) {
            logger.error('Error validando CUIT único:', error);
            throw error;
        }
    }

    // Obtener resumen de compras por proveedor
    static async getResumenCompras(filters = {}) {
        try {
            const { mes, año, limit = 10 } = filters;
            
            let fechaCondicion = '';
            let params = [];

            if (mes && año) {
                fechaCondicion = 'AND MONTH(mm.fecha_movimiento) = ? AND YEAR(mm.fecha_movimiento) = ?';
                params.push(mes, año);
            }

            const [resumen] = await db.query(`
                SELECT 
                    p.proveedorId,
                    p.razonSocial,
                    p.cuit,
                    COUNT(mm.id) as total_compras,
                    SUM(mm.cantidad * mm.precio_unitario) as monto_total,
                    AVG(mm.cantidad * mm.precio_unitario) as promedio_compra
                FROM proveedores p
                LEFT JOIN movimientos_mercaderias mm ON p.proveedorId = mm.proveedor_id 
                    AND mm.tipo_movimiento = 'COMPRA' ${fechaCondicion}
                WHERE p.activo = 1
                GROUP BY p.proveedorId, p.razonSocial, p.cuit
                HAVING total_compras > 0
                ORDER BY monto_total DESC
                LIMIT ?
            `, [...params, limit]);

            return resumen;
        } catch (error) {
            logger.error('Error obteniendo resumen de compras por proveedor:', error);
            throw error;
        }
    }

    // =============================================
    // MÉTODOS DE UTILIDAD
    // =============================================

    // Convertir a objeto plano
    toJSON() {
        return {
            proveedorId: this.proveedorId,
            razonSocial: this.razonSocial,
            cuit: this.cuit,
            telefono: this.telefono,
            email: this.email,
            domicilio: this.domicilio,
            activo: this.activo,
            fecha_creacion: this.fecha_creacion,
            ultima_modificacion: this.ultima_modificacion
        };
    }

    // Validar datos del proveedor
    validate() {
        const errors = [];

        if (!this.razonSocial || this.razonSocial.trim().length === 0) {
            errors.push('La razón social es requerida');
        }

        if (this.razonSocial && this.razonSocial.length > 255) {
            errors.push('La razón social no puede exceder 255 caracteres');
        }

        if (this.cuit && !/^\d{11}$/.test(this.cuit.replace(/[-\s]/g, ''))) {
            errors.push('El CUIT debe tener 11 dígitos');
        }

        if (this.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email)) {
            errors.push('El email no tiene un formato válido');
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }
}

module.exports = Proveedor;