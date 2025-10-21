// =============================================
// models/BaseModel.js - Modelo Base Completo para CRUD
// =============================================
const db = require('../config/database');
const logger = require('../config/logger');

class BaseModel {
    constructor(tableName, primaryKey = 'id') {
        this.tableName = tableName;
        this.primaryKey = primaryKey;
    }

    // Encontrar todos los registros
    async findAll(conditions = {}, orderBy = null, limit = null) {
        try {
            let sql = `SELECT * FROM ${this.tableName}`;
            const params = [];

            // Agregar condiciones WHERE
            if (Object.keys(conditions).length > 0) {
                const whereClause = Object.keys(conditions)
                    .map(key => `${key} = ?`)
                    .join(' AND ');
                sql += ` WHERE ${whereClause}`;
                params.push(...Object.values(conditions));
            }

            // Agregar ORDER BY
            if (orderBy) {
                sql += ` ORDER BY ${orderBy}`;
            }

            // Agregar LIMIT
            if (limit) {
                sql += ` LIMIT ${limit}`;
            }

            const rows = await db.query(sql, params);
            return rows;
        } catch (error) {
            logger.error(`Error en findAll para ${this.tableName}:`, error);
            throw error;
        }
    }

    // Encontrar por ID
    async findById(id) {
        try {
            const sql = `SELECT * FROM ${this.tableName} WHERE ${this.primaryKey} = ?`;
            const rows = await db.query(sql, [id]);
            return rows[0] || null;
        } catch (error) {
            logger.error(`Error en findById para ${this.tableName}:`, error);
            throw error;
        }
    }

    // Encontrar un registro con condiciones
    async findOne(conditions) {
        try {
            const whereClause = Object.keys(conditions)
                .map(key => `${key} = ?`)
                .join(' AND ');
            
            const sql = `SELECT * FROM ${this.tableName} WHERE ${whereClause} LIMIT 1`;
            const rows = await db.query(sql, Object.values(conditions));
            return rows[0] || null;
        } catch (error) {
            logger.error(`Error en findOne para ${this.tableName}:`, error);
            throw error;
        }
    }

    // Crear nuevo registro
    async create(data) {
        try {
            // Filtrar campos que no deben insertarse
            const filteredData = this.filterFields(data);
            
            const fields = Object.keys(filteredData);
            const placeholders = fields.map(() => '?').join(', ');
            const values = Object.values(filteredData);

            const sql = `INSERT INTO ${this.tableName} (${fields.join(', ')}) VALUES (${placeholders})`;
            
            const result = await db.query(sql, values);
            
            // Retornar el registro creado
            return await this.findById(result.insertId);
        } catch (error) {
            logger.error(`Error en create para ${this.tableName}:`, error);
            throw error;
        }
    }

    // Actualizar registro
    async update(id, data) {
        try {
            // Filtrar campos que no deben actualizarse
            const filteredData = this.filterFields(data, true);
            
            if (Object.keys(filteredData).length === 0) {
                throw new Error('No hay campos válidos para actualizar');
            }

            const setClause = Object.keys(filteredData)
                .map(key => `${key} = ?`)
                .join(', ');
            
            const values = [...Object.values(filteredData), id];
            
            const sql = `UPDATE ${this.tableName} SET ${setClause} WHERE ${this.primaryKey} = ?`;
            
            const result = await db.query(sql, values);
            
            if (result.affectedRows === 0) {
                return null; // No se encontró el registro
            }
            
            // Retornar el registro actualizado
            return await this.findById(id);
        } catch (error) {
            logger.error(`Error en update para ${this.tableName}:`, error);
            throw error;
        }
    }

    // Eliminar registro (hard delete)
    async delete(id) {
        try {
            const sql = `DELETE FROM ${this.tableName} WHERE ${this.primaryKey} = ?`;
            const result = await db.query(sql, [id]);
            
            return result.affectedRows > 0;
        } catch (error) {
            logger.error(`Error en delete para ${this.tableName}:`, error);
            throw error;
        }
    }

    // Soft delete (marcar como inactivo)
    async softDelete(id) {
        try {
            return await this.update(id, { activo: 0 });
        } catch (error) {
            logger.error(`Error en softDelete para ${this.tableName}:`, error);
            throw error;
        }
    }

