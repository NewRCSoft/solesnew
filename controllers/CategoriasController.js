// =============================================
// controllers/CategoriasController.js - CÓDIGO CORREGIDO
// =============================================
const db = require('../config/database'); // ✅ Usar pool centralizado como MercaderiasController
const logger = require('../config/logger');

class CategoriasController {
    // Listar todas las categorías
    async index(req, res) {
        try {
            console.log('📋 Obteniendo categorías...');
            
            const categorias = await db.query(`
                SELECT 
                    id,
                    categoria,
                    activo,
                    fecha_creacion,
                    ultima_modificacion
                FROM categorias 
                WHERE activo = 1 
                ORDER BY categoria ASC
            `);

            res.json({
                success: true,
                data: categorias,
                total: categorias.length
            });
        } catch (error) {
            console.error('❌ Error en index categorías:', error);
            if (logger) {
                logger.error('Error en index categorías:', error);
            }
            res.status(500).json({
                success: false,
                message: 'Error al obtener categorías',
                error: error.message
            });
        }
    }

    // Obtener categoría por ID
    async show(req, res) {
        try {
            const { id } = req.params;
            console.log(`🔍 Buscando categoría ID: ${id}`);
            
            const categorias = await db.query(`
                SELECT 
                    id,
                    categoria,
                    activo,
                    fecha_creacion,
                    ultima_modificacion
                FROM categorias 
                WHERE id = ?
            `, [id]);

            if (categorias.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Categoría no encontrada'
                });
            }

