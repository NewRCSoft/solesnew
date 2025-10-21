// =============================================
// routes/reportes.js - Rutas de Reportes COMPLETAS
// =============================================
const express = require('express');
const router = express.Router();
const ReportesController = require('../controllers/ReportesController');

// =============================================
// DASHBOARD PRINCIPAL
// =============================================
router.get('/dashboard', ReportesController.getDashboard);

// =============================================
// REPORTES DE STOCK
// =============================================

// Reporte general de stock (delegado a StockController)
router.get('/stock/general', async (req, res) => {
    try {
        const StockController = require('../controllers/StockController');
        await StockController.getStockGeneral(req, res);
    } catch (error) {
        logger.error('Error en reporte stock general:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error en reporte de stock general',
            error: error.message 
        });
    }
});

// Stock bajo (delegado a MercaderiasController)
router.get('/stock/bajo', async (req, res) => {
    try {
        const MercaderiasController = require('../controllers/MercaderiasController');
        await MercaderiasController.getLowStock(req, res);
    } catch (error) {
        logger.error('Error en reporte stock bajo:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error en reporte de stock bajo',
            error: error.message 
        });
    }
});

// Reporte valorizado (NUEVO - completamente implementado)
router.get('/stock/valorizado', ReportesController.getStockValorizado);

// Alertas de stock crítico (NUEVO)
router.get('/stock/alertas', ReportesController.getAlertasStock);

// =============================================
// REPORTES DE MOVIMIENTOS
// =============================================

// Resumen de movimientos (NUEVO - completamente implementado)
router.get('/movimientos/resumen', ReportesController.getResumenMovimientos);

// Movimientos por período
router.get('/movimientos/periodo', async (req, res) => {
    try {
        const { fecha_desde, fecha_hasta, tipo, deposito_id, limit = 100 } = req.query;
        
        let whereClause = 'WHERE 1=1';
        let params = [];

        if (fecha_desde) {
            whereClause += ' AND DATE(ms.fecha_movimiento) >= ?';
            params.push(fecha_desde);
        }

        if (fecha_hasta) {
            whereClause += ' AND DATE(ms.fecha_movimiento) <= ?';
            params.push(fecha_hasta);
        }

        if (tipo) {
            whereClause += ' AND ms.tipo_movimiento = ?';
            params.push(tipo);
        }

        if (deposito_id) {
            whereClause += ' AND (ms.deposito_origen_id = ? OR ms.deposito_destino_id = ?)';
            params.push(deposito_id, deposito_id);
        }

        const db = require('../config/database');
        const movimientos = await db.query(`
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
            LEFT JOIN usuarios u ON ms.usuario_id = u.id
            ${whereClause}
            ORDER BY ms.fecha_movimiento DESC
            LIMIT ?
        `, [...params, parseInt(limit)]);

        res.json({
            success: true,
            data: movimientos,
            total: movimientos.length
        });

    } catch (error) {
        console.error('Error en movimientos por período:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error en reporte de movimientos por período',
            error: error.message 
        });
    }
});

// =============================================
// REPORTES DE VENDEDORES
// =============================================

// Performance de vendedores (NUEVO - completamente implementado)
router.get('/vendedores/performance', ReportesController.getPerformanceVendedores);

// Ranking de vendedores
router.get('/vendedores/ranking', async (req, res) => {
    try {
        const { mes, año, orden = 'ventas' } = req.query;
        
        const mesActual = mes || new Date().getMonth() + 1;
        const añoActual = año || new Date().getFullYear();

        let orderBy = 'ventas_totales DESC';
        if (orden === 'comisiones') orderBy = 'comisiones_totales DESC';
        else if (orden === 'pedidos') orderBy = 'total_pedidos DESC';
        else if (orden === 'clientes') orderBy = 'clientes_atendidos DESC';

        const db = require('../config/database');
        const ranking = await db.query(`
            SELECT 
                v.vendedorId,
                v.razonSocial as vendedor,
                COUNT(DISTINCT p.id) as total_pedidos,
                COUNT(DISTINCT p.clienteId) as clientes_atendidos,
                COALESCE(SUM(dp.cantidad * dp.precio_unitario), 0) as ventas_totales,
                COALESCE(SUM(dp.cantidad * dp.precio_unitario * v.comision / 100), 0) as comisiones_totales,
                RANK() OVER (ORDER BY ${orderBy}) as ranking
            FROM vendedores v
            LEFT JOIN pedidos p ON v.vendedorId = p.vendedorId 
                AND MONTH(p.fecha_completado) = ? 
                AND YEAR(p.fecha_completado) = ? 
                AND p.estado = 'COMPLETADO'
            LEFT JOIN detalles_pedido dp ON p.id = dp.pedido_id
            WHERE v.activo = 1
            GROUP BY v.vendedorId
            ORDER BY ${orderBy}
        `, [mesActual, añoActual]);

        res.json({
            success: true,
            data: ranking,
            criterio_orden: orden,
            periodo: { mes: mesActual, año: añoActual }
        });

    } catch (error) {
        console.error('Error en ranking vendedores:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error en ranking de vendedores',
            error: error.message 
        });
    }
});

