// =============================================
// controllers/VendedoresController.js - Controlador de Vendedores CORREGIDO
// =============================================
const BaseModel = require('../models/BaseModel');
const Deposito = require('../models/Deposito');
const db = require('../config/database');
const logger = require('../config/logger');

class VendedoresController {
    constructor() {
        this.vendedorModel = new BaseModel('vendedores', 'vendedorId');
        
        // 🔧 CRUCIAL: Bind de TODOS los métodos para preservar el contexto 'this'
        this.index = this.index.bind(this);
        this.show = this.show.bind(this);
        this.create = this.create.bind(this);
        this.update = this.update.bind(this);
        this.destroy = this.destroy.bind(this);
        this.getClientes = this.getClientes.bind(this);
        this.getStock = this.getStock.bind(this);
        this.toggleDeposito = this.toggleDeposito.bind(this);
        this.getComisiones = this.getComisiones.bind(this);
    }

    // GET /api/v1/vendedores - Listar todos los vendedores
    async index(req, res) {
        try {
            const { search, activo, zona, tiene_deposito } = req.query;

            let whereClause = 'WHERE 1=1';
            let params = [];

            if (activo !== undefined) {
                whereClause += ' AND v.activo = ?';
                params.push(activo === 'true' ? 1 : 0);
            }

            if (search) {
                whereClause += ' AND (v.razonSocial LIKE ? OR v.cuit LIKE ? OR v.email LIKE ?)';
                const searchParam = `%${search}%`;
                params.push(searchParam, searchParam, searchParam);
            }

            if (zona) {
                whereClause += ' AND EXISTS (SELECT 1 FROM clientes c WHERE c.vendedorId = v.vendedorId AND c.zonaId = ?)';
                params.push(zona);
            }

            if (tiene_deposito !== undefined) {
                if (tiene_deposito === 'true') {
                    whereClause += ' AND d.id IS NOT NULL';
                } else {
                    whereClause += ' AND d.id IS NULL';
                }
            }

            const sql = `
                SELECT 
                    v.*,
                    d.id as deposito_id,
                    d.nombre as deposito_nombre,
                    d.direccion as deposito_direccion,
                    COUNT(DISTINCT c.clienteId) as total_clientes,
                    (SELECT COUNT(*) FROM stock_depositos sd 
                     INNER JOIN depositos dep ON sd.deposito_id = dep.id 
                     WHERE dep.tipo = 'VENDEDOR' AND dep.entity_id = v.vendedorId AND sd.cantidad > 0) as items_stock
                FROM vendedores v
                LEFT JOIN depositos d ON v.vendedorId = d.entity_id AND d.tipo = 'VENDEDOR' AND d.activo = 1
                LEFT JOIN clientes c ON v.vendedorId = c.vendedorId AND c.activo = 1
                ${whereClause}
                GROUP BY v.vendedorId
                ORDER BY v.razonSocial
            `;

            const vendedores = await db.query(sql, params);

            res.json({
                success: true,
                data: vendedores,
                total: vendedores.length
            });
        } catch (error) {
            logger.error('Error en index vendedores:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener vendedores',
                error: error.message
            });
        }
    }

    // GET /api/v1/vendedores/:id - Obtener vendedor por ID
    async show(req, res) {
        try {
            const { id } = req.params;

            const sql = `
                SELECT 
                    v.*,
                    d.id as deposito_id,
                    d.nombre as deposito_nombre,
                    d.direccion as deposito_direccion,
                    d.telefono as deposito_telefono,
                    d.email as deposito_email,
                    COUNT(DISTINCT c.clienteId) as total_clientes,
                    (SELECT COUNT(*) FROM stock_depositos sd 
                     INNER JOIN depositos dep ON sd.deposito_id = dep.id 
                     WHERE dep.tipo = 'VENDEDOR' AND dep.entity_id = v.vendedorId AND sd.cantidad > 0) as items_stock
                FROM vendedores v
                LEFT JOIN depositos d ON v.vendedorId = d.entity_id AND d.tipo = 'VENDEDOR' AND d.activo = 1
                LEFT JOIN clientes c ON v.vendedorId = c.vendedorId AND c.activo = 1
                WHERE v.vendedorId = ?
                GROUP BY v.vendedorId
            `;

            const result = await db.query(sql, [id]);
            const vendedor = result[0];

            if (!vendedor) {
                return res.status(404).json({
                    success: false,
                    message: 'Vendedor no encontrado'
                });
            }

            res.json({
                success: true,
                data: vendedor
            });
        } catch (error) {
            logger.error('Error en show vendedor:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener vendedor',
                error: error.message
            });
        }
    }

    // POST /api/v1/vendedores - Crear nuevo vendedor
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
                tiene_deposito = false
            } = req.body;

            // Validaciones básicas
            if (!razonSocial || !cuit) {
                return res.status(400).json({
                    success: false,
                    message: 'Razón social y CUIT son requeridos'
                });
            }

            // Verificar si el CUIT ya existe
            const existeVendedor = await db.query(
                'SELECT vendedorId FROM vendedores WHERE cuit = ? AND activo = 1',
                [cuit]
            );

            if (existeVendedor && existeVendedor.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Ya existe un vendedor con ese CUIT'
                });
            }

            const vendedorData = {
                razonSocial,
                cuit,
                condicionIVA,
                domicilio,
                localidad,
                provincia,
                codigoPostal,
                telefono,
                email,
                activo: 1
            };

            // 🔧 Usar this.vendedorModel (ahora funciona porque tenemos bind)
            const vendedor = await this.vendedorModel.create(vendedorData);
            const vendedorId = vendedor.insertId || vendedor.vendedorId;

            // Si tiene depósito, crearlo
            if (tiene_deposito) {
                await db.query(`
                    INSERT INTO depositos (nombre, tipo, entity_id, direccion, telefono, email, activo)
                    VALUES (?, 'VENDEDOR', ?, ?, ?, ?, 1)
                `, [
                    `Depósito - ${razonSocial}`,
                    vendedorId,
                    domicilio || '',
                    telefono || '',
                    email || ''
                ]);
            }

            // Obtener el vendedor completo creado
            const vendedorCompleto = await db.query(
                'SELECT * FROM vendedores WHERE vendedorId = ?',
                [vendedorId]
            );

            res.status(201).json({
                success: true,
                message: 'Vendedor creado exitosamente',
                data: vendedorCompleto[0]
            });
        } catch (error) {
            logger.error('Error en create vendedor:', error);
            res.status(500).json({
                success: false,
                message: 'Error al crear vendedor',
                error: error.message
            });
        }
    }

    // PUT /api/v1/vendedores/:id - Actualizar vendedor CON LÓGICA DE DEPÓSITOS MEJORADA
