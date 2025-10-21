// =============================================
// controllers/ProveedoresController.js - Controlador de Proveedores COMPLETO
// =============================================
const db = require('../config/database');
const logger = require('../config/logger');

class ProveedoresController {
    
    // GET /api/v1/proveedores - Listar todos los proveedores
    async index(req, res) {
        try {
            const { activo, busqueda, limit = 50, offset = 0 } = req.query;

            let whereConditions = [];
            let queryParams = [];

            // Filtro por estado activo
            if (activo !== undefined) {
                whereConditions.push('activo = ?');
                queryParams.push(activo === 'true' ? 1 : 0);
            }

            // Filtro de búsqueda
            if (busqueda) {
                whereConditions.push(`(
                    razonSocial LIKE ? OR 
                    cuit LIKE ? OR 
                    email LIKE ? OR 
                    contacto LIKE ? OR
                    localidad LIKE ? OR
                    provincia LIKE ?
                )`);
                const searchTerm = `%${busqueda}%`;
                queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
            }

            const whereClause = whereConditions.length > 0 
                ? `WHERE ${whereConditions.join(' AND ')}` 
                : '';

            // Query principal con TODOS los campos
            const query = `
                SELECT proveedorId, razonSocial, cuit, telefono, email, domicilio,
                       condicionIVA, localidad, provincia, codigoPostal, 
                       contacto, sitioWeb, activo, fecha_creacion, ultima_modificacion
                FROM proveedores 
                ${whereClause}
                ORDER BY razonSocial ASC
                LIMIT ? OFFSET ?
            `;

            queryParams.push(parseInt(limit), parseInt(offset));
            const proveedores = await db.query(query, queryParams);

            // Contar total para paginación
            const countQuery = `
                SELECT COUNT(*) as total 
                FROM proveedores 
                ${whereClause}
            `;
            const countParams = queryParams.slice(0, -2); // Quitar LIMIT y OFFSET
            const totalResult = await db.query(countQuery, countParams);
            const total = Array.isArray(totalResult) ? totalResult[0].total : totalResult.total;

            res.json({
                success: true,
                data: proveedores,
                pagination: {
                    total,
                    limit: parseInt(limit),
                    offset: parseInt(offset),
                    pages: Math.ceil(total / parseInt(limit))
                }
            });
        } catch (error) {
            logger.error('Error en index proveedores:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener proveedores',
                error: error.message
            });
        }
    }

    // GET /api/v1/proveedores/:id - Obtener proveedor por ID
    async show(req, res) {
        try {
            const { id } = req.params;

            const proveedor = await db.query(`
                SELECT proveedorId, razonSocial, cuit, telefono, email, domicilio,
                       condicionIVA, localidad, provincia, codigoPostal, 
                       contacto, sitioWeb, activo, fecha_creacion, ultima_modificacion
                FROM proveedores 
                WHERE proveedorId = ?
            `, [id]);

            if (!proveedor || (Array.isArray(proveedor) && proveedor.length === 0)) {
                return res.status(404).json({
                    success: false,
                    message: 'Proveedor no encontrado'
                });
            }

            res.json({
                success: true,
                data: Array.isArray(proveedor) ? proveedor[0] : proveedor
            });
        } catch (error) {
            logger.error('Error en show proveedor:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener proveedor',
                error: error.message
            });
        }
    }


    // POST /api/v1/proveedores - Crear nuevo proveedor
   // POST /api/v1/proveedores - Crear nuevo proveedor
    async create(req, res) {
        try {
            const { 
                razonSocial, 
                cuit, 
                telefono, 
                email, 
                domicilio,
                // ✅ NUEVOS CAMPOS AGREGADOS:
                condicionIVA,
                localidad,
                provincia,
                codigoPostal,
                contacto,
                sitioWeb
            } = req.body;

            // Validaciones básicas - campos requeridos
            if (!razonSocial) {
                return res.status(400).json({
                    success: false,
                    message: 'La razón social es requerida'
                });
            }

            if (!condicionIVA) {
                return res.status(400).json({
                    success: false,
                    message: 'La condición IVA es requerida'
                });
            }

            if (!localidad) {
                return res.status(400).json({
                    success: false,
                    message: 'La localidad es requerida'
                });
            }

            if (!provincia) {
                return res.status(400).json({
                    success: false,
                    message: 'La provincia es requerida'
                });
            }

            if (!codigoPostal) {
                return res.status(400).json({
                    success: false,
                    message: 'El código postal es requerido'
                });
            }

            if (!contacto) {
                return res.status(400).json({
                    success: false,
                    message: 'El contacto es requerido'
                });
            }

            /*if (!sitioWeb) {
                return res.status(400).json({
                    success: false,
                    message: 'El sitio web es requerido'
                });
            }*/

            // Verificar CUIT único si se proporciona
            if (cuit) {
                const existeResult = await db.query(
                    'SELECT proveedorId FROM proveedores WHERE cuit = ? AND activo = 1',
                    [cuit]
                );
                
                let existeProveedor;
                if (Array.isArray(existeResult)) {
                    existeProveedor = existeResult[0];
                } else {
                    existeProveedor = existeResult;
                }

                if (existeProveedor && existeProveedor.length > 0) {
                    return res.status(400).json({
                        success: false,
                        message: 'Ya existe un proveedor con ese CUIT'
                    });
                }
            }

            // Preparar datos del proveedor - TODOS LOS CAMPOS
            const proveedorData = {
                razonSocial,
                cuit: cuit || null,
                telefono: telefono || null,
                email: email || null,
                domicilio: domicilio || null,
                condicionIVA,
                localidad,
                provincia,
                codigoPostal,
                contacto,
                sitioWeb,
                activo: 1
            };

            // Insertar en la base de datos con TODOS los campos
            const insertResult = await db.query(
                `INSERT INTO proveedores (
                    razonSocial, cuit, telefono, email, domicilio, 
                    condicionIVA, localidad, provincia, codigoPostal, 
                    contacto, sitioWeb, activo
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    proveedorData.razonSocial,
                    proveedorData.cuit,
                    proveedorData.telefono,
                    proveedorData.email,
                    proveedorData.domicilio,
                    proveedorData.condicionIVA,
                    proveedorData.localidad,
                    proveedorData.provincia,
                    proveedorData.codigoPostal,
                    proveedorData.contacto,
                    proveedorData.sitioWeb,
                    proveedorData.activo
                ]
            );

            // Obtener el ID del proveedor creado
            let proveedorId;
            if (insertResult.insertId) {
                proveedorId = insertResult.insertId;
            } else if (Array.isArray(insertResult) && insertResult[0] && insertResult[0].insertId) {
                proveedorId = insertResult[0].insertId;
            } else {
                throw new Error('No se pudo obtener el ID del proveedor creado');
            }

            // Obtener el proveedor completo creado
            const nuevoProveedor = await db.query(
                'SELECT * FROM proveedores WHERE proveedorId = ?',
                [proveedorId]
            );

            const proveedorCompleto = Array.isArray(nuevoProveedor) ? nuevoProveedor[0] : nuevoProveedor;

            logger.info('Proveedor creado exitosamente:', { proveedorId });

            res.status(201).json({
                success: true,
                message: 'Proveedor creado exitosamente',
                data: proveedorCompleto
            });
        } catch (error) {
            logger.error('Error en create proveedor:', error);
            res.status(500).json({
                success: false,
                message: 'Error al crear proveedor',
                error: error.message
            });
        }
    }


    // PUT /api/v1/proveedores/:id - Actualizar proveedor
    async update(req, res) {
        try {
            const { id } = req.params;
            const { 
                razonSocial, 
                cuit, 
                telefono, 
                email, 
                domicilio, 
                // ✅ NUEVOS CAMPOS AGREGADOS:
                condicionIVA,
                localidad,
                provincia,
                codigoPostal,
                contacto,
                sitioWeb,
                activo 
            } = req.body;

            console.log(`✏️ Actualizando proveedor ID: ${id}`);

            // Verificar que el proveedor existe
            const existing = await db.query(`
                SELECT proveedorId FROM proveedores WHERE proveedorId = ?
            `, [id]);

            if (existing.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Proveedor no encontrado'
                });
            }

            // Verificar CUIT único si se modifica
            if (cuit) {
                const duplicate = await db.query(`
                    SELECT proveedorId FROM proveedores 
                    WHERE cuit = ? AND proveedorId != ? AND activo = 1
                `, [cuit, id]);

                if (duplicate.length > 0) {
                    return res.status(400).json({
                        success: false,
                        message: 'Ya existe otro proveedor con ese CUIT'
                    });
                }
            }

            // Preparar campos para actualizar
            let campos = [];
            let valores = [];

            if (razonSocial !== undefined) {
                campos.push('razonSocial = ?');
                valores.push(razonSocial);
            }

            if (cuit !== undefined) {
                campos.push('cuit = ?');
                valores.push(cuit);
            }

            if (telefono !== undefined) {
                campos.push('telefono = ?');
                valores.push(telefono);
            }

            if (email !== undefined) {
                campos.push('email = ?');
                valores.push(email);
            }

            if (domicilio !== undefined) {
                campos.push('domicilio = ?');
                valores.push(domicilio);
            }

            // ✅ NUEVOS CAMPOS:
            if (condicionIVA !== undefined) {
                campos.push('condicionIVA = ?');
                valores.push(condicionIVA);
            }

            if (localidad !== undefined) {
                campos.push('localidad = ?');
                valores.push(localidad);
            }

            if (provincia !== undefined) {
                campos.push('provincia = ?');
                valores.push(provincia);
            }

            if (codigoPostal !== undefined) {
                campos.push('codigoPostal = ?');
                valores.push(codigoPostal);
            }

            if (contacto !== undefined) {
                campos.push('contacto = ?');
                valores.push(contacto);
            }

            if (sitioWeb !== undefined) {
                campos.push('sitioWeb = ?');
                valores.push(sitioWeb);
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
            campos.push('ultima_modificacion = CURRENT_TIMESTAMP');
            valores.push(id);

            // Ejecutar actualización
            const updateQuery = `
                UPDATE proveedores 
                SET ${campos.join(', ')} 
                WHERE proveedorId = ?
            `;

            await db.query(updateQuery, valores);

            // Obtener proveedor actualizado
            const proveedorActualizado = await db.query(
                'SELECT * FROM proveedores WHERE proveedorId = ?',
                [id]
            );

            logger.info('Proveedor actualizado exitosamente:', { proveedorId: id });

            res.json({
                success: true,
                message: 'Proveedor actualizado exitosamente',
                data: Array.isArray(proveedorActualizado) ? proveedorActualizado[0] : proveedorActualizado
            });
        } catch (error) {
            logger.error('Error en update proveedor:', error);
            res.status(500).json({
                success: false,
                message: 'Error al actualizar proveedor',
                error: error.message
            });
        }
    }

    // DELETE /api/v1/proveedores/:id - Eliminar proveedor (desactivar)
    async destroy(req, res) {
        try {
            const { id } = req.params;

            // Verificar si el proveedor existe
            const [proveedor] = await db.query(
                'SELECT * FROM proveedores WHERE proveedorId = ?',
                [id]
            );

            if (!proveedor || proveedor.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Proveedor no encontrado'
                });
            }

            // Verificar si tiene compras asociadas
            const [tieneCompras] = await db.query(
                'SELECT COUNT(*) as count FROM recepciones_mercaderia WHERE proveedor_id = ?',
                [id]
            );

            if (tieneCompras.count > 0) {
                // No eliminar fÃ­sicamente, solo desactivar
                await db.query(
                    'UPDATE proveedores SET activo = 0 WHERE proveedorId = ?',
                    [id]
                );

                return res.json({
                    success: true,
                    message: 'Proveedor desactivado (tiene historial de compras)'
                });
            }

            // Si no tiene compras, se puede eliminar fÃ­sicamente
            await db.query('DELETE FROM proveedores WHERE proveedorId = ?', [id]);

            res.json({
                success: true,
                message: 'Proveedor eliminado exitosamente'
            });
        } catch (error) {
            logger.error('Error en destroy proveedor:', error);
            res.status(500).json({
                success: false,
                message: 'Error al eliminar proveedor',
                error: error.message
            });
        }
    }
    // PUT /api/v1/proveedores/:id/toggle-active - Activar/Desactivar proveedor
    async toggleActive(req, res) {
        try {
            const { id } = req.params;
            const { activo } = req.body;

            // Verificar que el proveedor existe
            const [proveedor] = await db.query(
                'SELECT * FROM proveedores WHERE proveedorId = ?',
                [id]
            );

            if (!proveedor || proveedor.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Proveedor no encontrado'
                });
            }

            await db.query(
                'UPDATE proveedores SET activo = ? WHERE proveedorId = ?',
                [activo ? 1 : 0, id]
            );

            res.json({
                success: true,
                message: `Proveedor ${activo ? 'activado' : 'desactivado'} exitosamente`
            });
        } catch (error) {
            logger.error('Error cambiando estado del proveedor:', error);
            res.status(500).json({
                success: false,
                message: 'Error cambiando estado del proveedor',
                error: error.message
            });
        }
    }

    // GET /api/v1/proveedores/buscar/:termino - Búsqueda por razón social o CUIT
    async buscar(req, res) {
        try {
            const { termino } = req.params;
            const { limit = 10 } = req.query;

            const [proveedores] = await db.query(`
                SELECT proveedorId, razonSocial, cuit, telefono, email, activo
                FROM proveedores 
                WHERE (razonSocial LIKE ? OR cuit LIKE ?) AND activo = 1
                ORDER BY razonSocial ASC
                LIMIT ?
            `, [`%${termino}%`, `%${termino}%`, parseInt(limit)]);

            res.json({
                success: true,
                data: proveedores
            });
        } catch (error) {
            logger.error('Error en búsqueda de proveedores:', error);
            res.status(500).json({
                success: false,
                message: 'Error en búsqueda de proveedores',
                error: error.message
            });
        }
    }

    // GET /api/v1/proveedores/cuit/:cuit - Buscar por CUIT específico
    async getByCuit(req, res) {
        try {
            const { cuit } = req.params;

            const [proveedor] = await db.query(
                'SELECT * FROM proveedores WHERE cuit = ? AND activo = 1',
                [cuit]
            );

            if (!proveedor || proveedor.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Proveedor no encontrado con ese CUIT'
                });
            }

            res.json({
                success: true,
                data: proveedor[0]
            });
        } catch (error) {
            logger.error('Error buscando proveedor por CUIT:', error);
            res.status(500).json({
                success: false,
                message: 'Error buscando proveedor por CUIT',
                error: error.message
            });
        }
    }

    // GET /api/v1/proveedores/:id/estadisticas - Estadísticas del proveedor
    async getEstadisticas(req, res) {
        try {
            const { id } = req.params;
            const { mes, año } = req.query;

            let fechaCondicion = '';
            let params = [id];

            if (mes && año) {
                fechaCondicion = 'AND MONTH(fecha_movimiento) = ? AND YEAR(fecha_movimiento) = ?';
                params.push(mes, año);
            }

            // Estadísticas de compras
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

            // Top productos comprados
            const [topProductos] = await db.query(`
                SELECT 
                    m.descripcion,
                    m.codigo_sku,
                    SUM(mm.cantidad) as cantidad_total,
                    SUM(mm.cantidad * mm.precio_unitario) as monto_total
                FROM movimientos_mercaderias mm
                INNER JOIN mercaderias m ON mm.mercaderia_id = m.id
                WHERE mm.proveedor_id = ? AND mm.tipo_movimiento = 'COMPRA' ${fechaCondicion}
                GROUP BY m.id, m.descripcion, m.codigo_sku
                ORDER BY cantidad_total DESC
                LIMIT 5
            `, params);

            res.json({
                success: true,
                data: {
                    resumen: estadisticas[0],
                    top_productos: topProductos
                }
            });
        } catch (error) {
            logger.error('Error obteniendo estadísticas del proveedor:', error);
            res.status(500).json({
                success: false,
                message: 'Error obteniendo estadísticas del proveedor',
                error: error.message
            });
        }
    }

    // GET /api/v1/proveedores/:id/compras - Historial de compras del proveedor
    async getCompras(req, res) {
        try {
            const { id } = req.params;
            const { page = 1, limit = 10 } = req.query;
            const offset = (page - 1) * limit;

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
            `, [id, parseInt(limit), offset]);

            // Contar total
            const [totalCount] = await db.query(`
                SELECT COUNT(*) as total 
                FROM movimientos_mercaderias 
                WHERE proveedor_id = ? AND tipo_movimiento = 'COMPRA'
            `, [id]);

            const total = totalCount[0].total;

            res.json({
                success: true,
                data: compras,
                pagination: {
                    current_page: parseInt(page),
                    per_page: parseInt(limit),
                    total: total,
                    total_pages: Math.ceil(total / limit)
                }
            });
        } catch (error) {
            logger.error('Error obteniendo compras del proveedor:', error);
            res.status(500).json({
                success: false,
                message: 'Error obteniendo compras del proveedor',
                error: error.message
            });
        }
    }

    // GET /api/v1/proveedores/activos/count - Contar proveedores activos
    async getProveedoresActivos(req, res) {
        try {
            const [resultado] = await db.query(
                'SELECT COUNT(*) as count FROM proveedores WHERE activo = 1'
            );

            res.json({
                success: true,
                data: {
                    proveedores_activos: resultado[0].count
                }
            });
        } catch (error) {
            logger.error('Error contando proveedores activos:', error);
            res.status(500).json({
                success: false,
                message: 'Error contando proveedores activos',
                error: error.message
            });
        }
    }

    // =============================================
    // NUEVOS MÉTODOS PARA COMPRAS
    // =============================================

    // GET /api/v1/proveedores/:id/mercaderias - Obtener mercaderías por proveedor
    async getMercaderias(req, res) {
        try {
            const proveedorId = req.params.id;
            
            const mercaderias = await db.query(`
                SELECT 
                    m.id as mercaderia_id,
                    m.codigo_sku,
                    m.descripcion,
                    m.precio_costo,
                    m.precio_venta,
                    mp.precio_compra,
                    mp.codigo_producto_proveedor,
                    mp.tiempo_entrega_dias,
                    mp.cantidad_minima_pedido,
                    mp.descuento_porcentaje,
                    mp.condiciones_pago,
                    mp.es_proveedor_principal,
                    mp.observaciones,
                    c.categoria as categoria_nombre
                FROM mercaderias m
                INNER JOIN mercaderia_proveedores mp ON m.id = mp.mercaderia_id
                LEFT JOIN categorias c ON m.id_categoria = c.id
                WHERE mp.proveedor_id = ? 
                AND mp.activo = 1 
                AND m.activo = 1
                ORDER BY mp.es_proveedor_principal DESC, m.descripcion ASC
            `, [proveedorId]);
            
            res.json({
                success: true,
                data: mercaderias,
                total: mercaderias.length
            });
            
        } catch (error) {
            logger.error('Error obteniendo mercaderías del proveedor:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener mercaderías del proveedor',
                error: error.message
            });
        }
    }

    // GET /api/v1/proveedores/:id/info-compras - Información para compras
    async getInfoCompras(req, res) {
        try {
            const proveedorId = req.params.id;
            
            const [proveedor] = await db.query(`
                SELECT 
                    p.*,
                    COUNT(mp.mercaderia_id) as total_productos,
                    AVG(mp.tiempo_entrega_dias) as promedio_entrega,
                    (SELECT COUNT(*) FROM ordenes_compra WHERE proveedor_id = p.proveedorId 
                     AND fecha_orden >= DATE_SUB(NOW(), INTERVAL 6 MONTH)) as compras_ultimos_6_meses
                FROM proveedores p
                LEFT JOIN mercaderia_proveedores mp ON p.proveedorId = mp.proveedor_id AND mp.activo = 1
                WHERE p.proveedorId = ?
                GROUP BY p.proveedorId
            `, [proveedorId]);
            
            if (!proveedor || proveedor.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Proveedor no encontrado'
                });
            }
            
            res.json({
                success: true,
                data: proveedor[0]
            });
            
        } catch (error) {
            logger.error('Error obteniendo información del proveedor:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener información del proveedor',
                error: error.message
            });
        }
    }
}

module.exports = new ProveedoresController();