// =============================================
// REPORTES DE CLIENTES
// =============================================

// Stock en clientes (NUEVO - completamente implementado)
router.get('/clientes/stock', ReportesController.getStockClientes);

// Top clientes por volumen
router.get('/clientes/top', async (req, res) => {
    try {
        const { limite = 10, mes, año, vendedor_id } = req.query;
        
        let whereClause = 'WHERE p.estado = "COMPLETADO"';
        let params = [];

        if (mes && año) {
            whereClause += ' AND MONTH(p.fecha_completado) = ? AND YEAR(p.fecha_completado) = ?';
            params.push(mes, año);
        }

        if (vendedor_id) {
            whereClause += ' AND c.vendedorId = ?';
            params.push(vendedor_id);
        }

        const db = require('../config/database');
        const topClientes = await db.query(`
            SELECT 
                c.clienteId,
                c.razonSocial as cliente,
                c.cuit,
                v.razonSocial as vendedor,
                COUNT(DISTINCT p.id) as total_pedidos,
                SUM(dp.cantidad) as total_items,
                SUM(dp.cantidad * dp.precio_unitario) as total_compras,
                AVG(dp.cantidad * dp.precio_unitario) as compra_promedio,
                MAX(p.fecha_completado) as ultima_compra
            FROM clientes c
            INNER JOIN pedidos p ON c.clienteId = p.clienteId
            INNER JOIN detalles_pedido dp ON p.id = dp.pedido_id
            LEFT JOIN vendedores v ON c.vendedorId = v.vendedorId
            ${whereClause}
            GROUP BY c.clienteId
            ORDER BY total_compras DESC
            LIMIT ?
        `, [...params, parseInt(limite)]);

        res.json({
            success: true,
            data: topClientes,
            limite: parseInt(limite)
        });

    } catch (error) {
        console.error('Error en top clientes:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error en top clientes',
            error: error.message 
        });
    }
});

// =============================================
// REPORTES DE DEPÓSITOS
// =============================================

// Ocupación de depósitos
router.get('/depositos/ocupacion', async (req, res) => {
    try {
        const { tipo } = req.query;

        let whereClause = 'WHERE d.activo = 1';
        let params = [];

        if (tipo) {
            whereClause += ' AND d.tipo = ?';
            params.push(tipo);
        }

        const db = require('../config/database');
        const ocupacion = await db.query(`
            SELECT 
                d.id,
                d.nombre,
                d.tipo,
                d.direccion,
                COUNT(DISTINCT sd.mercaderia_id) as items_diferentes,
                COALESCE(SUM(sd.cantidad), 0) as total_items,
                COALESCE(SUM(sd.cantidad * m.precio_venta), 0) as valor_total,
                CASE 
                    WHEN d.tipo = 'CENTRAL' THEN 'Alta'
                    WHEN d.tipo = 'VENDEDOR' THEN 'Media'
                    ELSE 'Baja'
                END as prioridad
            FROM depositos d
            LEFT JOIN stock_depositos sd ON d.id = sd.deposito_id
            LEFT JOIN mercaderias m ON sd.mercaderia_id = m.id AND m.activo = 1
            ${whereClause}
            GROUP BY d.id
            ORDER BY total_items DESC
        `, params);

        res.json({
            success: true,
            data: ocupacion
        });

    } catch (error) {
        console.error('Error en ocupación depósitos:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error en ocupación de depósitos',
            error: error.message 
        });
    }
});

// =============================================
// REPORTES FINANCIEROS
// =============================================

