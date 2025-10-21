// =============================================
// controllers/DepositosController.js - Controlador de Depósitos
// =============================================
const Deposito = require('../models/Deposito');
const db = require('../config/database');
const logger = require('../config/logger');

class DepositosController {
    // Listar todos los depósitos
    async index(req, res) {
    try {
        console.log('📦 DepositosController.index ejecutándose');
        
        // Obtener parámetros de filtro
        const { tipo, activo, search, entity_id } = req.query;

        let whereClause = 'WHERE d.activo = 1';
        let params = [];

        if (tipo) {
            whereClause += ' AND d.tipo = ?';
            params.push(tipo);
        }

        if (activo !== undefined) {
            whereClause += ' AND d.activo = ?';
            params.push(activo === 'true' ? 1 : 0);
        }

        if (entity_id) {
            whereClause += ' AND d.entity_id = ?';
            params.push(entity_id);
        }

        if (search) {
            whereClause += ' AND (d.nombre LIKE ? OR d.direccion LIKE ?)';
            const searchParam = `%${search}%`;
            params.push(searchParam, searchParam);
        }

        // SQL CORREGIDO con nombres de columnas correctos
        const sql = `
            SELECT 
                d.id,
                d.nombre,
                d.tipo,
                d.entity_id,
                d.direccion,
                d.telefono,
                d.email,
                d.activo,
                d.fecha_creacion,
                d.ultima_modificacion,
                
                -- Información de la entidad asociada (CORREGIDO)
                CASE 
                    WHEN d.tipo = 'VENDEDOR' THEN v.razonSocial
                    WHEN d.tipo = 'CLIENTE' THEN c.razonSocial
                    ELSE 'N/A'
                END as entidad_nombre,
                
                -- Estadísticas de stock
                COALESCE(stock_count.items_stock, 0) as total_items,
                COALESCE(stock_count.total_unidades, 0) as total_unidades,
                COALESCE(stock_count.valor_total, 0) as valor_total

            FROM depositos d
            
            -- Joins CORREGIDOS para usar entity_id
            LEFT JOIN vendedores v ON d.entity_id = v.vendedorId AND d.tipo = 'VENDEDOR'
            LEFT JOIN clientes c ON d.entity_id = c.clienteId AND d.tipo = 'CLIENTE'
            
            -- Subquery para estadísticas de stock
            LEFT JOIN (
                SELECT 
                    sd.deposito_id, 
                    COUNT(DISTINCT sd.mercaderia_id) as items_stock,
                    SUM(sd.cantidad) as total_unidades,
                    SUM(sd.cantidad * COALESCE(m.precio_venta, 0)) as valor_total
                FROM stock_depositos sd
                INNER JOIN mercaderias m ON sd.mercaderia_id = m.id
                WHERE sd.cantidad > 0 AND m.activo = 1
                GROUP BY sd.deposito_id
            ) stock_count ON d.id = stock_count.deposito_id
            
            ${whereClause}
            
            ORDER BY 
                CASE d.tipo 
                    WHEN 'CENTRAL' THEN 1
                    WHEN 'VENDEDOR' THEN 2
                    WHEN 'CLIENTE' THEN 3
                    ELSE 4
                END,
                d.nombre ASC
        `;

        const depositos = await db.query(sql, params);

        // Agregar información adicional
        const depositosConInfo = depositos.map(deposito => ({
            ...deposito,
            // Formato de fechas más legible
            fecha_creacion_formatted: deposito.fecha_creacion ? 
                new Date(deposito.fecha_creacion).toLocaleDateString('es-AR') : null,
            ultima_modificacion_formatted: deposito.ultima_modificacion ? 
                new Date(deposito.ultima_modificacion).toLocaleDateString('es-AR') : null,
            
            // Badge info para el tipo
            tipo_badge: {
                'CENTRAL': { class: 'bg-primary', text: 'Central' },
                'VENDEDOR': { class: 'bg-success', text: 'Vendedor' },
                'CLIENTE': { class: 'bg-info', text: 'Cliente' }
            }[deposito.tipo] || { class: 'bg-secondary', text: deposito.tipo }
        }));

        console.log(`📦 Encontrados ${depositosConInfo.length} depósitos`);

        res.json({
            success: true,
            data: depositosConInfo,
            total: depositosConInfo.length,
            filtros_aplicados: { tipo, activo, search, entity_id }
        });

    } catch (error) {
        console.error('❌ Error en DepositosController.index:', error);
        res.status(500).json({
            success: false,
            message: 'Error obteniendo depósitos',
            error: error.message
        });
    }
}

    
    
