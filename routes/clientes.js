// =============================================
// routes/clientes.js - Rutas de Clientes
// =============================================
const express = require('express');
const router = express.Router();
const ClientesController = require('../controllers/ClientesController');

// =============================================
// RUTAS BÁSICAS CRUD
// =============================================

router.get('/sin-deposito', ClientesController.getSinDeposito);


// GET /api/v1/clientes - Listar clientes
router.get('/', ClientesController.index);

// GET /api/v1/clientes/:id - Obtener cliente específico
router.get('/:id', ClientesController.show);

// POST /api/v1/clientes - Crear nuevo cliente
router.post('/', ClientesController.create);

// PUT /api/v1/clientes/:id - Actualizar cliente
router.put('/:id', ClientesController.update);

// DELETE /api/v1/clientes/:id - Eliminar cliente
router.delete('/:id', ClientesController.destroy);

// =============================================
// RUTAS ESPECIALES
// =============================================

// GET /api/v1/clientes/:id/stock - Obtener stock de un cliente
router.get('/:id/stock', ClientesController.getStock);

// GET /api/v1/clientes/vendedor/:vendedorId - Obtener clientes de un vendedor
router.get('/vendedor/:vendedorId', ClientesController.getByVendedor);

// PUT /api/v1/clientes/:id/deposito/toggle - Alternar estado de depósito del cliente
router.put('/:id/deposito/toggle', ClientesController.toggleDeposito);

// =============================================
// RUTAS ADICIONALES DE CONSULTA
// =============================================

// GET /api/v1/clientes/:id/pedidos - Obtener pedidos de un cliente
router.get('/:id/pedidos', async (req, res) => {
    try {
        const { id } = req.params;
        const { estado, fecha_desde, fecha_hasta, limit = 50 } = req.query;

        let whereClause = 'WHERE p.clienteId = ?';
        let params = [id];

        if (estado) {
            whereClause += ' AND p.estado = ?';
            params.push(estado);
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
                v.razonSocial as vendedor_nombre,
                COUNT(dp.id) as total_items,
                SUM(dp.cantidad * dp.precio_unitario) as total_monto
            FROM pedidos p
            LEFT JOIN vendedores v ON p.vendedorId = v.vendedorId
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
        console.error('Error obteniendo pedidos del cliente:', error);
        res.status(500).json({
            success: false,
            message: 'Error obteniendo pedidos del cliente',
            error: error.message
        });
    }
});

// GET /api/v1/clientes/:id/movimientos - Obtener movimientos de stock del cliente
router.get('/:id/movimientos', async (req, res) => {
    try {
        const { id } = req.params;
        const { tipo, fecha_desde, fecha_hasta, limit = 100 } = req.query;

        let whereClause = 'WHERE d.entity_id = ? AND d.tipo = "CLIENTE"';
        let params = [id];

        if (tipo) {
            whereClause += ' AND ms.tipo_movimiento = ?';
            params.push(tipo);
        }

        if (fecha_desde) {
            whereClause += ' AND DATE(ms.fecha_movimiento) >= ?';
            params.push(fecha_desde);
        }

        if (fecha_hasta) {
            whereClause += ' AND DATE(ms.fecha_movimiento) <= ?';
            params.push(fecha_hasta);
        }

        const db = require('../config/database');
        const sql = `
            SELECT 
                ms.*,
                m.descripcion as mercaderia,
                m.codigo_sku,
                COALESCE(do.nombre, 'N/A') as deposito_origen,
                COALESCE(dd.nombre, 'N/A') as deposito_destino,
                u.nombre as usuario
            FROM movimientos_stock ms
            LEFT JOIN mercaderias m ON ms.mercaderia_id = m.id
            LEFT JOIN depositos do ON ms.deposito_origen_id = do.id
            LEFT JOIN depositos dd ON ms.deposito_destino_id = dd.id
            LEFT JOIN depositos d ON (ms.deposito_origen_id = d.id OR ms.deposito_destino_id = d.id)
            LEFT JOIN usuarios u ON ms.usuario_id = u.id
            ${whereClause}
            ORDER BY ms.fecha_movimiento DESC
            LIMIT ?
        `;

        params.push(parseInt(limit));
        const movimientos = await db.query(sql, params);

        res.json({
            success: true,
            data: movimientos,
            total: movimientos.length
        });
    } catch (error) {
        console.error('Error obteniendo movimientos del cliente:', error);
        res.status(500).json({
            success: false,
            message: 'Error obteniendo movimientos del cliente',
            error: error.message
        });
    }
});

// PUT /api/v1/clientes/:id/estado - Cambiar estado activo/inactivo
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
        
        // Verificar si el cliente existe
        const [cliente] = await db.query(
            'SELECT clienteId FROM clientes WHERE clienteId = ?',
            [id]
        );

        if (!cliente) {
            return res.status(404).json({
                success: false,
                message: 'Cliente no encontrado'
            });
        }

        // Si se está desactivando, verificar restricciones
        if (!activo) {
            const [operacionesPendientes] = await db.query(`
                SELECT COUNT(*) as count FROM (
                    SELECT 1 FROM pedidos WHERE clienteId = ? AND estado IN ('PENDIENTE', 'PROCESANDO')
                    UNION ALL
                    SELECT 1 FROM stock_depositos sd 
                    INNER JOIN depositos d ON sd.deposito_id = d.id 
                    WHERE d.entity_id = ? AND d.tipo = 'CLIENTE' AND sd.cantidad > 0
                ) as operaciones
            `, [id, id]);

            if (operacionesPendientes.count > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No se puede desactivar el cliente porque tiene operaciones pendientes o stock'
                });
            }
        }

        await db.query(
            'UPDATE clientes SET activo = ? WHERE clienteId = ?',
            [activo ? 1 : 0, id]
        );

        // También actualizar estado del depósito si existe
        if (!activo) {
            await db.query(
                'UPDATE depositos SET activo = 0 WHERE entity_id = ? AND tipo = "CLIENTE"',
                [id]
            );
        }

        res.json({
            success: true,
            message: `Cliente ${activo ? 'activado' : 'desactivado'} exitosamente`
        });
    } catch (error) {
        console.error('Error cambiando estado del cliente:', error);
        res.status(500).json({
            success: false,
            message: 'Error cambiando estado del cliente',
            error: error.message
        });
    }
});

// GET /api/v1/clientes/stats/resumen - Estadísticas generales de clientes
router.get('/stats/resumen', async (req, res) => {
    try {
        const db = require('../config/database');

        const stats = await db.query(`
            SELECT 
                COUNT(*) as total_clientes,
                COUNT(CASE WHEN activo = 1 THEN 1 END) as clientes_activos,
                COUNT(CASE WHEN tiene_deposito = 1 THEN 1 END) as con_deposito,
                COUNT(DISTINCT vendedorId) as vendedores_asignados,
                COUNT(DISTINCT zonaId) as zonas_cubiertas
            FROM clientes
        `);

        const [estadisticas] = stats;

        res.json({
            success: true,
            data: estadisticas
        });
    } catch (error) {
        console.error('Error obteniendo estadísticas de clientes:', error);
        res.status(500).json({
            success: false,
            message: 'Error obteniendo estadísticas de clientes',
            error: error.message
        });
    }
});



module.exports = router;