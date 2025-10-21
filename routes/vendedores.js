// =============================================
// routes/vendedores.js - Rutas de Vendedores
// =============================================
const express = require('express');
const router = express.Router();
const VendedoresController = require('../controllers/VendedoresController');

// =============================================
// RUTAS ESTÁTICAS (SIN PARÁMETROS) - DEBEN IR PRIMERO
// =============================================

// GET /api/v1/vendedores/stats/resumen - Estadísticas generales de vendedores
router.get('/stats/resumen', async (req, res) => {
    try {
        const db = require('../config/database');

        const stats = await db.query(`
            SELECT 
                COUNT(*) as total_vendedores,
                COUNT(CASE WHEN activo = 1 THEN 1 END) as vendedores_activos,
                COUNT(CASE WHEN EXISTS(SELECT 1 FROM depositos d WHERE d.entity_id = vendedorId AND d.tipo = 'VENDEDOR' AND d.activo = 1) THEN 1 END) as con_deposito,
                AVG(comision) as comision_promedio,
                (SELECT COUNT(DISTINCT c.clienteId) FROM clientes c INNER JOIN vendedores v ON c.vendedorId = v.vendedorId WHERE v.activo = 1) as total_clientes_asignados
            FROM vendedores
        `);

        const [estadisticas] = stats;

        res.json({
            success: true,
            data: estadisticas
        });
    } catch (error) {
        console.error('Error obteniendo estadísticas de vendedores:', error);
        res.status(500).json({
            success: false,
            message: 'Error obteniendo estadísticas de vendedores',
            error: error.message
        });
    }
});

// GET /api/v1/vendedores/sin-deposito - DEBE IR ANTES DE /:id
router.get('/sin-deposito', VendedoresController.getSinDeposito);

// =============================================
// RUTAS BÁSICAS CRUD
// =============================================

// GET /api/v1/vendedores - Listar vendedores
router.get('/', VendedoresController.index);

// GET /api/v1/vendedores/:id - Obtener vendedor específico
router.get('/:id', VendedoresController.show);

// POST /api/v1/vendedores - Crear nuevo vendedor
router.post('/', VendedoresController.create);

// PUT /api/v1/vendedores/:id - Actualizar vendedor
router.put('/:id', VendedoresController.update);

// DELETE /api/v1/vendedores/:id - Eliminar vendedor
router.delete('/:id', VendedoresController.destroy);

// =============================================
// RUTAS ESPECIALES CON PARÁMETROS
// =============================================

// GET /api/v1/vendedores/:id/clientes - Obtener clientes de un vendedor
router.get('/:id/clientes', VendedoresController.getClientes);

// GET /api/v1/vendedores/:id/stock - Obtener stock de un vendedor
router.get('/:id/stock', VendedoresController.getStock);

// PUT /api/v1/vendedores/:id/deposito/toggle - Alternar estado de depósito del vendedor
router.put('/:id/deposito/toggle', VendedoresController.toggleDeposito);

// GET /api/v1/vendedores/:id/comisiones - Calcular comisiones del vendedor
router.get('/:id/comisiones', VendedoresController.getComisiones);

// =============================================
// RUTAS ADICIONALES DE CONSULTA
// =============================================

// GET /api/v1/vendedores/:id/pedidos - Obtener pedidos de un vendedor
router.get('/:id/pedidos', async (req, res) => {
    try {
        const { id } = req.params;
        const { estado, cliente_id, fecha_desde, fecha_hasta, limit = 50 } = req.query;

        let whereClause = 'WHERE p.vendedorId = ?';
        let params = [id];

        if (estado) {
            whereClause += ' AND p.estado = ?';
            params.push(estado);
        }

        if (cliente_id) {
            whereClause += ' AND p.clienteId = ?';
            params.push(cliente_id);
        }

        if (fecha_desde) {
            whereClause += ' AND DATE(p.fecha_pedido) >= ?';
            params.push(fecha_desde);
        }

        if (fecha_hasta) {
            whereClause += ' AND DATE(p.fecha_pedido) <= ?';
            params.push(fecha_hasta);
        }

        const db = require('../config/database');
        const sql = `
            SELECT 
                p.*,
                c.razonSocial as cliente_nombre,
                c.cuit as cliente_cuit,
                COUNT(dp.id) as total_items,
                SUM(dp.cantidad * dp.precio_unitario) as total_monto,
                (SUM(dp.cantidad * dp.precio_unitario) * v.comision / 100) as comision_estimada
            FROM pedidos p
            INNER JOIN clientes c ON p.clienteId = c.clienteId
            INNER JOIN vendedores v ON p.vendedorId = v.vendedorId
            LEFT JOIN detalles_pedido dp ON p.id = dp.pedido_id
            ${whereClause}
            GROUP BY p.id
            ORDER BY p.fecha_pedido DESC
            LIMIT ?
        `;

        params.push(parseInt(limit));
        const pedidos = await db.query(sql, params);

        res.json({
            success: true,
            data: pedidos,
            total: pedidos.length
        });
    } catch (error) {
        console.error('Error obteniendo pedidos del vendedor:', error);
        res.status(500).json({
            success: false,
            message: 'Error obteniendo pedidos del vendedor',
            error: error.message
        });
    }
});