    async create(req, res) {
    try {
        const { nombre, tipo, entity_id, direccion, telefono, email } = req.body;
        
        console.log('📦 DepositosController.create ejecutándose:', { nombre, tipo, entity_id });

        // Validaciones básicas
        if (!nombre || !tipo) {
            return res.status(400).json({
                success: false,
                message: 'Nombre y tipo son campos obligatorios'
            });
        }

        // Validar tipos permitidos
        const tiposPermitidos = ['CENTRAL', 'VENDEDOR', 'CLIENTE'];
        if (!tiposPermitidos.includes(tipo)) {
            return res.status(400).json({
                success: false,
                message: 'Tipo de depósito no válido'
            });
        }

        // Si es VENDEDOR o CLIENTE, entity_id es obligatorio
        if ((tipo === 'VENDEDOR' || tipo === 'CLIENTE') && !entity_id) {
            return res.status(400).json({
                success: false,
                message: `Debe especificar un ${tipo.toLowerCase()} para este tipo de depósito`
            });
        }

        // Verificar que no existe otro depósito con el mismo nombre
        const existeNombre = await db.query(
            'SELECT id FROM depositos WHERE nombre = ? AND activo = 1',
            [nombre]
        );

        if (existeNombre.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Ya existe un depósito con ese nombre'
            });
        }

        // Si es VENDEDOR o CLIENTE, verificar que la entidad existe y no tiene depósito
        if (tipo === 'VENDEDOR') {
            const vendedor = await db.query(
                'SELECT vendedorId FROM vendedores WHERE vendedorId = ? AND activo = 1',
                [entity_id]
            );
            
            if (vendedor.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Vendedor no encontrado'
                });
            }

            // Verificar que no tenga depósito
            const tieneDeposito = await db.query(
                'SELECT id FROM depositos WHERE entity_id = ? AND tipo = "VENDEDOR" AND activo = 1',
                [entity_id]
            );

            if (tieneDeposito.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Este vendedor ya tiene un depósito asignado'
                });
            }
        }

        if (tipo === 'CLIENTE') {
            const cliente = await db.query(
                'SELECT clienteId FROM clientes WHERE clienteId = ? AND activo = 1',
                [entity_id]
            );
            
            if (cliente.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Cliente no encontrado'
                });
            }

            // Verificar que no tenga depósito
            const tieneDeposito = await db.query(
                'SELECT id FROM depositos WHERE entity_id = ? AND tipo = "CLIENTE" AND activo = 1',
                [entity_id]
            );

            if (tieneDeposito.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Este cliente ya tiene un depósito asignado'
                });
            }
        }

        // Insertar nuevo depósito - USAR NOMBRES CORRECTOS
        const result = await db.query(`
            INSERT INTO depositos (nombre, tipo, entity_id, direccion, telefono, email, activo, fecha_creacion)
            VALUES (?, ?, ?, ?, ?, ?, 1, NOW())
        `, [
            nombre,
            tipo,
            entity_id || null,
            direccion || null,
            telefono || null,
            email || null
        ]);

        const nuevoDepositoId = result.insertId;

        // Obtener el depósito creado con información completa
        const nuevoDeposito = await db.query(`
            SELECT 
                d.*,
                CASE 
                    WHEN d.tipo = 'VENDEDOR' THEN v.razonSocial
                    WHEN d.tipo = 'CLIENTE' THEN c.razonSocial
                    ELSE 'N/A'
                END as entidad_nombre
            FROM depositos d
            LEFT JOIN vendedores v ON d.entity_id = v.vendedorId AND d.tipo = 'VENDEDOR'
            LEFT JOIN clientes c ON d.entity_id = c.clienteId AND d.tipo = 'CLIENTE'
            WHERE d.id = ?
        `, [nuevoDepositoId]);

        console.log(`✅ Depósito creado exitosamente: ${nombre} (ID: ${nuevoDepositoId})`);

        res.status(201).json({
            success: true,
            message: 'Depósito creado exitosamente',
            data: nuevoDeposito[0]
        });

    } catch (error) {
        console.error('❌ Error en DepositosController.create:', error);
        res.status(500).json({
            success: false,
            message: 'Error creando depósito',
            error: error.message
        });
    }
}

    /**
 * GET /api/v1/depositos/:id
 * Obtener depósito específico con información completa
 */