async update(req, res) {
    try {
        const { id } = req.params;
        const updateData = { ...req.body };

        // Eliminar campos que no deben actualizarse directamente
        delete updateData.vendedorId;
        delete updateData.fecha_creacion;
        delete updateData.ultima_modificacion;

        // Verificar si el vendedor existe
        const vendedorExistente = await db.query(
            'SELECT * FROM vendedores WHERE vendedorId = ? AND activo = 1',
            [id]
        );

        if (!vendedorExistente || vendedorExistente.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Vendedor no encontrado'
            });
        }

        const vendedorActual = vendedorExistente[0];

        // Si se está cambiando el CUIT, verificar que no exista
        if (updateData.cuit && updateData.cuit !== vendedorActual.cuit) {
            const existeCuit = await db.query(
                'SELECT vendedorId FROM vendedores WHERE cuit = ? AND vendedorId != ? AND activo = 1',
                [updateData.cuit, id]
            );

            if (existeCuit && existeCuit.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Ya existe un vendedor con ese CUIT'
                });
            }
        }

        // 🔧 NUEVA LÓGICA: Manejar cambios en tiene_deposito
        if (updateData.tiene_deposito !== undefined) {
            const tieneDepositoNuevo = updateData.tiene_deposito === true || updateData.tiene_deposito === 1;
            const tieneDepositoActual = vendedorActual.tiene_deposito === 1;

            // Verificar si existe depósito actual
            const depositoExistente = await db.query(
                'SELECT id, activo FROM depositos WHERE entity_id = ? AND tipo = "VENDEDOR"',
                [id]
            );

            const deposito = depositoExistente && depositoExistente.length > 0 ? depositoExistente[0] : null;

            if (tieneDepositoNuevo && !deposito) {
                // CASO 1: Crear depósito nuevo (no existía antes)
                logger.info(`Creando nuevo depósito para vendedor ${id}`);
                
                await db.query(`
                    INSERT INTO depositos (nombre, tipo, entity_id, direccion, telefono, email, activo)
                    VALUES (?, 'VENDEDOR', ?, ?, ?, ?, 1)
                `, [
                    `Depósito - ${updateData.razonSocial || vendedorActual.razonSocial}`,
                    id,
                    updateData.domicilio || vendedorActual.domicilio || '',
                    updateData.telefono || vendedorActual.telefono || '',
                    updateData.email || vendedorActual.email || ''
                ]);

                logger.info(`Depósito creado exitosamente para vendedor ${id}`);

            } else if (tieneDepositoNuevo && deposito && deposito.activo === 0) {
                // CASO 2: Reactivar depósito existente inactivo
                logger.info(`Reactivando depósito existente para vendedor ${id}`);
                
                await db.query(
                    'UPDATE depositos SET activo = 1 WHERE id = ?',
                    [deposito.id]
                );

            } else if (!tieneDepositoNuevo && deposito && deposito.activo === 1) {
                // CASO 3: Desactivar depósito (verificar que no tenga movimientos)
                logger.info(`Intentando desactivar depósito para vendedor ${id}`);

                // Verificar si tiene stock actual
                const tieneStock = await db.query(`
                    SELECT COUNT(*) as count FROM stock_depositos 
                    WHERE deposito_id = ? AND cantidad > 0
                `, [deposito.id]);

                if (tieneStock[0].count > 0) {
                    return res.status(400).json({
                        success: false,
                        message: 'No se puede desactivar el depósito porque tiene stock actual',
                        details: `El depósito tiene ${tieneStock[0].count} productos con stock`
                    });
                }

                // Verificar si tiene movimientos históricos
                const tieneMovimientos = await db.query(`
                    SELECT COUNT(*) as count FROM movimientos_stock 
                    WHERE deposito_origen_id = ? OR deposito_destino_id = ?
                `, [deposito.id, deposito.id]);

                if (tieneMovimientos[0].count > 0) {
                    return res.status(400).json({
                        success: false,
                        message: 'No se puede desactivar el depósito porque tiene movimientos registrados',
                        details: `El depósito tiene ${tieneMovimientos[0].count} movimientos en el historial. Por motivos de auditoría, no se puede desactivar.`
                    });
                }

                // Verificar si tiene transferencias pendientes
                const tieneTransferencias = await db.query(`
                    SELECT COUNT(*) as count FROM ordenes_transferencia 
                    WHERE (deposito_origen_id = ? OR deposito_destino_id = ?) 
                    AND estado IN ('PENDIENTE', 'PARCIAL')
                `, [deposito.id, deposito.id]);

                if (tieneTransferencias[0].count > 0) {
                    return res.status(400).json({
                        success: false,
                        message: 'No se puede desactivar el depósito porque tiene transferencias pendientes',
                        details: `El depósito tiene ${tieneTransferencias[0].count} transferencias pendientes`
                    });
                }

                // Si pasó todas las validaciones, desactivar
                await db.query(
                    'UPDATE depositos SET activo = 0 WHERE id = ?',
                    [deposito.id]
                );

                logger.info(`Depósito desactivado exitosamente para vendedor ${id}`);
            }

            // Actualizar el campo tiene_deposito en el vendedor
            updateData.tiene_deposito = tieneDepositoNuevo ? 1 : 0;
        }

        // 🔧 Actualizar vendedor usando el modelo
        const vendedorActualizado = await this.vendedorModel.update(id, updateData);

        // Obtener información completa del vendedor actualizado incluyendo depósito
        const vendedorCompleto = await db.query(`
            SELECT 
                v.*,
                d.id as deposito_id,
                d.nombre as deposito_nombre,
                d.activo as deposito_activo,
                COUNT(DISTINCT c.clienteId) as total_clientes,
                (SELECT COUNT(*) FROM stock_depositos sd 
                 WHERE sd.deposito_id = d.id AND sd.cantidad > 0) as items_con_stock
            FROM vendedores v
            LEFT JOIN depositos d ON v.vendedorId = d.entity_id AND d.tipo = 'VENDEDOR'
            LEFT JOIN clientes c ON v.vendedorId = c.vendedorId AND c.activo = 1
            WHERE v.vendedorId = ?
            GROUP BY v.vendedorId
        `, [id]);

        res.json({
            success: true,
            message: 'Vendedor actualizado exitosamente',
            data: vendedorCompleto[0] || vendedorActualizado
        });

    } catch (error) {
        logger.error('Error en update vendedor:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar vendedor',
            error: error.message
        });
    }
}

    // DELETE /api/v1/vendedores/:id - Eliminar vendedor
    async destroy(req, res) {
        try {
            const { id } = req.params;

            // Verificar si el vendedor existe
            const vendedor = await db.query(
                'SELECT vendedorId FROM vendedores WHERE vendedorId = ? AND activo = 1',
                [id]
            );

            if (!vendedor || vendedor.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Vendedor no encontrado'
                });
            }

            // Verificar si tiene clientes asignados
            const clientesAsignados = await db.query(
                'SELECT COUNT(*) as count FROM clientes WHERE vendedorId = ? AND activo = 1',
                [id]
            );

            if (clientesAsignados[0].count > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No se puede eliminar el vendedor porque tiene clientes asignados'
                });
            }

            // Verificar si tiene stock
            const tieneStock = await db.query(`
                SELECT COUNT(*) as count FROM stock_depositos sd
                INNER JOIN depositos d ON sd.deposito_id = d.id
                WHERE d.entity_id = ? AND d.tipo = 'VENDEDOR' AND sd.cantidad > 0
            `, [id]);

            if (tieneStock[0].count > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No se puede eliminar el vendedor porque tiene stock en su depósito'
                });
            }

            // Soft delete del vendedor usando el modelo
            await this.vendedorModel.update(id, { activo: 0 });

            // Desactivar depósito asociado si existe
            await db.query(
                'UPDATE depositos SET activo = 0 WHERE entity_id = ? AND tipo = "VENDEDOR"',
                [id]
            );

            res.json({
                success: true,
                message: 'Vendedor eliminado exitosamente'
            });
        } catch (error) {
            logger.error('Error en destroy vendedor:', error);
            res.status(500).json({
                success: false,
                message: 'Error al eliminar vendedor',
                error: error.message
            });
        }
    }

    // GET /api/v1/vendedores/:id/clientes - Obtener clientes de un vendedor
    async getClientes(req, res) {
        try {
            const { id } = req.params;
            const { activo = 1, tiene_deposito } = req.query;

            let whereClause = 'WHERE c.vendedorId = ?';
            let params = [id];

            if (activo !== undefined) {
                whereClause += ' AND c.activo = ?';
                params.push(activo);
            }

            if (tiene_deposito !== undefined) {
                whereClause += ' AND c.tiene_deposito = ?';
                params.push(tiene_deposito === 'true' ? 1 : 0);
            }

            const sql = `
                SELECT 
                    c.*,
                    z.zona as zona_nombre,
                    d.id as deposito_id,
                    d.nombre as deposito_nombre,
                    (SELECT COUNT(*) FROM stock_depositos sd 
                     INNER JOIN depositos dep ON sd.deposito_id = dep.id 
                     WHERE dep.tipo = 'CLIENTE' AND dep.entity_id = c.clienteId AND sd.cantidad > 0) as items_stock
                FROM clientes c
                LEFT JOIN zonas z ON c.zonaId = z.zonaId
                LEFT JOIN depositos d ON c.clienteId = d.entity_id AND d.tipo = 'CLIENTE' AND d.activo = 1
                ${whereClause}
                ORDER BY c.razonSocial
            `;

            const clientes = await db.query(sql, params);

            res.json({
                success: true,
                data: clientes,
                total: clientes.length
            });
        } catch (error) {
            logger.error('Error en getClientes vendedor:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener clientes del vendedor',
                error: error.message
            });
        }
    }

    // GET /api/v1/vendedores/:id/stock - Obtener stock de un vendedor
    async getStock(req, res) {
        try {
            const { id } = req.params;
            const { categoria_id, bajo_stock = false } = req.query;

            let whereClause = 'WHERE d.entity_id = ? AND d.tipo = "VENDEDOR" AND d.activo = 1';
            let params = [id];

            if (categoria_id) {
                whereClause += ' AND m.id_categoria = ?';
                params.push(categoria_id);
            }

            if (bajo_stock === 'true') {
                whereClause += ' AND sd.cantidad <= m.stock_minimo';
            }

            const sql = `
                SELECT 
                    m.id as mercaderia_id,
                    m.descripcion,
                    m.codigo_sku,
                    m.precio_venta,
                    m.stock_minimo,
                    sd.cantidad,
                    d.nombre as deposito_nombre,
                    c.categoria as categoria,
                    CASE 
                        WHEN sd.cantidad <= m.stock_minimo THEN 'BAJO'
                        WHEN sd.cantidad = 0 THEN 'SIN_STOCK'
                        ELSE 'NORMAL'
                    END as estado_stock
                FROM stock_depositos sd
                INNER JOIN depositos d ON sd.deposito_id = d.id
                INNER JOIN mercaderias m ON sd.mercaderia_id = m.id
                LEFT JOIN categorias c ON m.id_categoria = c.id
                ${whereClause}
                ORDER BY m.descripcion
            `;

            const stock = await db.query(sql, params);

            // Calcular estadísticas
            const stats = {
                total_items: stock.length,
                total_cantidad: stock.reduce((sum, item) => sum + item.cantidad, 0),
                items_bajo_stock: stock.filter(item => item.estado_stock === 'BAJO').length,
                items_sin_stock: stock.filter(item => item.estado_stock === 'SIN_STOCK').length,
                valor_total: stock.reduce((sum, item) => sum + (item.cantidad * item.precio_venta), 0)
            };

            res.json({
                success: true,
                data: stock,
                estadisticas: stats,
                total: stock.length
            });
        } catch (error) {
            logger.error('Error en getStock vendedor:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener stock del vendedor',
                error: error.message
            });
        }
    }

    // Método auxiliar para toggle de estados
    async toggleDeposito(req, res) {
        try {
            const { id } = req.params;

            // Implementación básica del toggle deposito
            res.json({
                success: true,
                message: 'Toggle depósito implementado'
            });
        } catch (error) {
            logger.error('Error en toggleDeposito:', error);
            res.status(500).json({
                success: false,
                message: 'Error al cambiar estado del depósito'
            });
        }
    }

    // Método auxiliar para comisiones
    async getComisiones(req, res) {
        try {
            const { id } = req.params;

            // Implementación básica de comisiones
            res.json({
                success: true,
                data: [],
                message: 'Comisiones en desarrollo'
            });
        } catch (error) {
            logger.error('Error en getComisiones:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener comisiones'
            });
        }
    }

    /**
 * GET /api/v1/vendedores/sin-deposito
 * Obtener vendedores que NO tienen depósito asignado
 */