// GET /api/v1/vendedores/:id/transferencias - Obtener transferencias del vendedor
router.get('/:id/transferencias', async (req, res) => {
    try {
        const { id } = req.params;
        const { tipo, estado, fecha_desde, fecha_hasta, limit = 100 } = req.query;

        let whereClause = 'WHERE (do.entity_id = ? OR dd.entity_id = ?) AND (do.tipo = "VENDEDOR" OR dd.tipo = "VENDEDOR")';
        let params = [id, id];

        if (tipo) {
            whereClause += ' AND t.tipo = ?';
            params.push(tipo);
        }

        if (estado) {
            whereClause += ' AND t.estado = ?';
            params.push(estado);
        }

        if (fecha_desde) {
            whereClause += ' AND DATE(t.fecha_transferencia) >= ?';
            params.push(fecha_desde);
        }

        if (fecha_hasta) {
            whereClause += ' AND DATE(t.fecha_transferencia) <= ?';
            params.push(fecha_hasta);
        }

        const db = require('../config/database');
        const sql = `
            SELECT 
                t.*,
                do.nombre as deposito_origen,
                dd.nombre as deposito_destino,
                m.descripcion as mercaderia,
                m.codigo_sku,
                u.nombre as usuario_nombre,
                CASE 
                    WHEN do.entity_id = ? THEN 'SALIDA'
                    WHEN dd.entity_id = ? THEN 'ENTRADA'
                    ELSE 'TRANSITO'
                END as tipo_movimiento
            FROM transferencias t
            LEFT JOIN depositos do ON t.deposito_origen_id = do.id
            LEFT JOIN depositos dd ON t.deposito_destino_id = dd.id
            LEFT JOIN mercaderias m ON t.mercaderia_id = m.id
            LEFT JOIN usuarios u ON t.usuario_id = u.id
            ${whereClause}
            ORDER BY t.fecha_transferencia DESC
            LIMIT ?
        `;

        params.push(id, id, parseInt(limit));
        const transferencias = await db.query(sql, params);

        res.json({
            success: true,
            data: transferencias,
            total: transferencias.length
        });
    } catch (error) {
        console.error('Error obteniendo transferencias del vendedor:', error);
        res.status(500).json({
            success: false,
            message: 'Error obteniendo transferencias del vendedor',
            error: error.message
        });
    }
});

// PUT /api/v1/vendedores/:id/estado - Cambiar estado activo/inactivo
router.put('/:id/estado', async (req, res) => {
    try {
        const { id } = req.params;
        const { activo } = req.body;

        if (typeof activo !== 'boolean') {
            return res.status(400).json({
                success: false,
                message: 'El campo activo debe ser un boolean'
            });
        }

        const db = require('../config/database');
        
        // Verificar si el vendedor existe
        const [vendedor] = await db.query(
            'SELECT vendedorId FROM vendedores WHERE vendedorId = ?',
            [id]
        );

        if (!vendedor) {
            return res.status(404).json({
                success: false,
                message: 'Vendedor no encontrado'
            });
        }

        // Si se está desactivando, verificar restricciones
        if (!activo) {
            // Verificar clientes asignados
            const [clientesAsignados] = await db.query(
                'SELECT COUNT(*) as count FROM clientes WHERE vendedorId = ? AND activo = 1',
                [id]
            );

            if (clientesAsignados.count > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No se puede desactivar el vendedor porque tiene clientes asignados'
                });
            }

            // Verificar stock
            const [tieneStock] = await db.query(`
                SELECT COUNT(*) as count FROM stock_depositos sd
                INNER JOIN depositos d ON sd.deposito_id = d.id
                WHERE d.entity_id = ? AND d.tipo = 'VENDEDOR' AND sd.cantidad > 0
            `, [id]);

            if (tieneStock.count > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No se puede desactivar el vendedor porque tiene stock en su depósito'
                });
            }
        }

        await db.query(
            'UPDATE vendedores SET activo = ? WHERE vendedorId = ?',
            [activo ? 1 : 0, id]
        );

        // También actualizar estado del depósito si existe
        if (!activo) {
            await db.query(
                'UPDATE depositos SET activo = 0 WHERE entity_id = ? AND tipo = "VENDEDOR"',
                [id]
            );
        }

        res.json({
            success: true,
            message: `Vendedor ${activo ? 'activado' : 'desactivado'} exitosamente`
        });
    } catch (error) {
        console.error('Error cambiando estado del vendedor:', error);
        res.status(500).json({
            success: false,
            message: 'Error cambiando estado del vendedor',
            error: error.message
        });
    }
});