async show(req, res) {
    try {
        const { id } = req.params;
        console.log(`📦 DepositosController.show ejecutándose para ID: ${id}`);

        if (!id || isNaN(parseInt(id))) {
            return res.status(400).json({
                success: false,
                message: 'ID de depósito inválido'
            });
        }

        // SQL CORREGIDO para show
        const sql = `
            SELECT 
                d.id,
                d.nombre,
                d.tipo,
                d.entity_id,
                d.direccion,
                d.telefono,
                d.email,
                d.activo,
                d.fecha_creacion,
                d.ultima_modificacion,
                
                -- Información de la entidad asociada
                CASE 
                    WHEN d.tipo = 'VENDEDOR' THEN v.razonSocial
                    WHEN d.tipo = 'CLIENTE' THEN c.razonSocial
                    ELSE NULL
                END as entidad_nombre,
                
                CASE 
                    WHEN d.tipo = 'VENDEDOR' THEN v.cuit
                    WHEN d.tipo = 'CLIENTE' THEN c.cuit
                    ELSE NULL
                END as entidad_cuit,
                
                -- Estadísticas de stock
                COUNT(DISTINCT sd.mercaderia_id) as total_items,
                COALESCE(SUM(sd.cantidad), 0) as cantidad_total,
                COALESCE(SUM(sd.cantidad * COALESCE(m.precio_venta, 0)), 0) as valor_total
                
            FROM depositos d
            LEFT JOIN vendedores v ON d.entity_id = v.vendedorId AND d.tipo = 'VENDEDOR'
            LEFT JOIN clientes c ON d.entity_id = c.clienteId AND d.tipo = 'CLIENTE'
            LEFT JOIN stock_depositos sd ON d.id = sd.deposito_id AND sd.cantidad > 0
            LEFT JOIN mercaderias m ON sd.mercaderia_id = m.id
            WHERE d.id = ? AND d.activo = 1
            GROUP BY d.id
        `;

        const result = await db.query(sql, [id]);

        if (result.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Depósito no encontrado'
            });
        }

        res.json({
            success: true,
            data: result[0]
        });

    } catch (error) {
        console.error('❌ Error en DepositosController.show:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener depósito',
            error: error.message
        });
    }
}
/**
 * PUT /api/v1/depositos/:id
 * Actualizar depósito existente
 */
