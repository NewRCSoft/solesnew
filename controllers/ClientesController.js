// =============================================
// controllers/ClientesController.js - Controlador de Clientes CORREGIDO
// =============================================
const BaseModel = require('../models/BaseModel');
const Deposito = require('../models/Deposito');
const db = require('../config/database');
const logger = require('../config/logger');

class ClientesController {
    constructor() {
        this.clienteModel = new BaseModel('clientes', 'clienteId');
        
        // 🔧 CRUCIAL: Bind de TODOS los métodos para preservar el contexto 'this'
        this.index = this.index.bind(this);
        this.show = this.show.bind(this);
        this.create = this.create.bind(this);
        this.update = this.update.bind(this);
        this.destroy = this.destroy.bind(this);
        this.getStock = this.getStock.bind(this);
        this.getByVendedor = this.getByVendedor.bind(this);
        this.toggleDeposito = this.toggleDeposito.bind(this);
    }

    // GET /api/v1/clientes - Listar todos los clientes
    async index(req, res) {
        try {
            const { search, activo, zona, tiene_deposito, vendedorId } = req.query;

            let whereClause = 'WHERE 1=1';
            let params = [];

            if (activo !== undefined) {
                whereClause += ' AND c.activo = ?';
                params.push(activo === '1' ? 1 : 0);
            }

            if (vendedorId) {
                whereClause += ' AND c.vendedorId = ?';
                params.push(vendedorId);
            }

            if (zona) {
                whereClause += ' AND c.zonaId = ?';
                params.push(zona);
            }

            if (tiene_deposito !== undefined) {
                if (tiene_deposito === '1') {
                    whereClause += ' AND d.id IS NOT NULL';
                } else {
                    whereClause += ' AND d.id IS NULL';
                }
            }

            if (search) {
                whereClause += ' AND (c.razonSocial LIKE ? OR c.cuit LIKE ? OR c.email LIKE ?)';
                const searchParam = `%${search}%`;
                params.push(searchParam, searchParam, searchParam);
            }

            const sql = `
                SELECT 
                    c.*,
                    v.razonSocial as vendedor_nombre,
                    v.email as vendedor_email,
                    z.zona as zona_nombre,
                    d.id as deposito_id,
                    d.nombre as deposito_nombre,
                    d.activo as deposito_activo,
                    (SELECT COUNT(*) FROM stock_depositos sd 
                     INNER JOIN depositos dep ON sd.deposito_id = dep.id 
                     WHERE dep.tipo = 'CLIENTE' AND dep.entity_id = c.clienteId AND sd.cantidad > 0) as items_stock,
                    (SELECT SUM(sd.cantidad) FROM stock_depositos sd 
                     INNER JOIN depositos dep ON sd.deposito_id = dep.id 
                     WHERE dep.tipo = 'CLIENTE' AND dep.entity_id = c.clienteId) as total_stock,
                    (SELECT COUNT(*) FROM ordenes_transferencia ot 
                     WHERE ot.deposito_destino_id IN (SELECT id FROM depositos WHERE entity_id = c.clienteId AND tipo = 'CLIENTE') 
                     AND ot.estado IN ('PENDIENTE', 'PARCIAL')) as transferencias_pendientes
                FROM clientes c
                LEFT JOIN vendedores v ON c.vendedorId = v.vendedorId
                LEFT JOIN zonas z ON c.zonaId = z.zonaId
                LEFT JOIN depositos d ON c.clienteId = d.entity_id AND d.tipo = 'CLIENTE' AND d.activo = 1
                ${whereClause}
                ORDER BY c.razonSocial
            `;

            const clientes = await db.query(sql, params);

            // Calcular estadísticas
            const stats = {
                total_clientes: clientes.length,
                clientes_activos: clientes.filter(c => c.activo === 1).length,
                con_deposito: clientes.filter(c => c.deposito_id).length,
                con_stock: clientes.filter(c => c.items_stock > 0).length,
                con_transferencias_pendientes: clientes.filter(c => c.transferencias_pendientes > 0).length,
                total_items_stock: clientes.reduce((sum, c) => sum + (c.items_stock || 0), 0)
            };

            res.json({
                success: true,
                data: clientes,
                estadisticas: stats,
                total: clientes.length
            });
        } catch (error) {
            logger.error('Error en index clientes:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener clientes',
                error: error.message
            });
        }
    }

    // GET /api/v1/clientes/:id - Obtener cliente específico
    async show(req, res) {
        try {
            const { id } = req.params;

            const sql = `
                SELECT 
                    c.*,
                    v.razonSocial as vendedor_nombre,
                    v.email as vendedor_email,
                    v.telefono as vendedor_telefono,
                    z.zona as zona_nombre,
                    d.id as deposito_id,
                    d.nombre as deposito_nombre,
                    d.direccion as deposito_direccion,
                    d.activo as deposito_activo,
                    (SELECT COUNT(*) FROM stock_depositos sd 
                     INNER JOIN depositos dep ON sd.deposito_id = dep.id 
                     WHERE dep.tipo = 'CLIENTE' AND dep.entity_id = c.clienteId AND sd.cantidad > 0) as items_stock,
                    (SELECT SUM(sd.cantidad) FROM stock_depositos sd 
                     INNER JOIN depositos dep ON sd.deposito_id = dep.id 
                     WHERE dep.tipo = 'CLIENTE' AND dep.entity_id = c.clienteId) as total_stock,
                    (SELECT COUNT(*) FROM ordenes_transferencia ot 
                     WHERE ot.deposito_destino_id IN (SELECT id FROM depositos WHERE entity_id = c.clienteId AND tipo = 'CLIENTE')) as total_transferencias,
                    (SELECT COUNT(*) FROM ordenes_transferencia ot 
                     WHERE ot.deposito_destino_id IN (SELECT id FROM depositos WHERE entity_id = c.clienteId AND tipo = 'CLIENTE') 
                     AND ot.estado IN ('PENDIENTE', 'PARCIAL')) as transferencias_pendientes
                FROM clientes c
                LEFT JOIN vendedores v ON c.vendedorId = v.vendedorId
                LEFT JOIN zonas z ON c.zonaId = z.zonaId
                LEFT JOIN depositos d ON c.clienteId = d.entity_id AND d.tipo = 'CLIENTE' AND d.activo = 1
                WHERE c.clienteId = ? AND c.activo = 1
            `;

            const result = await db.query(sql, [id]);
            const cliente = result[0];

            if (!cliente) {
                return res.status(404).json({
                    success: false,
                    message: 'Cliente no encontrado'
                });
            }

            res.json({
                success: true,
                data: cliente
            });
        } catch (error) {
            logger.error('Error en show cliente:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener cliente',
                error: error.message
            });
        }
    }

    // POST /api/v1/clientes - Crear nuevo cliente
    async create(req, res) {
        try {
            const {
                razonSocial,
                cuit,
                condicionIVA,
                domicilio,
                localidad,
                provincia,
                codigoPostal,
                telefono,
                email,
                vendedorId,
                zonaId,
                tiene_deposito = false
            } = req.body;

            // Validaciones básicas
            if (!razonSocial || !cuit || !vendedorId) {
                return res.status(400).json({
                    success: false,
                    message: 'Razón social, CUIT y vendedor son requeridos'
                });
            }

            // Verificar si el CUIT ya existe
            const existeCliente = await db.query(
                'SELECT clienteId FROM clientes WHERE cuit = ? AND activo = 1',
                [cuit]
            );

            if (existeCliente && existeCliente.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Ya existe un cliente con ese CUIT'
                });
            }

            // Verificar que el vendedor existe
            const vendedor = await db.query(
                'SELECT vendedorId FROM vendedores WHERE vendedorId = ? AND activo = 1',
                [vendedorId]
            );

            if (!vendedor || vendedor.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'El vendedor especificado no existe'
                });
            }

            // Verificar que la zona existe (si se especifica)
            if (zonaId) {
                const zona = await db.query(
                    'SELECT zonaId FROM zonas WHERE zonaId = ? AND activo = 1',
                    [zonaId]
                );

                if (!zona || zona.length === 0) {
                    return res.status(400).json({
                        success: false,
                        message: 'La zona especificada no existe'
                    });
                }
            }

            const clienteData = {
                razonSocial,
                cuit,
                condicionIVA,
                domicilio,
                localidad,
                provincia,
                codigoPostal,
                telefono,
                email,
                vendedorId,
                zonaId,
                tiene_deposito: tiene_deposito ? 1 : 0,
                activo: 1
            };

            // 🔧 Usar this.clienteModel (funciona porque tenemos bind)
            const nuevoCliente = await this.clienteModel.create(clienteData);
            const clienteId = nuevoCliente.insertId || nuevoCliente.clienteId;

            // Crear depósito si se requiere
            if (tiene_deposito) {
                try {
                    await db.query(`
                        INSERT INTO depositos (nombre, tipo, entity_id, direccion, telefono, email, activo)
                        VALUES (?, 'CLIENTE', ?, ?, ?, ?, 1)
                    `, [
                        `Depósito - ${razonSocial}`,
                        clienteId,
                        domicilio || '',
                        telefono || '',
                        email || ''
                    ]);
                } catch (depositoError) {
                    logger.warn('Error al crear depósito para cliente:', depositoError);
                    // No fallar la creación del cliente por el depósito
                }
            }

            // Obtener el cliente completo creado
            const clienteCompleto = await db.query(
                'SELECT * FROM clientes WHERE clienteId = ?',
                [clienteId]
            );

            res.status(201).json({
                success: true,
                message: 'Cliente creado exitosamente',
                data: clienteCompleto[0]
            });
        } catch (error) {
            logger.error('Error en create cliente:', error);
            res.status(500).json({
                success: false,
                message: 'Error al crear cliente',
                error: error.message
            });
        }
    }

    // PUT /api/v1/clientes/:id - Actualizar cliente
    async update(req, res) {
        try {
            const { id } = req.params;
            const updateData = { ...req.body };

            // Remover campos que no deben actualizarse directamente
            delete updateData.clienteId;
            delete updateData.fecha_creacion;
            delete updateData.ultima_modificacion;

            // Verificar si el cliente existe
            const clienteExistente = await db.query(
                'SELECT * FROM clientes WHERE clienteId = ? AND activo = 1',
                [id]
            );

            if (!clienteExistente || clienteExistente.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Cliente no encontrado'
                });
            }

            const clienteActual = clienteExistente[0];

            // Si se está cambiando el CUIT, verificar que no exista
            if (updateData.cuit && updateData.cuit !== clienteActual.cuit) {
                const existeCuit = await db.query(
                    'SELECT clienteId FROM clientes WHERE cuit = ? AND clienteId != ? AND activo = 1',
                    [updateData.cuit, id]
                );

                if (existeCuit && existeCuit.length > 0) {
                    return res.status(400).json({
                        success: false,
                        message: 'Ya existe un cliente con ese CUIT'
                    });
                }
            }

            // Verificar vendedor si se está actualizando
            if (updateData.vendedorId) {
                const vendedor = await db.query(
                    'SELECT vendedorId FROM vendedores WHERE vendedorId = ? AND activo = 1',
                    [updateData.vendedorId]
                );

                if (!vendedor || vendedor.length === 0) {
                    return res.status(400).json({
                        success: false,
                        message: 'El vendedor especificado no existe'
                    });
                }
            }

            // Verificar zona si se está actualizando
            if (updateData.zonaId) {
                const zona = await db.query(
                    'SELECT zonaId FROM zonas WHERE zonaId = ? AND activo = 1',
                    [updateData.zonaId]
                );

                if (!zona || zona.length === 0) {
                    return res.status(400).json({
                        success: false,
                        message: 'La zona especificada no existe'
                    });
                }
            }

            // Manejar cambio de estado de depósito
            if (updateData.tiene_deposito !== undefined) {
                const tieneDeposito = updateData.tiene_deposito === true || updateData.tiene_deposito === 1;
                updateData.tiene_deposito = tieneDeposito ? 1 : 0;

                if (tieneDeposito && !clienteActual.tiene_deposito) {
                    // Crear depósito
                    try {
                        await db.query(`
                            INSERT INTO depositos (nombre, tipo, entity_id, direccion, telefono, email, activo)
                            VALUES (?, 'CLIENTE', ?, ?, ?, ?, 1)
                        `, [
                            `Depósito - ${clienteActual.razonSocial}`,
                            id,
                            clienteActual.domicilio || '',
                            clienteActual.telefono || '',
                            clienteActual.email || ''
                        ]);
                    } catch (depositoError) {
                        logger.warn('Error al crear depósito:', depositoError);
                    }
                } else if (!tieneDeposito && clienteActual.tiene_deposito) {
                    // Verificar que no tenga stock antes de desactivar
                    const tieneStock = await db.query(`
                        SELECT COUNT(*) as count FROM stock_depositos sd
                        INNER JOIN depositos d ON sd.deposito_id = d.id
                        WHERE d.entity_id = ? AND d.tipo = 'CLIENTE' AND sd.cantidad > 0
                    `, [id]);

                    if (tieneStock[0].count > 0) {
                        return res.status(400).json({
                            success: false,
                            message: 'No se puede desactivar el depósito porque tiene stock'
                        });
                    }

                    await db.query(
                        'UPDATE depositos SET activo = 0 WHERE entity_id = ? AND tipo = "CLIENTE"',
                        [id]
                    );
                }
            }

            // 🔧 Usar this.clienteModel (funciona con bind)
            const clienteActualizado = await this.clienteModel.update(id, updateData);

            res.json({
                success: true,
                message: 'Cliente actualizado exitosamente',
                data: clienteActualizado
            });
        } catch (error) {
            logger.error('Error en update cliente:', error);
            res.status(500).json({
                success: false,
                message: 'Error al actualizar cliente',
                error: error.message
            });
        }
    }

    // DELETE /api/v1/clientes/:id - Eliminar cliente (soft delete)
    async destroy(req, res) {
        try {
            const { id } = req.params;

            // Verificar si el cliente existe
            const cliente = await db.query(
                'SELECT clienteId FROM clientes WHERE clienteId = ? AND activo = 1',
                [id]
            );

            if (!cliente || cliente.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Cliente no encontrado'
                });
            }

            // Verificar si tiene transferencias pendientes
            const transferenciasPendientes = await db.query(`
                SELECT COUNT(*) as count FROM ordenes_transferencia ot
                WHERE ot.deposito_destino_id IN (SELECT id FROM depositos WHERE entity_id = ? AND tipo = 'CLIENTE')
                AND ot.estado IN ('PENDIENTE', 'PARCIAL')
            `, [id]);

            if (transferenciasPendientes[0].count > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No se puede eliminar el cliente porque tiene transferencias pendientes'
                });
            }

            // Verificar si tiene stock
            const tieneStock = await db.query(`
                SELECT COUNT(*) as count FROM stock_depositos sd
                INNER JOIN depositos d ON sd.deposito_id = d.id
                WHERE d.entity_id = ? AND d.tipo = 'CLIENTE' AND sd.cantidad > 0
            `, [id]);

            if (tieneStock[0].count > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No se puede eliminar el cliente porque tiene stock en su depósito'
                });
            }

            // Soft delete del cliente usando el modelo
            await this.clienteModel.update(id, { activo: 0 });

            // Desactivar depósito asociado si existe
            await db.query(
                'UPDATE depositos SET activo = 0 WHERE entity_id = ? AND tipo = "CLIENTE"',
                [id]
            );

            res.json({
                success: true,
                message: 'Cliente eliminado exitosamente'
            });
        } catch (error) {
            logger.error('Error en destroy cliente:', error);
            res.status(500).json({
                success: false,
                message: 'Error al eliminar cliente',
                error: error.message
            });
        }
    }

    // GET /api/v1/clientes/:id/stock - Obtener stock de un cliente
    async getStock(req, res) {
        try {
            const { id } = req.params;
            const { categoria_id, bajo_stock = false } = req.query;

            let whereClause = 'WHERE d.entity_id = ? AND d.tipo = "CLIENTE" AND d.activo = 1';
            let params = [id];

            if (categoria_id) {
                whereClause += ' AND m.id_categoria = ?';
                params.push(categoria_id);
            }

            if (bajo_stock === 'true') {
                whereClause += ' AND sd.cantidad <= sd.stock_minimo';
            }

            const sql = `
                SELECT 
                    sd.*,
                    m.descripcion as mercaderia_descripcion,
                    m.codigo_sku,
                    m.precio_venta,
                    c.descripcion as categoria_descripcion,
                    d.nombre as deposito_nombre
                FROM stock_depositos sd
                INNER JOIN depositos d ON sd.deposito_id = d.id
                INNER JOIN mercaderias m ON sd.mercaderia_id = m.id
                LEFT JOIN categorias c ON m.id_categoria = c.id
                ${whereClause}
                ORDER BY m.descripcion
            `;

            const stock = await db.query(sql, params);

            res.json({
                success: true,
                data: stock,
                total: stock.length
            });
        } catch (error) {
            logger.error('Error en getStock cliente:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener stock del cliente',
                error: error.message
            });
        }
    }

    // GET /api/v1/clientes/vendedor/:vendedorId - Obtener clientes de un vendedor
    async getByVendedor(req, res) {
        try {
            const { vendedorId } = req.params;
            const { activo = 1, tiene_deposito, zona, search } = req.query;

            // Verificar que el vendedor existe
            const vendedor = await db.query(
                'SELECT vendedorId, razonSocial FROM vendedores WHERE vendedorId = ? AND activo = 1',
                [vendedorId]
            );

            if (!vendedor || vendedor.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Vendedor no encontrado'
                });
            }

            let whereClause = 'WHERE c.vendedorId = ?';
            let params = [vendedorId];

            if (activo !== undefined) {
                whereClause += ' AND c.activo = ?';
                params.push(activo);
            }

            if (tiene_deposito !== undefined) {
                whereClause += ' AND c.tiene_deposito = ?';
                params.push(tiene_deposito === 'true' ? 1 : 0);
            }

            if (zona) {
                whereClause += ' AND c.zonaId = ?';
                params.push(zona);
            }

            if (search) {
                whereClause += ' AND (c.razonSocial LIKE ? OR c.cuit LIKE ? OR c.email LIKE ?)';
                const searchParam = `%${search}%`;
                params.push(searchParam, searchParam, searchParam);
            }

            const sql = `
                SELECT 
                    c.*,
                    z.zona as zona_nombre,
                    d.id as deposito_id,
                    d.nombre as deposito_nombre,
                    d.activo as deposito_activo,
                    (SELECT COUNT(*) FROM stock_depositos sd 
                     INNER JOIN depositos dep ON sd.deposito_id = dep.id 
                     WHERE dep.tipo = 'CLIENTE' AND dep.entity_id = c.clienteId AND sd.cantidad > 0) as items_stock,
                    (SELECT SUM(sd.cantidad) FROM stock_depositos sd 
                     INNER JOIN depositos dep ON sd.deposito_id = dep.id 
                     WHERE dep.tipo = 'CLIENTE' AND dep.entity_id = c.clienteId) as total_stock,
                    (SELECT COUNT(*) FROM ordenes_transferencia ot 
                     WHERE ot.deposito_destino_id IN (SELECT id FROM depositos WHERE entity_id = c.clienteId AND tipo = 'CLIENTE') 
                     AND ot.estado IN ('PENDIENTE', 'PARCIAL')) as transferencias_pendientes
                FROM clientes c
                LEFT JOIN zonas z ON c.zonaId = z.zonaId
                LEFT JOIN depositos d ON c.clienteId = d.entity_id AND d.tipo = 'CLIENTE'
                ${whereClause}
                ORDER BY c.razonSocial
            `;

            const clientes = await db.query(sql, params);

            // Calcular estadísticas
            const stats = {
                total_clientes: clientes.length,
                clientes_activos: clientes.filter(c => c.activo === 1).length,
                con_deposito: clientes.filter(c => c.tiene_deposito === 1).length,
                con_stock: clientes.filter(c => c.items_stock > 0).length,
                con_transferencias_pendientes: clientes.filter(c => c.transferencias_pendientes > 0).length,
                total_items_stock: clientes.reduce((sum, c) => sum + (c.items_stock || 0), 0)
            };

            res.json({
                success: true,
                data: clientes,
                vendedor: {
                    vendedorId: vendedor[0].vendedorId,
                    razonSocial: vendedor[0].razonSocial
                },
                estadisticas: stats,
                total: clientes.length
            });
        } catch (error) {
            logger.error('Error en getByVendedor:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener clientes del vendedor',
                error: error.message
            });
        }
    }

    // PUT /api/v1/clientes/:id/deposito/toggle - Alternar estado de depósito del cliente
    async toggleDeposito(req, res) {
        try {
            const { id } = req.params;

            const cliente = await db.query(
                'SELECT * FROM clientes WHERE clienteId = ? AND activo = 1',
                [id]
            );

            if (!cliente || cliente.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Cliente no encontrado'
                });
            }

            const clienteActual = cliente[0];
            const nuevoEstado = clienteActual.tiene_deposito === 1 ? 0 : 1;

            if (nuevoEstado === 0) {
                // Verificar que no tenga stock
                const tieneStock = await db.query(`
                    SELECT COUNT(*) as count FROM stock_depositos sd
                    INNER JOIN depositos d ON sd.deposito_id = d.id
                    WHERE d.entity_id = ? AND d.tipo = 'CLIENTE' AND sd.cantidad > 0
                `, [id]);

                if (tieneStock[0].count > 0) {
                    return res.status(400).json({
                        success: false,
                        message: 'No se puede desactivar el depósito porque tiene stock'
                    });
                }

                // Desactivar depósito
                await db.query(
                    'UPDATE depositos SET activo = 0 WHERE entity_id = ? AND tipo = "CLIENTE"',
                    [id]
                );
            } else {
                // Activar o crear depósito
                const depositoExistente = await db.query(
                    'SELECT id FROM depositos WHERE entity_id = ? AND tipo = "CLIENTE"',
                    [id]
                );

                if (depositoExistente && depositoExistente.length > 0) {
                    await db.query(
                        'UPDATE depositos SET activo = 1 WHERE id = ?',
                        [depositoExistente[0].id]
                    );
                } else {
                    await db.query(`
                        INSERT INTO depositos (nombre, tipo, entity_id, direccion, telefono, email, activo)
                        VALUES (?, 'CLIENTE', ?, ?, ?, ?, 1)
                    `, [
                        `Depósito - ${clienteActual.razonSocial}`,
                        id,
                        clienteActual.domicilio || '',
                        clienteActual.telefono || '',
                        clienteActual.email || ''
                    ]);
                }
            }

            await db.query(
                'UPDATE clientes SET tiene_deposito = ? WHERE clienteId = ?',
                [nuevoEstado, id]
            );

            res.json({
                success: true,
                message: `Depósito ${nuevoEstado === 1 ? 'activado' : 'desactivado'} exitosamente`,
                tiene_deposito: nuevoEstado === 1
            });
        } catch (error) {
            logger.error('Error en toggleDeposito:', error);
            res.status(500).json({
                success: false,
                message: 'Error al cambiar estado del depósito',
                error: error.message
            });
        }
    }

    /**
 * GET /api/v1/clientes/sin-deposito
 * Obtener clientes que NO tienen depósito asignado
 */
