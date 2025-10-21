// =============================================
// controllers/ZonasController.js - Controlador de Zonas
// =============================================
const db = require('../config/database');

class ZonasController {
    
    // GET /api/v1/zonas - Listar todas las zonas
    async index(req, res) {
        try {
            const { search, activo, con_clientes } = req.query;

            let whereClause = 'WHERE 1=1';
            let params = [];

            if (activo !== undefined) {
                whereClause += ' AND z.activo = ?';
                params.push(activo === 'true' ? 1 : 0);
            }

            if (search) {
                whereClause += ' AND z.zona LIKE ?';
                params.push(`%${search}%`);
            }

            let sql = `
                SELECT 
                    z.zonaId,
                    z.zona,
                    z.activo,
                    z.fecha_creacion,
                    COUNT(c.clienteId) as clientes_count,
                    COUNT(CASE WHEN c.activo = 1 THEN 1 END) as clientes_activos_count
                FROM zonas z
                LEFT JOIN clientes c ON z.zonaId = c.zonaId
                ${whereClause}
                GROUP BY z.zonaId, z.zona, z.activo, z.fecha_creacion
            `;

            if (con_clientes === 'true') {
                sql += ' HAVING clientes_count > 0';
            }

            sql += ' ORDER BY z.zona ASC';

            const zonas = await db.query(sql, params);

            res.json({
                success: true,
                data: zonas,
                count: zonas.length
            });
        } catch (error) {
            console.error('Error en index zonas:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener zonas',
                error: error.message
            });
        }
    }

    // GET /api/v1/zonas/:id - Obtener zona específica
    async show(req, res) {
        try {
            const { id } = req.params;

            const [zona] = await db.query(`
                SELECT 
                    z.zonaId,
                    z.zona,
                    z.activo,
                    z.fecha_creacion,
                    COUNT(c.clienteId) as clientes_count,
                    COUNT(CASE WHEN c.activo = 1 THEN 1 END) as clientes_activos_count
                FROM zonas z
                LEFT JOIN clientes c ON z.zonaId = c.zonaId
                WHERE z.zonaId = ?
                GROUP BY z.zonaId, z.zona, z.activo, z.fecha_creacion
            `, [id]);

            if (!zona) {
                return res.status(404).json({
                    success: false,
                    message: 'Zona no encontrada'
                });
            }

            res.json({
                success: true,
                data: zona
            });
        } catch (error) {
            console.error('Error en show zona:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener zona',
                error: error.message
            });
        }
    }

    // POST /api/v1/zonas - Crear nueva zona
    async create(req, res) {
        try {
            const { zona, activo = 1 } = req.body;

            // Validaciones
            if (!zona || zona.trim().length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'El nombre de la zona es requerido'
                });
            }

            if (zona.trim().length < 2) {
                return res.status(400).json({
                    success: false,
                    message: 'El nombre de la zona debe tener al menos 2 caracteres'
                });
            }

            // Verificar si ya existe una zona con el mismo nombre
            const [zonaExistente] = await db.query(
                'SELECT zonaId FROM zonas WHERE zona = ? AND activo = 1',
                [zona.trim()]
            );

            if (zonaExistente) {
                return res.status(400).json({
                    success: false,
                    message: 'Ya existe una zona con ese nombre'
                });
            }

            // Crear la zona
            const result = await db.query(
                'INSERT INTO zonas (zona, activo) VALUES (?, ?)',
                [zona.trim(), activo ? 1 : 0]
            );

            // Obtener la zona creada
            const [nuevaZona] = await db.query(
                'SELECT * FROM zonas WHERE zonaId = ?',
                [result.insertId]
            );

            res.status(201).json({
                success: true,
                message: 'Zona creada exitosamente',
                data: nuevaZona
            });
        } catch (error) {
            console.error('Error en create zona:', error);
            res.status(500).json({
                success: false,
                message: 'Error al crear zona',
                error: error.message
            });
        }
    }

    // PUT /api/v1/zonas/:id - Actualizar zona
    async update(req, res) {
        try {
            const { id } = req.params;
            const { zona, activo } = req.body;

            // Verificar si la zona existe
            const [zonaExistente] = await db.query(
                'SELECT zonaId FROM zonas WHERE zonaId = ?',
                [id]
            );

            if (!zonaExistente) {
                return res.status(404).json({
                    success: false,
                    message: 'Zona no encontrada'
                });
            }

            // Validaciones si se está actualizando el nombre
            if (zona !== undefined) {
                if (!zona || zona.trim().length === 0) {
                    return res.status(400).json({
                        success: false,
                        message: 'El nombre de la zona es requerido'
                    });
                }

                if (zona.trim().length < 2) {
                    return res.status(400).json({
                        success: false,
                        message: 'El nombre de la zona debe tener al menos 2 caracteres'
                    });
                }

                // Verificar si ya existe otra zona con el mismo nombre
                const [otraZona] = await db.query(
                    'SELECT zonaId FROM zonas WHERE zona = ? AND zonaId != ?',
                    [zona.trim(), id]
                );

                if (otraZona) {
                    return res.status(400).json({
                        success: false,
                        message: 'Ya existe otra zona con ese nombre'
                    });
                }
            }

            // Construir query de actualización dinámico
            const updateFields = [];
            const updateValues = [];

            if (zona !== undefined) {
                updateFields.push('zona = ?');
                updateValues.push(zona.trim());
            }

            if (activo !== undefined) {
                updateFields.push('activo = ?');
                updateValues.push(activo ? 1 : 0);
            }

            if (updateFields.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No hay campos para actualizar'
                });
            }

            updateValues.push(id);

            await db.query(
                `UPDATE zonas SET ${updateFields.join(', ')} WHERE zonaId = ?`,
                updateValues
            );

            // Obtener la zona actualizada
            const [zonaActualizada] = await db.query(
                'SELECT * FROM zonas WHERE zonaId = ?',
                [id]
            );

            res.json({
                success: true,
                message: 'Zona actualizada exitosamente',
                data: zonaActualizada
            });
        } catch (error) {
            console.error('Error en update zona:', error);
            res.status(500).json({
                success: false,
                message: 'Error al actualizar zona',
                error: error.message
            });
        }
    }

    // DELETE /api/v1/zonas/:id - Eliminar zona
    async destroy(req, res) {
        try {
            const { id } = req.params;

            // Verificar si la zona existe
            const [zona] = await db.query(
                'SELECT zonaId FROM zonas WHERE zonaId = ?',
                [id]
            );

            if (!zona) {
                return res.status(404).json({
                    success: false,
                    message: 'Zona no encontrada'
                });
            }

            // Verificar si tiene clientes asignados
            const [clientesAsignados] = await db.query(
                'SELECT COUNT(*) as count FROM clientes WHERE zonaId = ? AND activo = 1',
                [id]
            );

            if (clientesAsignados.count > 0) {
                return res.status(400).json({
                    success: false,
                    message: `No se puede eliminar la zona porque tiene ${clientesAsignados.count} cliente(s) asignado(s)`
                });
            }

            // Eliminar la zona (soft delete sería mejor, pero la estructura no lo permite)
            await db.query('DELETE FROM zonas WHERE zonaId = ?', [id]);

            res.json({
                success: true,
                message: 'Zona eliminada exitosamente'
            });
        } catch (error) {
            console.error('Error en destroy zona:', error);
            res.status(500).json({
                success: false,
                message: 'Error al eliminar zona',
                error: error.message
            });
        }
    }

    // GET /api/v1/zonas/:id/clientes - Obtener clientes de una zona
    async getClientes(req, res) {
        try {
            const { id } = req.params;
            const { activo } = req.query;

            let whereClause = 'WHERE c.zonaId = ?';
            let params = [id];

            if (activo !== undefined) {
                whereClause += ' AND c.activo = ?';
                params.push(activo === 'true' ? 1 : 0);
            }

            const clientes = await db.query(`
                SELECT 
                    c.clienteId,
                    c.razonSocial,
                    c.cuit,
                    c.email,
                    c.telefono,
                    c.localidad,
                    c.tiene_deposito,
                    c.activo,
                    c.fecha_creacion,
                    v.razonSocial as vendedor_nombre,
                    z.zona as zona_nombre
                FROM clientes c
                LEFT JOIN vendedores v ON c.vendedorId = v.vendedorId
                LEFT JOIN zonas z ON c.zonaId = z.zonaId
                ${whereClause}
                ORDER BY c.razonSocial ASC
            `, params);

            res.json({
                success: true,
                data: clientes,
                count: clientes.length
            });
        } catch (error) {
            console.error('Error obteniendo clientes de zona:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener clientes de la zona',
                error: error.message
            });
        }
    }

    // GET /api/v1/zonas/:id/estadisticas - Obtener estadísticas de la zona
    async getEstadisticas(req, res) {
        try {
            const { id } = req.params;

            const [estadisticas] = await db.query(`
                SELECT 
                    z.zona,
                    z.activo as zona_activa,
                    COUNT(c.clienteId) as total_clientes,
                    COUNT(CASE WHEN c.activo = 1 THEN 1 END) as clientes_activos,
                    COUNT(CASE WHEN c.tiene_deposito = 1 THEN 1 END) as clientes_con_deposito,
                    COUNT(DISTINCT c.vendedorId) as vendedores_asignados
                FROM zonas z
                LEFT JOIN clientes c ON z.zonaId = c.zonaId
                WHERE z.zonaId = ?
                GROUP BY z.zonaId, z.zona, z.activo
            `, [id]);

            if (!estadisticas) {
                return res.status(404).json({
                    success: false,
                    message: 'Zona no encontrada'
                });
            }

            res.json({
                success: true,
                data: estadisticas
            });
        } catch (error) {
            console.error('Error obteniendo estadísticas de zona:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener estadísticas de la zona',
                error: error.message
            });
        }
    }

    // PUT /api/v1/zonas/:id/toggle-active - Alternar estado activo/inactivo
    async toggleActive(req, res) {
        try {
            const { id } = req.params;

            // Obtener estado actual
            const [zona] = await db.query(
                'SELECT activo FROM zonas WHERE zonaId = ?',
                [id]
            );

            if (!zona) {
                return res.status(404).json({
                    success: false,
                    message: 'Zona no encontrada'
                });
            }

            const nuevoEstado = zona.activo ? 0 : 1;

            // Si se está desactivando, verificar que no tenga clientes activos
            if (nuevoEstado === 0) {
                const [clientesActivos] = await db.query(
                    'SELECT COUNT(*) as count FROM clientes WHERE zonaId = ? AND activo = 1',
                    [id]
                );

                if (clientesActivos.count > 0) {
                    return res.status(400).json({
                        success: false,
                        message: `No se puede desactivar la zona porque tiene ${clientesActivos.count} cliente(s) activo(s)`
                    });
                }
            }

            // Cambiar estado
            await db.query(
                'UPDATE zonas SET activo = ? WHERE zonaId = ?',
                [nuevoEstado, id]
            );

            res.json({
                success: true,
                message: `Zona ${nuevoEstado ? 'activada' : 'desactivada'} exitosamente`,
                data: { activo: nuevoEstado }
            });
        } catch (error) {
            console.error('Error cambiando estado de zona:', error);
            res.status(500).json({
                success: false,
                message: 'Error al cambiar estado de la zona',
                error: error.message
            });
        }
    }
}

module.exports = new ZonasController();