async update(req, res) {
    try {
        const { id } = req.params;
        const { nombre, tipo, entity_id, direccion, telefono, email, activo } = req.body;

        console.log(`📦 DepositosController.update ejecutándose para ID: ${id}`);

        // Validar ID
        if (!id || isNaN(parseInt(id))) {
            return res.status(400).json({
                success: false,
                message: 'ID de depósito inválido'
            });
        }

        // Validar datos requeridos
        if (!nombre || !tipo) {
            return res.status(400).json({
                success: false,
                message: 'Nombre y tipo son campos obligatorios'
            });
        }

        // Verificar que el depósito existe
        const depositoExistente = await db.query(`
            SELECT id, nombre, tipo FROM depositos WHERE id = ? AND activo = 1
        `, [id]);

        if (depositoExistente.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Depósito no encontrado'
            });
        }

        // Si es tipo VENDEDOR o CLIENTE, validar entity_id
        if ((tipo === 'VENDEDOR' || tipo === 'CLIENTE') && !entity_id) {
            return res.status(400).json({
                success: false,
                message: `Debe especificar un ${tipo.toLowerCase()} para este tipo de depósito`
            });
        }

        // Verificar que no existe otro depósito con el mismo nombre (excluyendo el actual)
        const nombreDuplicado = await db.query(`
            SELECT id FROM depositos 
            WHERE nombre = ? AND id != ? AND activo = 1
        `, [nombre, id]);

        if (nombreDuplicado.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Ya existe un depósito con ese nombre'
            });
        }

        // Actualizar depósito
        await db.query(`
            UPDATE depositos 
            SET nombre = ?, tipo = ?, entity_id = ?, direccion = ?, 
                telefono = ?, email = ?, activo = ?, updated_at = NOW()
            WHERE id = ?
        `, [
            nombre, 
            tipo, 
            entity_id || null, 
            direccion || null, 
            telefono || null, 
            email || null, 
            activo !== undefined ? activo : 1,
            id
        ]);

        // Obtener depósito actualizado
        const depositoActualizado = await db.query(`
            SELECT * FROM depositos WHERE id = ?
        `, [id]);

        res.json({
            success: true,
            message: 'Depósito actualizado exitosamente',
            data: depositoActualizado[0]
        });

    } catch (error) {
        console.error('❌ Error en DepositosController.update:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar depósito',
            error: error.message
        });
    }
}

/**
 * DELETE /api/v1/depositos/:id
 * Eliminar depósito (soft delete con validaciones)
 */