async getSinDeposito(req, res) {
    try {
        logger.info('🏪 Obteniendo clientes sin depósito');

        const sql = `
            SELECT 
                c.clienteId,
                c.razonSocial,
                c.cuit,
                c.email,
                c.telefono,
                c.domicilio,
                c.localidad,
                c.activo,
                v.razonSocial as vendedor_nombre,
                z.zona as zona_nombre
            FROM clientes c
            LEFT JOIN depositos d ON c.clienteId = d.entity_id AND d.tipo = 'CLIENTE' AND d.activo = 1
            LEFT JOIN vendedores v ON c.vendedorId = v.vendedorId
            LEFT JOIN zonas z ON c.zonaId = z.zonaId
            WHERE c.activo = 1 
            AND d.id IS NULL  -- No tiene depósito asignado
            ORDER BY c.razonSocial ASC
        `;

        const clientes = await db.query(sql);

        res.json({
            success: true,
            data: clientes,
            total: clientes.length,
            message: `Se encontraron ${clientes.length} clientes sin depósito`
        });

    } catch (error) {
        logger.error('Error en getSinDeposito clientes:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener clientes sin depósito',
            error: error.message
        });
    }
}
}

// 🔧 EXPORTAR INSTANCIA con métodos ya bindados
module.exports = new ClientesController();