async getSinDeposito(req, res) {
    try {
        logger.info('🏪 Obteniendo vendedores sin depósito');

        const sql = `
            SELECT 
                v.vendedorId,
                v.razonSocial,
                v.cuit,
                v.email,
                v.telefono,
                v.domicilio,
                v.localidad,
                v.activo,
                COUNT(DISTINCT c.clienteId) as total_clientes
            FROM vendedores v
            LEFT JOIN depositos d ON v.vendedorId = d.entity_id AND d.tipo = 'VENDEDOR' AND d.activo = 1
            LEFT JOIN clientes c ON v.vendedorId = c.vendedorId AND c.activo = 1
            WHERE v.activo = 1 
            AND d.id IS NULL  -- No tiene depósito asignado
            GROUP BY v.vendedorId
            ORDER BY v.razonSocial ASC
        `;

        const vendedores = await db.query(sql);

        res.json({
            success: true,
            data: vendedores,
            total: vendedores.length,
            message: `Se encontraron ${vendedores.length} vendedores sin depósito`
        });

    } catch (error) {
        logger.error('Error en getSinDeposito vendedores:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener vendedores sin depósito',
            error: error.message
        });
    }
}
}

// 🔧 EXPORTAR INSTANCIA con métodos ya bindados
module.exports = new VendedoresController();