async destroy(req, res) {
    try {
        const { id } = req.params;
        console.log(`📦 DepositosController.destroy ejecutándose para ID: ${id}`);

        // Validar ID
        if (!id || isNaN(parseInt(id))) {
            return res.status(400).json({
                success: false,
                message: 'ID de depósito inválido'
            });
        }

        // Verificar que el depósito existe
        const depositoExistente = await db.query(`
            SELECT id, nombre, tipo FROM depositos WHERE id = ? AND activo = 1
        `, [id]);

        if (depositoExistente.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Depósito no encontrado'
            });
        }

        // Verificar que no sea el depósito central (no se puede eliminar)
        if (depositoExistente[0].tipo === 'CENTRAL') {
            return res.status(400).json({
                success: false,
                message: 'No se puede eliminar el depósito central'
            });
        }

        // Verificar que no tenga stock
        const tieneStock = await db.query(`
            SELECT COUNT(*) as total FROM stock_depositos 
            WHERE deposito_id = ? AND cantidad > 0
        `, [id]);

        if (tieneStock[0].total > 0) {
            return res.status(400).json({
                success: false,
                message: 'No se puede eliminar un depósito que tiene stock. Primero debe transferir todo el stock.'
            });
        }

        // Verificar que no tenga movimientos pendientes
        const movimientosPendientes = await db.query(`
            SELECT COUNT(*) as total FROM ordenes_transferencia 
            WHERE (deposito_origen_id = ? OR deposito_destino_id = ?) 
            AND estado IN ('PENDIENTE', 'PARCIAL')
        `, [id, id]);

        if (movimientosPendientes[0].total > 0) {
            return res.status(400).json({
                success: false,
                message: 'No se puede eliminar un depósito con transferencias pendientes'
            });
        }

        // Soft delete del depósito
        await db.query(`
            UPDATE depositos 
            SET activo = 0, updated_at = NOW()
            WHERE id = ?
        `, [id]);

        res.json({
            success: true,
            message: 'Depósito eliminado exitosamente',
            data: { 
                id: parseInt(id), 
                nombre: depositoExistente[0].nombre,
                eliminado: true 
            }
        });

    } catch (error) {
        console.error('❌ Error en DepositosController.destroy:', error);
        res.status(500).json({
            success: false,
            message: 'Error al eliminar depósito',
            error: error.message
        });
    }
}

    // Eliminar un depósito (soft delete)
    async destroy(req, res) {
        try {
            const { id } = req.params;
            console.log(`📦 DepositosController.destroy ejecutándose para ID: ${id}`);

            // Validar ID
            if (!id || isNaN(parseInt(id))) {
                return res.status(400).json({
                    success: false,
                    message: 'ID de depósito inválido'
                });
            }

            // Verificar que el depósito existe
            const depositoExistente = await db.query(`
                SELECT id, nombre FROM depositos WHERE id = ? AND activo = 1
            `, [id]);

            if (depositoExistente.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Depósito no encontrado'
                });
            }

            // Verificar que no tenga stock antes de eliminar
            const tieneStock = await db.query(`
                SELECT COUNT(*) as total FROM stock_depositos WHERE deposito_id = ? AND cantidad > 0
            `, [id]);

            if (tieneStock[0].total > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No se puede eliminar un depósito que tiene stock. Primero debe transferir o eliminar todo el stock.'
                });
            }

            // Soft delete del depósito
            await db.query(`
                UPDATE depositos 
                SET activo = 0, fecha_eliminacion = NOW()
                WHERE id = ?
            `, [id]);

            res.json({
                success: true,
                message: 'Depósito eliminado exitosamente',
                data: { 
                    id: parseInt(id), 
                    nombre: depositoExistente[0].nombre,
                    eliminado: true,
                    fecha_eliminacion: new Date().toISOString()
                }
            });

        } catch (error) {
            console.error('❌ Error en DepositosController.destroy:', error);
            res.status(500).json({
                success: false,
                message: 'Error eliminando depósito',
                error: error.message
            });
        }
    }

    // Obtener stock de un depósito específico
    async getStock(req, res) {
        try {
            const { id } = req.params;
            console.log(`📦 DepositosController.getStock ejecutándose para depósito ID: ${id}`);

            // Validar ID del depósito
            if (!id || isNaN(parseInt(id))) {
                return res.status(400).json({
                    success: false,
                    message: 'ID de depósito inválido'
                });
            }

            // 1. Verificar que el depósito existe
            const deposito = await db.query(`
                SELECT 
                    id,
                    nombre,
                    tipo,
                    direccion,
                    telefono,
                    email,
                    activo
                FROM depositos 
                WHERE id = ? AND activo = 1
            `, [id]);

            if (deposito.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Depósito no encontrado'
                });
            }

            // 2. Obtener stock del depósito con información completa de mercaderías
            const stockDeposito = await db.query(`
                SELECT 
                    sd.id,
                    sd.mercaderia_id,
                    sd.cantidad,
                    sd.fecha_actualizacion,
                    m.descripcion,
                    m.codigo_sku,
                    m.precio_costo,
                    m.precio_venta,
                    m.stock_minimo,
                    m.unidad_medida,
                    m.imagen,
                    c.categoria as categoria,
                    (sd.cantidad * m.precio_venta) as valor_total,
                    CASE 
                        WHEN sd.cantidad = 0 THEN 'SIN_STOCK'
                        WHEN sd.cantidad <= m.stock_minimo THEN 'STOCK_BAJO'
                        WHEN sd.cantidad <= (m.stock_minimo * 2) THEN 'STOCK_MEDIO'
                        ELSE 'STOCK_BUENO'
                    END as estado_stock
                FROM stock_depositos sd
                INNER JOIN mercaderias m ON sd.mercaderia_id = m.id
                LEFT JOIN categorias c ON m.id_categoria = c.id
                WHERE sd.deposito_id = ? 
                AND sd.cantidad > 0
                AND m.activo = 1
                ORDER BY m.descripcion
            `, [id]);

            // 3. Calcular estadísticas del stock
            const estadisticas = {
                total_items_diferentes: stockDeposito.length,
                cantidad_total_unidades: stockDeposito.reduce((total, item) => total + parseInt(item.cantidad), 0),
                valor_total_stock: stockDeposito.reduce((total, item) => total + parseFloat(item.valor_total || 0), 0),
                items_con_stock_bajo: 0,
                items_sin_stock: 0,
                porcentaje_stock_bajo: 0
            };

            // 4. Identificar items con stock bajo y calcular estadísticas
            const itemsStockBajo = stockDeposito.filter(item => {
                return parseInt(item.cantidad) <= parseInt(item.stock_minimo || 0);
            });

            const itemsSinStock = stockDeposito.filter(item => {
                return parseInt(item.cantidad) === 0;
            });

            estadisticas.items_con_stock_bajo = itemsStockBajo.length;
            estadisticas.items_sin_stock = itemsSinStock.length;
            estadisticas.porcentaje_stock_bajo = estadisticas.total_items_diferentes > 0 ? 
                Math.round((itemsStockBajo.length / estadisticas.total_items_diferentes) * 100) : 0;

            // 5. Obtener movimientos recientes del depósito (últimos 10)
            const movimientosRecientes = await db.query(`
                SELECT 
                    ms.id,
                    ms.tipo_movimiento,
                    ms.cantidad,
                    ms.fecha_movimiento,
                    ms.motivo,
                    ms.numero_documento,
                    m.descripcion as mercaderia,
                    m.codigo_sku,
                    u.nombre as usuario
                FROM movimientos_stock ms
                INNER JOIN mercaderias m ON ms.mercaderia_id = m.id
                LEFT JOIN usuarios u ON ms.usuario_id = u.id
                WHERE (ms.deposito_origen_id = ? OR ms.deposito_destino_id = ?)
                ORDER BY ms.fecha_movimiento DESC
                LIMIT 10
            `, [id, id]);

            // 6. Formatear stock para respuesta
            const stockFormateado = stockDeposito.map(item => ({
                id: item.id,
                mercaderia_id: item.mercaderia_id,
                descripcion: item.descripcion,
                codigo_sku: item.codigo_sku,
                codigo_code128: item.codigo_code128,
                cantidad: parseInt(item.cantidad),
                stock_minimo: parseInt(item.stock_minimo || 0),
                unidad_medida: item.unidad_medida,
                precio_unitario: parseFloat(item.precio_venta || 0),
                precio_costo: parseFloat(item.precio_costo || 0),
                valor_total: parseFloat(item.valor_total || 0),
                categoria: item.categoria,
                estado_stock: item.estado_stock,
                imagen: item.imagen,
                fecha_actualizacion: item.fecha_actualizacion
            }));

            // 7. Preparar alertas
            const alertas = [];
            if (itemsStockBajo.length > 0) {
                alertas.push({
                    tipo: 'STOCK_BAJO',
                    mensaje: `${itemsStockBajo.length} producto(s) con stock por debajo del mínimo`,
                    prioridad: 'ALTA',
                    items: itemsStockBajo.map(item => ({
                        descripcion: item.descripcion,
                        codigo_sku: item.codigo_sku,
                        cantidad_actual: parseInt(item.cantidad),
                        stock_minimo: parseInt(item.stock_minimo || 0),
                        diferencia: parseInt(item.cantidad) - parseInt(item.stock_minimo || 0)
                    }))
                });
            }

            // 8. Respuesta completa
            const respuesta = {
                success: true,
                deposito: {
                    id: deposito[0].id,
                    nombre: deposito[0].nombre,
                    tipo: deposito[0].tipo,
                    direccion: deposito[0].direccion,
                    telefono: deposito[0].telefono,
                    email: deposito[0].email
                },
                stock: stockFormateado,
                estadisticas: estadisticas,
                alertas: alertas,
                movimientos_recientes: movimientosRecientes.map(mov => ({
                    id: mov.id,
                    tipo: mov.tipo_movimiento,
                    mercaderia: mov.mercaderia,
                    codigo_sku: mov.codigo_sku,
                    cantidad: mov.cantidad,
                    fecha: mov.fecha_movimiento,
                    motivo: mov.motivo,
                    numero_documento: mov.numero_documento,
                    usuario: mov.usuario
                })),
                fecha_consulta: new Date().toISOString(),
                message: `Stock del depósito ${deposito[0].nombre} obtenido exitosamente`
            };

            res.json(respuesta);

        } catch (error) {
            console.error('❌ Error en DepositosController.getStock:', error);
            res.status(500).json({
                success: false,
                message: 'Error obteniendo stock del depósito',
                error: error.message,
                deposito_id: req.params.id
            });
        }
    }
}

module.exports = new DepositosController();