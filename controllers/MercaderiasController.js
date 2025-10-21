// =============================================
// controllers/MercaderiasController.js - VERSIÓN COMPLETA
// =============================================
const Mercaderia = require('../models/Mercaderia');
const logger = require('../config/logger');
const db = require('../config/database');

class MercaderiasController {
    
    // =============================================
    // CRUD BÁSICO
    // =============================================
    
    // GET /api/v1/mercaderias - Listar todas las mercaderías con filtros
    async index(req, res) {
        try {
            const filters = {
                activo: req.query.activo,
                categoria_id: req.query.id_categoria,
                busqueda: req.query.busqueda,
                solo_con_stock: req.query.solo_con_stock === 'true',
                solo_sin_stock: req.query.solo_sin_stock === 'true',
                order_by: req.query.order_by || 'descripcion',
                order_direction: req.query.order_direction || 'ASC',
                limit: req.query.limit,
                offset: req.query.offset
            };

            // Limpiar filtros vacíos
            Object.keys(filters).forEach(key => {
                if (filters[key] === undefined || filters[key] === null || filters[key] === '') {
                    delete filters[key];
                }
            });

            logger.info('Obteniendo mercaderías con filtros:', filters);

            const mercaderias = await Mercaderia.findWithFilters(filters);

            res.json({
                success: true,
                data: mercaderias,
                total: mercaderias.length,
                filters_applied: filters
            });

        } catch (error) {
            logger.error('Error en index de mercaderías:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener mercaderías',
                error: error.message
            });
        }
    }

    // GET /api/v1/mercaderias/:id - Obtener mercadería por ID
    async show(req, res) {
        try {
            const { id } = req.params;
            
            if (!id || isNaN(parseInt(id))) {
                return res.status(400).json({
                    success: false,
                    message: 'ID de mercadería inválido'
                });
            }

            logger.info(`Buscando mercadería con ID: ${id}`);
            
            const mercaderia = await Mercaderia.findById(id);
            
            if (!mercaderia) {
                return res.status(404).json({
                    success: false,
                    message: 'Mercadería no encontrada'
                });
            }

            res.json({
                success: true,
                data: mercaderia
            });

        } catch (error) {
            logger.error('Error en show:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener mercadería',
                error: error.message
            });
        }
    }

    // GET /api/v1/mercaderias/buscar-con-stock