// Rentabilidad por producto
router.get('/financiero/rentabilidad', async (req, res) => {
    try {
        const { fecha_desde, fecha_hasta, categoria_id, limite = 20 } = req.query;
        
        const fechaHasta = fecha_hasta || new Date().toISOString().split('T')[0];
        const fechaDesde = fecha_desde || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        let whereClause = 'WHERE p.estado = "COMPLETADO" AND DATE(p.fecha_completado) BETWEEN ? AND ?';
        let params = [fechaDesde, fechaHasta];

        if (categoria_id) {
            whereClause += ' AND m.categoria_id = ?';
            params.push(categoria_id);
        }

        const db = require('../config/database');
        const rentabilidad = await db.query(`
            SELECT 
                m.id,
                m.descripcion,
                m.codigo_sku,
                m.precio_costo,
                m.precio_venta,
                c.nombre as categoria,
                SUM(dp.cantidad) as cantidad_vendida,
                SUM(dp.cantidad * m.precio_costo) as costo_total,
                SUM(dp.cantidad * dp.precio_unitario) as venta_total,
                (SUM(dp.cantidad * dp.precio_unitario) - SUM(dp.cantidad * m.precio_costo)) as margen_total,
                ((SUM(dp.cantidad * dp.precio_unitario) - SUM(dp.cantidad * m.precio_costo)) / SUM(dp.cantidad * m.precio_costo) * 100) as margen_porcentaje
            FROM mercaderias m
            INNER JOIN detalles_pedido dp ON m.id = dp.mercaderia_id
            INNER JOIN pedidos p ON dp.pedido_id = p.id
            LEFT JOIN categorias c ON m.categoria_id = c.id
            ${whereClause}
            GROUP BY m.id
            HAVING cantidad_vendida > 0
            ORDER BY margen_total DESC
            LIMIT ?
        `, [...params, parseInt(limite)]);

        const totales = {
            productos_analizados: rentabilidad.length,
            costo_total: rentabilidad.reduce((sum, p) => sum + p.costo_total, 0),
            venta_total: rentabilidad.reduce((sum, p) => sum + p.venta_total, 0),
            margen_total: rentabilidad.reduce((sum, p) => sum + p.margen_total, 0)
        };

        totales.margen_promedio = totales.costo_total > 0 
            ? (totales.margen_total / totales.costo_total * 100) 
            : 0;

        res.json({
            success: true,
            data: rentabilidad,
            totales: totales,
            periodo: { fecha_desde: fechaDesde, fecha_hasta: fechaHasta }
        });

    } catch (error) {
        console.error('Error en rentabilidad:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error en reporte de rentabilidad',
            error: error.message 
        });
    }
});

// =============================================
// REPORTES EJECUTIVOS
// =============================================

// Resumen ejecutivo
router.get('/ejecutivo/resumen', async (req, res) => {
    try {
        const { periodo = 'mes' } = req.query; // mes, trimestre, año
        
        let fechaCondicion = '';
        if (periodo === 'mes') {
            fechaCondicion = 'AND MONTH(p.fecha_completado) = MONTH(CURDATE()) AND YEAR(p.fecha_completado) = YEAR(CURDATE())';
        } else if (periodo === 'trimestre') {
            fechaCondicion = 'AND QUARTER(p.fecha_completado) = QUARTER(CURDATE()) AND YEAR(p.fecha_completado) = YEAR(CURDATE())';
        } else if (periodo === 'año') {
            fechaCondicion = 'AND YEAR(p.fecha_completado) = YEAR(CURDATE())';
        }

        const db = require('../config/database');
        const [resumen] = await db.query(`
            SELECT 
                COUNT(DISTINCT p.id) as total_pedidos,
                COUNT(DISTINCT p.clienteId) as clientes_activos,
                COUNT(DISTINCT p.vendedorId) as vendedores_operativos,
                SUM(dp.cantidad) as items_vendidos,
                SUM(dp.cantidad * dp.precio_unitario) as ventas_totales,
                AVG(dp.cantidad * dp.precio_unitario) as venta_promedio,
                (SELECT COUNT(*) FROM mercaderias WHERE activo = 1) as productos_activos,
                (SELECT COUNT(*) FROM depositos WHERE activo = 1) as depositos_activos
            FROM pedidos p
            INNER JOIN detalles_pedido dp ON p.id = dp.pedido_id
            WHERE p.estado = 'COMPLETADO' ${fechaCondicion}
        `);

        // Métricas adicionales
        const [alertas] = await db.query(`
            SELECT COUNT(*) as alertas_stock
            FROM mercaderias m
            LEFT JOIN stock_depositos sd ON m.id = sd.mercaderia_id
            WHERE m.activo = 1 AND m.stock_minimo > 0
            GROUP BY m.id
            HAVING COALESCE(SUM(sd.cantidad), 0) <= m.stock_minimo
        `);

        const resumenEjecutivo = {
            ...resumen,
            alertas_stock: alertas.length || 0,
            periodo: periodo
        };

        res.json({
            success: true,
            data: resumenEjecutivo
        });

    } catch (error) {
        console.error('Error en resumen ejecutivo:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error en resumen ejecutivo',
            error: error.message 
        });
    }
});

module.exports = router;