            res.json({
                success: true,
                data: categorias[0]
            });
        } catch (error) {
            console.error('❌ Error en show categoría:', error);
            if (logger) {
                logger.error('Error en show categoría:', error);
            }
            res.status(500).json({
                success: false,
                message: 'Error al obtener categoría',
                error: error.message
            });
        }
    }

    // Crear nueva categoría
    async create(req, res) {
        try {
            const { categoria } = req.body;
            console.log('📝 Creando categoría:', categoria);

            // Validación básica
            if (!categoria || categoria.trim() === '') {
                return res.status(400).json({
                    success: false,
                    message: 'La descripción es requerida'
                });
            }

            // Verificar si ya existe
            const existing = await db.query(`
                SELECT id FROM categorias 
                WHERE categoria = ? AND activo = 1
            `, [categoria.trim()]);

            if (existing.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Ya existe una categoría con esa descripción'
                });
            }

            // Crear categoría
            const result = await db.query(`
                INSERT INTO categorias (categoria, activo, fecha_creacion, ultima_modificacion) 
                VALUES (?, 1, NOW(), NOW())
            `, [categoria.trim()]);

            // Obtener la categoría creada
            const nuevaCategoria = await db.query(`
                SELECT 
                    id,
                    categoria,
                    activo,
                    fecha_creacion,
                    ultima_modificacion
                FROM categorias 
                WHERE id = ?
            `, [result.insertId]);

            res.status(201).json({
                success: true,
                message: 'Categoría creada exitosamente',
                data: nuevaCategoria[0]
            });
        } catch (error) {
            console.error('❌ Error en create categoría:', error);
            if (logger) {
                logger.error('Error en create categoría:', error);
            }
            res.status(500).json({
                success: false,
                message: 'Error al crear categoría',
                error: error.message
            });
        }
    }

    // Actualizar categoría
    async update(req, res) {
        try {
            const { id } = req.params;
            const { categoria, activo } = req.body;
            console.log(`✏️  Actualizando categoría ID: ${id}`);

            // Verificar que existe
            const existing = await db.query(`
                SELECT id FROM categorias WHERE id = ?
            `, [id]);

            if (existing.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Categoría no encontrada'
                });
            }

            // Preparar campos a actualizar
            let campos = [];
            let valores = [];

            if (categoria && categoria.trim() !== '') {
                // Verificar duplicado
                const duplicate = await db.query(`
                    SELECT id FROM categorias 
                    WHERE categoria = ? AND id != ? AND activo = 1
                `, [categoria.trim(), id]);

                if (duplicate.length > 0) {
                    return res.status(400).json({
                        success: false,
                        message: 'Ya existe otra categoría con esa descripción'
                    });
                }

                campos.push('categoria = ?');
                valores.push(categoria.trim());
            }

            if (activo !== undefined) {
                campos.push('activo = ?');
                valores.push(activo ? 1 : 0);
            }

            if (campos.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No hay campos para actualizar'
                });
            }

            // Agregar timestamp y ID
            campos.push('ultima_modificacion = NOW()');
            valores.push(id);

            // Ejecutar actualización
            const updateQuery = `
                UPDATE categorias 
                SET ${campos.join(', ')} 
                WHERE id = ?
            `;

            await db.query(updateQuery, valores);

            // Obtener categoría actualizada
            const categoriaActualizada = await db.query(`
                SELECT 
                    id,
                    categoria,
                    activo,
                    fecha_creacion,
                    ultima_modificacion
                FROM categorias 
                WHERE id = ?
            `, [id]);

            res.json({
                success: true,
                message: 'Categoría actualizada exitosamente',
                data: categoriaActualizada[0]
            });
        } catch (error) {
            console.error('❌ Error en update categoría:', error);
            if (logger) {
                logger.error('Error en update categoría:', error);
            }
            res.status(500).json({
                success: false,
                message: 'Error al actualizar categoría',
                error: error.message
            });
        }
    }

    // Eliminar categoría (soft delete)
    async destroy(req, res) {
        try {
            const { id } = req.params;
            console.log(`🗑️  Eliminando categoría ID: ${id}`);

            // Verificar que existe
            const existing = await db.query(`
                SELECT id FROM categorias WHERE id = ?
            `, [id]);

            if (existing.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Categoría no encontrada'
                });
            }

            // Verificar si hay mercaderías asociadas
            const mercaderias = await db.query(`
                SELECT COUNT(*) as count 
                FROM mercaderias 
                WHERE id_categoria = ? AND activo = 1
            `, [id]);

            if (mercaderias[0].count > 0) {
                return res.status(400).json({
                    success: false,
                    message: `No se puede eliminar. Hay ${mercaderias[0].count} mercaderías asociadas a esta categoría`
                });
            }

            // Soft delete
            await db.query(`
                UPDATE categorias 
                SET activo = 0, ultima_modificacion = NOW() 
                WHERE id = ?
            `, [id]);

            res.json({
                success: true,
                message: 'Categoría eliminada exitosamente'
            });
        } catch (error) {
            console.error('❌ Error en destroy categoría:', error);
            if (logger) {
                logger.error('Error en destroy categoría:', error);
            }
            res.status(500).json({
                success: false,
                message: 'Error al eliminar categoría',
                error: error.message
            });
        }
    }

    // Método adicional: obtener categorías con estadísticas
    async getWithStats(req, res) {
        try {
            console.log('📊 Obteniendo categorías con estadísticas...');
            
            const categorias = await db.query(`
                SELECT 
                    c.id,
                    c.categoria,
                    c.activo,
                    c.fecha_creacion,
                    c.ultima_modificacion,
                    COUNT(m.id) as total_mercaderias,
                    COUNT(CASE WHEN m.activo = 1 THEN 1 END) as mercaderias_activas
                FROM categorias c
                LEFT JOIN mercaderias m ON c.id = m.id_categoria
                WHERE c.activo = 1
                GROUP BY c.id, c.categoria, c.activo, c.fecha_creacion, c.ultima_modificacion
                ORDER BY c.categoria ASC
            `);

            res.json({
                success: true,
                data: categorias,
                total: categorias.length
            });
        } catch (error) {
            console.error('❌ Error en getWithStats categorías:', error);
            if (logger) {
                logger.error('Error en getWithStats categorías:', error);
            }
            res.status(500).json({
                success: false,
                message: 'Error al obtener estadísticas de categorías',
                error: error.message
            });
        }
    }

    // Método adicional: buscar categorías
    async search(req, res) {
        try {
            const { q } = req.query;
            
            if (!q || q.trim() === '') {
                return this.index(req, res);
            }

            console.log('🔍 Buscando categorías:', q);
            
            const categorias = await db.query(`
                SELECT 
                    id,
                    categoria,
                    activo,
                    fecha_creacion,
                    ultima_modificacion
                FROM categorias 
                WHERE activo = 1 
                AND categoria LIKE ?
                ORDER BY categoria ASC
            `, [`%${q.trim()}%`]);

            res.json({
                success: true,
                data: categorias,
                total: categorias.length,
                query: q.trim()
            });
        } catch (error) {
            console.error('❌ Error en search categorías:', error);
            if (logger) {
                logger.error('Error en search categorías:', error);
            }
            res.status(500).json({
                success: false,
                message: 'Error al buscar categorías',
                error: error.message
            });
        }
    }
}

// Exportar una instancia única del controlador
module.exports = new CategoriasController();