async buscarConStock(req, res) {
    try {
        const { q: termino, deposito_id } = req.query;
        
        if (!termino || termino.length < 2) {
            return res.json({ success: true, data: [] });
        }
        
        const mercaderias = await Mercaderia.buscarConStockDeposito(termino, deposito_id);
        res.json({ success: true, data: mercaderias });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error al buscar mercaderías'
        });
    }
}

    // POST /api/v1/mercaderias - Crear nueva mercadería
    async create(req, res) {
        try {
            const data = req.body;
            
            // Validaciones básicas
            if (!data.descripcion || data.descripcion.trim() === '') {
                return res.status(400).json({
                    success: false,
                    message: 'La descripción es requerida'
                });
            }

            if (!data.codigo_sku || data.codigo_sku.trim() === '') {
                return res.status(400).json({
                    success: false,
                    message: 'El código SKU es requerido'
                });
            }

            // Validaciones de precios
            if (data.precio_venta && (isNaN(parseFloat(data.precio_venta)) || parseFloat(data.precio_venta) < 0)) {
                return res.status(400).json({
                    success: false,
                    message: 'El precio de venta debe ser un número válido mayor o igual a 0'
                });
            }

            if (data.precio_costo && (isNaN(parseFloat(data.precio_costo)) || parseFloat(data.precio_costo) < 0)) {
                return res.status(400).json({
                    success: false,
                    message: 'El precio de costo debe ser un número válido mayor o igual a 0'
                });
            }

            logger.info('Creando nueva mercadería:', { 
                descripcion: data.descripcion, 
                codigo_sku: data.codigo_sku 
            });

            const mercaderia = await Mercaderia.create(data);

            res.status(201).json({
                success: true,
                message: 'Mercadería creada exitosamente',
                data: mercaderia
            });

        } catch (error) {
            logger.error('Error en create mercadería:', error);
            
            // Manejo específico de errores de base de datos
            if (error.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({
                    success: false,
                    message: 'El código SKU o Code 128 ya existe'
                });
            }

            if (error.code === 'ER_NO_REFERENCED_ROW_2') {
                return res.status(400).json({
                    success: false,
                    message: 'La categoría especificada no existe'
                });
            }

            res.status(400).json({
                success: false,
                message: error.message || 'Error al crear mercadería'
            });
        }
    }

    // PUT /api/v1/mercaderias/:id - Actualizar mercadería
    async update(req, res) {
        try {
            const { id } = req.params;
            const data = req.body;

            if (!id || isNaN(parseInt(id))) {
                return res.status(400).json({
                    success: false,
                    message: 'ID de mercadería inválido'
                });
            }

            // Validaciones de precios si se proporcionan
            if (data.precio_venta !== undefined && (isNaN(parseFloat(data.precio_venta)) || parseFloat(data.precio_venta) < 0)) {
                return res.status(400).json({
                    success: false,
                    message: 'El precio de venta debe ser un número válido mayor o igual a 0'
                });
            }

            if (data.precio_costo !== undefined && (isNaN(parseFloat(data.precio_costo)) || parseFloat(data.precio_costo) < 0)) {
                return res.status(400).json({
                    success: false,
                    message: 'El precio de costo debe ser un número válido mayor o igual a 0'
                });
            }

            // No permitir cambio de códigos únicos en actualización (opcional, según reglas de negocio)
            // delete data.codigo_sku;
            // delete data.codigo_code128;

            logger.info(`Actualizando mercadería ID: ${id}`, data);

            const mercaderia = await Mercaderia.update(id, data);
            
            if (!mercaderia) {
                return res.status(404).json({
                    success: false,
                    message: 'Mercadería no encontrada'
                });
            }

            res.json({
                success: true,
                message: 'Mercadería actualizada exitosamente',
                data: mercaderia
            });

        } catch (error) {
            logger.error('Error en update mercadería:', error);
            
            if (error.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({
                    success: false,
                    message: 'El código SKU o Code 128 ya existe'
                });
            }

            res.status(500).json({
                success: false,
                message: 'Error al actualizar mercadería',
                error: error.message
            });
        }
    }

    // DELETE /api/v1/mercaderias/:id - Eliminar mercadería (soft delete)
    async destroy(req, res) {
        try {
            const { id } = req.params;
            
            if (!id || isNaN(parseInt(id))) {
                return res.status(400).json({
                    success: false,
                    message: 'ID de mercadería inválido'
                });
            }

            logger.info(`Eliminando mercadería ID: ${id}`);
            
            // Soft delete: cambiar activo a 0
            const mercaderia = await Mercaderia.update(id, { activo: 0 });
            
            if (!mercaderia) {
                return res.status(404).json({
                    success: false,
                    message: 'Mercadería no encontrada'
                });
            }

            res.json({
                success: true,
                message: 'Mercadería eliminada exitosamente'
            });

        } catch (error) {
            logger.error('Error en destroy:', error);
            res.status(500).json({
                success: false,
                message: 'Error al eliminar mercadería',
                error: error.message
            });
        }
    }

    // =============================================
    // BÚSQUEDAS ESPECIALES
    // =============================================

    // GET /api/v1/mercaderias/buscar - Búsqueda dinámica de mercaderías
    async buscar(req, res) {
        try {
            const { q, limit = 10 } = req.query;
            
            if (!q || q.trim().length < 2) {
                return res.status(400).json({
                    success: false,
                    message: 'El término de búsqueda debe tener al menos 2 caracteres'
                });
            }

            const searchTerm = `%${q.trim()}%`;
            const exactTerm = q.trim();
            
            // Query SQL con sistema de relevancia para mejores resultados
            const sql = `
                SELECT 
                    id,
                    codigo_sku,
                    descripcion,
                    COALESCE(precio_costo, 0) as precio_costo,
                    COALESCE(precio_venta, 0) as precio_venta,
                    COALESCE(unidad_medida, '') as unidad_medida,
                    activo,
                    -- Campo de relevancia para ordenamiento
                    CASE 
                        WHEN codigo_sku = ? THEN 1          -- Coincidencia exacta en SKU (máxima prioridad)
                        WHEN codigo_sku LIKE ? THEN 2       -- SKU que contiene el término
                        WHEN descripcion LIKE ? THEN 3      -- Descripción que contiene el término
                        ELSE 4
                    END as relevancia
                FROM mercaderias 
                WHERE activo = 1 
                AND (
                    codigo_sku LIKE ? OR 
                    descripcion LIKE ?
                )
                ORDER BY relevancia ASC, descripcion ASC
                LIMIT ?
            `;

            const params = [
                exactTerm,      // Para relevancia - coincidencia exacta SKU
                searchTerm,     // Para relevancia - SKU que contiene
                searchTerm,     // Para relevancia - descripción que contiene  
                searchTerm,     // Para WHERE - código SKU
                searchTerm,     // Para WHERE - descripción
                parseInt(limit) // Para LIMIT
            ];

            logger.info(`Búsqueda de mercaderías: "${q}"`);

            const mercaderias = await db.query(sql, params);

            // Asegurar que sea array
            const results = Array.isArray(mercaderias) ? mercaderias : [];

            res.json({
                success: true,
                data: results,
                total: results.length,
                search_term: q,
                message: results.length > 0 
                    ? `Se encontraron ${results.length} mercaderías`
                    : 'No se encontraron mercaderías que coincidan con la búsqueda'
            });

        } catch (error) {
            logger.error('Error en búsqueda de mercaderías:', error);
            res.status(500).json({
                success: false,
                message: 'Error al buscar mercaderías',
                error: error.message,
                data: []
            });
        }
    }

    // GET /api/v1/mercaderias/sku/:sku - Buscar por SKU específico
    async getBySku(req, res) {
        try {
            const { sku } = req.params;
            
            if (!sku || sku.trim() === '') {
                return res.status(400).json({
                    success: false,
                    message: 'El código SKU es requerido'
                });
            }

            logger.info(`Buscando mercadería por SKU: ${sku}`);
            
            const sql = `
                SELECT * FROM mercaderias 
                WHERE codigo_sku = ? AND activo = 1
            `;
            
            const result = await db.query(sql, [sku.trim()]);
            const mercaderia = Array.isArray(result) && result.length > 0 ? result[0] : null;

            if (!mercaderia) {
                return res.status(404).json({
                    success: false,
                    message: 'Mercadería no encontrada con ese SKU'
                });
            }

            res.json({
                success: true,
                data: mercaderia
            });

        } catch (error) {
            logger.error('Error buscando por SKU:', error);
            res.status(500).json({
                success: false,
                message: 'Error al buscar mercadería por SKU',
                error: error.message
            });
        }
    }

    // =============================================
    // OPERACIONES ESPECIALES
    // =============================================

    // GET /api/v1/mercaderias/stock/bajo - Obtener mercaderías con stock bajo
    async getLowStock(req, res) {
        try {
            const { limite_critico = 0.5 } = req.query; // 50% del stock mínimo por defecto
            
            logger.info('Obteniendo mercaderías con stock bajo');

            const sql = `
                SELECT 
                    id,
                    codigo_sku,
                    descripcion,
                    stock_actual,
                    stock_minimo,
                    precio_venta,
                    unidad_medida,
                    CASE 
                        WHEN stock_actual = 0 THEN 'SIN_STOCK'
                        WHEN stock_actual <= (stock_minimo * ?) THEN 'CRITICO'
                        WHEN stock_actual <= stock_minimo THEN 'BAJO'
                        ELSE 'NORMAL'
                    END as nivel_stock
                FROM mercaderias 
                WHERE activo = 1 
                AND (stock_actual <= stock_minimo OR stock_actual = 0)
                ORDER BY 
                    CASE 
                        WHEN stock_actual = 0 THEN 1
                        WHEN stock_actual <= (stock_minimo * ?) THEN 2
                        ELSE 3
                    END,
                    descripcion
            `;

            const mercaderias = await db.query(sql, [limite_critico, limite_critico]);
            const results = Array.isArray(mercaderias) ? mercaderias : [];

            res.json({
                success: true,
                data: results,
                total: results.length,
                resumen: {
                    sin_stock: results.filter(m => m.nivel_stock === 'SIN_STOCK').length,
                    critico: results.filter(m => m.nivel_stock === 'CRITICO').length,
                    bajo: results.filter(m => m.nivel_stock === 'BAJO').length
                }
            });

        } catch (error) {
            logger.error('Error obteniendo stock bajo:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener mercaderías con stock bajo',
                error: error.message
            });
        }
    }

    // PUT /api/v1/mercaderias/:id/toggle-active - Activar/Desactivar mercadería
    async toggleActive(req, res) {
        try {
            const { id } = req.params;
            
            if (!id || isNaN(parseInt(id))) {
                return res.status(400).json({
                    success: false,
                    message: 'ID de mercadería inválido'
                });
            }

            logger.info(`Cambiando estado activo de mercadería ID: ${id}`);
            
            // Obtener estado actual
            const currentResult = await db.query('SELECT activo FROM mercaderias WHERE id = ?', [id]);
            
            if (!currentResult || currentResult.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Mercadería no encontrada'
                });
            }

            const currentState = currentResult[0].activo;
            const newState = currentState ? 0 : 1;
            
            // Actualizar estado
            const sql = `UPDATE mercaderias SET activo = ? WHERE id = ?`;
            await db.query(sql, [newState, id]);

            res.json({
                success: true,
                message: `Mercadería ${newState ? 'activada' : 'desactivada'} exitosamente`,
                data: { 
                    id: parseInt(id), 
                    activo: Boolean(newState),
                    estado_anterior: Boolean(currentState)
                }
            });

        } catch (error) {
            logger.error('Error cambiando estado de mercadería:', error);
            res.status(500).json({
                success: false,
                message: 'Error al cambiar estado de la mercadería',
                error: error.message
            });
        }
    }

    // POST /api/v1/mercaderias/:id/duplicar - Duplicar mercadería
    async duplicate(req, res) {
        try {
            const { id } = req.params;
            
            if (!id || isNaN(parseInt(id))) {
                return res.status(400).json({
                    success: false,
                    message: 'ID de mercadería inválido'
                });
            }

            logger.info(`Duplicando mercadería ID: ${id}`);
            
            // Obtener mercadería original
            const originalResult = await db.query('SELECT * FROM mercaderias WHERE id = ?', [id]);
            
            if (!originalResult || originalResult.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Mercadería no encontrada'
                });
            }

            const original = originalResult[0];
            const timestamp = Date.now();
            
            // Crear datos para el duplicado
            const duplicateData = {
                ...original,
                id: undefined, // Remover ID para que sea auto-increment
                codigo_sku: `${original.codigo_sku}_COPIA_${timestamp}`,
                codigo_code128: original.codigo_code128 ? `${original.codigo_code128}_CP${timestamp}` : null,
                descripcion: `${original.descripcion} (Copia)`,
                stock_actual: 0, // Reiniciar stock para la copia
                activo: 1, // Activar por defecto
                created_at: undefined,
                updated_at: undefined
            };

            const newMercaderia = await Mercaderia.create(duplicateData);

            res.status(201).json({
                success: true,
                message: 'Mercadería duplicada exitosamente',
                data: newMercaderia,
                original_id: parseInt(id)
            });

        } catch (error) {
            logger.error('Error duplicando mercadería:', error);
            
            if (error.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({
                    success: false,
                    message: 'Error: El código SKU generado ya existe. Intente nuevamente.'
                });
            }

            res.status(500).json({
                success: false,
                message: 'Error al duplicar mercadería',
                error: error.message
            });
        }
    }

    // =============================================
    // GESTIÓN DE IMÁGENES
    // =============================================

    // POST /api/v1/mercaderias/:id/imagen - Subir imagen
    async uploadImage(req, res) {
        try {
            const { id } = req.params;
            const { imagen } = req.body;

            if (!id || isNaN(parseInt(id))) {
                return res.status(400).json({
                    success: false,
                    message: 'ID de mercadería inválido'
                });
            }

            if (!imagen) {
                return res.status(400).json({
                    success: false,
                    message: 'Imagen requerida'
                });
            }

            // Validar formato base64
            if (!imagen.startsWith('data:image/')) {
                return res.status(400).json({
                    success: false,
                    message: 'Formato de imagen inválido. Use formato base64.'
                });
            }

            // Validar tamaño (máximo 5MB en base64)
            const sizeInBytes = (imagen.length * 3/4) - 2;
            const maxSize = 5 * 1024 * 1024; // 5MB
            
            if (sizeInBytes > maxSize) {
                return res.status(400).json({
                    success: false,
                    message: 'La imagen es demasiado grande. Máximo 5MB.'
                });
            }

            logger.info(`Subiendo imagen para mercadería ID: ${id}`);

            // Verificar que la mercadería existe
            const mercaderiaExists = await db.query('SELECT id FROM mercaderias WHERE id = ?', [id]);
            
            if (!mercaderiaExists || mercaderiaExists.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Mercadería no encontrada'
                });
            }

            // Actualizar imagen en la base de datos
            const sql = 'UPDATE mercaderias SET imagen = ? WHERE id = ?';
            await db.query(sql, [imagen, id]);

            // Obtener mercadería actualizada
            const updatedResult = await db.query('SELECT * FROM mercaderias WHERE id = ?', [id]);
            const mercaderia = updatedResult[0];

            res.json({
                success: true,
                message: 'Imagen subida exitosamente',
                data: mercaderia
            });

        } catch (error) {
            logger.error('Error en uploadImage:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Error al subir imagen'
            });
        }
    }

    // DELETE /api/v1/mercaderias/:id/imagen - Eliminar imagen
    async removeImage(req, res) {
        try {
            const { id } = req.params;

            if (!id || isNaN(parseInt(id))) {
                return res.status(400).json({
                    success: false,
                    message: 'ID de mercadería inválido'
                });
            }

            logger.info(`Eliminando imagen de mercadería ID: ${id}`);

            // Verificar que la mercadería existe
            const mercaderiaExists = await db.query('SELECT id FROM mercaderias WHERE id = ?', [id]);
            
            if (!mercaderiaExists || mercaderiaExists.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Mercadería no encontrada'
                });
            }

            // Eliminar imagen
            const sql = 'UPDATE mercaderias SET imagen = NULL WHERE id = ?';
            await db.query(sql, [id]);

            // Obtener mercadería actualizada
            const updatedResult = await db.query('SELECT * FROM mercaderias WHERE id = ?', [id]);
            const mercaderia = updatedResult[0];

            res.json({
                success: true,
                message: 'Imagen eliminada exitosamente',
                data: mercaderia
            });

        } catch (error) {
            logger.error('Error en removeImage:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Error al eliminar imagen'
            });
        }
    }

    // =============================================
    // MÉTODOS ADICIONALES DE UTILIDAD
    // =============================================

    // Obtener estadísticas generales
    async getStats(req, res) {
        try {
            logger.info('Obteniendo estadísticas de mercaderías');

            const statsQuery = `
                SELECT 
                    COUNT(*) as total_mercaderias,
                    COUNT(CASE WHEN activo = 1 THEN 1 END) as activas,
                    COUNT(CASE WHEN activo = 0 THEN 1 END) as inactivas,
                    COUNT(CASE WHEN stock_actual = 0 THEN 1 END) as sin_stock,
                    COUNT(CASE WHEN stock_actual <= stock_minimo THEN 1 END) as stock_bajo,
                    AVG(precio_venta) as precio_venta_promedio,
                    SUM(stock_actual * precio_costo) as valor_inventario_costo,
                    SUM(stock_actual * precio_venta) as valor_inventario_venta
                FROM mercaderias
                WHERE activo = 1
            `;

            const stats = await db.query(statsQuery);
            const result = stats[0] || {};

            res.json({
                success: true,
                data: {
                    total_mercaderias: result.total_mercaderias || 0,
                    activas: result.activas || 0,
                    inactivas: result.inactivas || 0,
                    sin_stock: result.sin_stock || 0,
                    stock_bajo: result.stock_bajo || 0,
                    precio_venta_promedio: parseFloat(result.precio_venta_promedio || 0).toFixed(2),
                    valor_inventario_costo: parseFloat(result.valor_inventario_costo || 0).toFixed(2),
                    valor_inventario_venta: parseFloat(result.valor_inventario_venta || 0).toFixed(2)
                }
            });

        } catch (error) {
            logger.error('Error obteniendo estadísticas:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener estadísticas',
                error: error.message
            });
        }
    }
}

// Exportar una instancia de la clase para usar directamente en las rutas
const mercaderiasController = new MercaderiasController();

module.exports = mercaderiasController;