// GET /api/v1/vendedores/:id/estadisticas - Estadísticas detalladas del vendedor
router.get('/:id/estadisticas', async (req, res) => {
    try {
        const { id } = req.params;
        const { mes, año } = req.query;

        let fechaCondicion = '';
        let params = [id];

        if (mes && año) {
            fechaCondicion = 'AND MONTH(p.fecha_completado) = ? AND YEAR(p.fecha_completado) = ?';
            params.push(mes, año);
        }

        const db = require('../config/database');

        // Estadísticas generales
        const [stats] = await db.query(`
            SELECT 
                COUNT(DISTINCT c.clienteId) as total_clientes,
                COUNT(DISTINCT CASE WHEN c.activo = 1 THEN c.clienteId END) as clientes_activos,
                COUNT(DISTINCT p.id) as total_pedidos,
                COUNT(DISTINCT CASE WHEN p.estado = 'COMPLETADO' THEN p.id END) as pedidos_completados,
                COALESCE(SUM(CASE WHEN p.estado = 'COMPLETADO' THEN dp.cantidad * dp.precio_unitario END), 0) as ventas_totales,
                COALESCE(SUM(CASE WHEN p.estado = 'COMPLETADO' THEN dp.cantidad * dp.precio_unitario * v.comision / 100 END), 0) as comisiones_totales,
                (SELECT COUNT(*) FROM stock_depositos sd 
                 INNER JOIN depositos d ON sd.deposito_id = d.id 
                 WHERE d.entity_id = ? AND d.tipo = 'VENDEDOR' AND sd.cantidad > 0) as items_stock
            FROM vendedores v
            LEFT JOIN clientes c ON v.vendedorId = c.vendedorId
            LEFT JOIN pedidos p ON v.vendedorId = p.vendedorId ${fechaCondicion}
            LEFT JOIN detalles_pedido dp ON p.id = dp.pedido_id
            WHERE v.vendedorId = ?
        `, [...params, id]);

        // Top 5 clientes por ventas
        const topClientes = await db.query(`
            SELECT 
                c.clienteId,
                c.razonSocial,
                COUNT(p.id) as total_pedidos,
                SUM(dp.cantidad * dp.precio_unitario) as total_ventas
            FROM clientes c
            INNER JOIN pedidos p ON c.clienteId = p.clienteId
            INNER JOIN detalles_pedido dp ON p.id = dp.pedido_id
            WHERE c.vendedorId = ? AND p.estado = 'COMPLETADO' ${fechaCondicion}
            GROUP BY c.clienteId
            ORDER BY total_ventas DESC
            LIMIT 5
        `, params);

        // Top 5 productos más vendidos
        const topProductos = await db.query(`
            SELECT 
                m.id,
                m.descripcion,
                m.codigo_sku,
                SUM(dp.cantidad) as cantidad_vendida,
                SUM(dp.cantidad * dp.precio_unitario) as total_ventas
            FROM mercaderias m
            INNER JOIN detalles_pedido dp ON m.id = dp.mercaderia_id
            INNER JOIN pedidos p ON dp.pedido_id = p.id
            WHERE p.vendedorId = ? AND p.estado = 'COMPLETADO' ${fechaCondicion}
            GROUP BY m.id
            ORDER BY cantidad_vendida DESC
            LIMIT 5
        `, params);

        res.json({
            success: true,
            data: {
                estadisticas_generales: stats,
                top_clientes: topClientes,
                top_productos: topProductos
            }
        });
    } catch (error) {
        console.error('Error obteniendo estadísticas del vendedor:', error);
        res.status(500).json({
            success: false,
            message: 'Error obteniendo estadísticas del vendedor',
            error: error.message
        });
    }
});

module.exports = router;