    // Contar registros
    async count(conditions = {}) {
        try {
            let sql = `SELECT COUNT(*) as total FROM ${this.tableName}`;
            const params = [];

            if (Object.keys(conditions).length > 0) {
                const whereClause = Object.keys(conditions)
                    .map(key => `${key} = ?`)
                    .join(' AND ');
                sql += ` WHERE ${whereClause}`;
                params.push(...Object.values(conditions));
            }

            const result = await db.query(sql, params);
            return result[0].total;
        } catch (error) {
            logger.error(`Error en count para ${this.tableName}:`, error);
            throw error;
        }
    }

    // Verificar si existe un registro
    async exists(id) {
        try {
            const count = await this.count({ [this.primaryKey]: id });
            return count > 0;
        } catch (error) {
            logger.error(`Error en exists para ${this.tableName}:`, error);
            throw error;
        }
    }

    // Buscar con paginación
    async paginate(page = 1, limit = 10, conditions = {}, orderBy = null) {
        try {
            const offset = (page - 1) * limit;
            
            let sql = `SELECT * FROM ${this.tableName}`;
            const params = [];

            // Agregar condiciones WHERE
            if (Object.keys(conditions).length > 0) {
                const whereClause = Object.keys(conditions)
                    .map(key => `${key} = ?`)
                    .join(' AND ');
                sql += ` WHERE ${whereClause}`;
                params.push(...Object.values(conditions));
            }

            // Agregar ORDER BY
            if (orderBy) {
                sql += ` ORDER BY ${orderBy}`;
            }

            // Agregar LIMIT y OFFSET
            sql += ` LIMIT ? OFFSET ?`;
            params.push(limit, offset);

            const [data, total] = await Promise.all([
                db.query(sql, params),
                this.count(conditions)
            ]);

            return {
                data,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit),
                    hasNext: page < Math.ceil(total / limit),
                    hasPrev: page > 1
                }
            };
        } catch (error) {
            logger.error(`Error en paginate para ${this.tableName}:`, error);
            throw error;
        }
    }

    // Ejecutar consulta personalizada
    async customQuery(sql, params = []) {
        try {
            return await db.query(sql, params);
        } catch (error) {
            logger.error(`Error en customQuery para ${this.tableName}:`, error);
            throw error;
        }
    }

    // Filtrar campos válidos para INSERT/UPDATE
    filterFields(data, isUpdate = false) {
        const filtered = { ...data };
        
        // Campos que nunca deben incluirse
        const excludeAlways = [this.primaryKey, 'fecha_creacion'];
        
        // En actualizaciones, también excluir estos campos
        const excludeOnUpdate = isUpdate ? ['codigo_sku', 'ultima_modificacion'] : [];
        
        const excludeFields = [...excludeAlways, ...excludeOnUpdate];
        
        excludeFields.forEach(field => {
            delete filtered[field];
        });

        // Eliminar campos undefined o null
        Object.keys(filtered).forEach(key => {
            if (filtered[key] === undefined) {
                delete filtered[key];
            }
        });

        return filtered;
    }

    // Validar datos antes de insertar/actualizar
    validateData(data, isUpdate = false) {
        // Esta función puede ser sobrescrita en modelos específicos
        return true;
    }

    // Iniciar transacción
    async beginTransaction() {
        return await db.beginTransaction();
    }

    // Confirmar transacción
    async commit(connection) {
        return await db.commit(connection);
    }

    // Revertir transacción
    async rollback(connection) {
        return await db.rollback(connection);
    }

    // Ejecutar múltiples operaciones en transacción
    async transaction(operations) {
        const connection = await this.beginTransaction();
        
        try {
            const results = [];
            
            for (const operation of operations) {
                const result = await operation(connection);
                results.push(result);
            }
            
            await this.commit(connection);
            return results;
        } catch (error) {
            await this.rollback(connection);
            throw error;
        }
    }

    // Obtener esquema de la tabla
    async getTableSchema() {
        try {
            const sql = `DESCRIBE ${this.tableName}`;
            return await db.query(sql);
        } catch (error) {
            logger.error(`Error obteniendo esquema de ${this.tableName}:`, error);
            throw error;
        }
    }

    // Métodos de utilidad para logging
    logInfo(message, data = null) {
        logger.info(`${this.tableName}: ${message}`, data);
    }

    logError(message, error = null) {
        logger.error(`${this.tableName}: ${message}`, error);
    }

    logWarning(message, data = null) {
        logger.warn(`${this.tableName}: ${message}`, data);
    }
}

module.exports = BaseModel;