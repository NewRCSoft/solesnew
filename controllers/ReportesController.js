// =============================================
// controllers/ReportesController.js - Sistema Completo de Reportes
// =============================================
const db = require('../config/database');
const logger = require('../config/logger');

class ReportesController {
    // GET /api/v1/reportes/dashboard - Dashboard principal MEJORADO
    async getDashboard(req, res) {
        try {
            // Obtener todas las métricas en paralelo para mejor performance
            const [
                totalMercaderias,
                totalDepositos,
                totalClientes,
                totalVendedores,
                stockBajo,
                transferenciasPendientes,
                movimientosHoy,
                valorStock,
                ultimosMovimientos,
                distribucionStock
            ] = await Promise.all([
                // Total mercaderías activas
                db.query('SELECT COUNT(*) as count FROM mercaderias WHERE activo = 1'),
                
                // Total depósitos activos
                db.query('SELECT COUNT(*) as count FROM depositos WHERE activo = 1'),
                
                // Total clientes activos
                db.query('SELECT COUNT(*) as count FROM clientes WHERE activo = 1'),
                
                // Total vendedores activos
                db.query('SELECT COUNT(*) as count FROM vendedores WHERE activo = 1'),

                // Stock bajo (cantidad actual menor o igual al mínimo)
                db.query(`
                    SELECT COUNT(DISTINCT m.id) as count
                    FROM mercaderias m
                    LEFT JOIN stock_depositos sd ON m.id = sd.mercaderia_id
                    WHERE m.activo = 1 
                    AND m.stock_minimo > 0
                    GROUP BY m.id, m.stock_minimo
                    HAVING COALESCE(SUM(sd.cantidad), 0) <= m.stock_minimo
                `),

                // Transferencias pendientes
                db.query(`
                    SELECT COUNT(*) as count 
                    FROM ordenes_transferencia  
                    WHERE estado IN ('PENDIENTE', 'PARCIAL')
                `),

                // Movimientos de hoy
                db.query(`
                    SELECT COUNT(*) as count 
                    FROM movimientos_stock 
                    WHERE DATE(fecha_movimiento) = CURDATE()
                `),

                // Valor total del stock
                db.query(`
                    SELECT COALESCE(SUM(sd.cantidad * m.precio_venta), 0) as valor_total
                    FROM stock_depositos sd
                    INNER JOIN mercaderias m ON sd.mercaderia_id = m.id
                    WHERE m.activo = 1
                `),

                // Últimos 10 movimientos
                db.query(`
                    SELECT 
                        ms.id,
                        ms.tipo_movimiento,
                        ms.cantidad,
                        ms.fecha_movimiento,
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
                    ORDER BY ms.fecha_movimiento DESC
                    LIMIT 10
                `),

                // Distribución de stock por tipo de depósito
                db.query(`
                    SELECT 
                        d.tipo,
                        COUNT(DISTINCT d.id) as cantidad_depositos,
                        COALESCE(SUM(sd.cantidad), 0) as total_items,
                        COALESCE(SUM(sd.cantidad * m.precio_venta), 0) as valor_total
                    FROM depositos d
                    LEFT JOIN stock_depositos sd ON d.id = sd.deposito_id
                    LEFT JOIN mercaderias m ON sd.mercaderia_id = m.id
                    WHERE d.activo = 1
                    GROUP BY d.tipo
                `)
            ]);

            const dashboard = {
                metricas: {
                    total_mercaderias: totalMercaderias[0].count,
                    total_depositos: totalDepositos[0].count,
                    total_clientes: totalClientes[0].count,
                    total_vendedores: totalVendedores[0].count,
                    stock_bajo: stockBajo.length || 0,
                    transferencias_pendientes: transferenciasPendientes[0].count,
                    movimientos_hoy: movimientosHoy[0].count,
                    valor_total_stock: parseFloat(valorStock[0].valor_total || 0)
                },
                ultimos_movimientos: ultimosMovimientos,
                distribucion_stock: distribucionStock
            };

            res.json({
                success: true,
                data: dashboard
            });

        } catch (error) {
            logger.error('Error en getDashboard:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener dashboard',
                error: error.message
            });
        }
    }

    // GET /api/v1/reportes/stock/valorizado - Reporte de stock valorizado
    async getStockValorizado(req, res) {
        try {
            const { deposito_id, categoria_id, solo_activos = true } = req.query;
            
            let whereClause = 'WHERE 1=1';
            let params = [];

            if (solo_activos === 'true') {
                whereClause += ' AND m.activo = 1';
            }

            if (deposito_id) {
                whereClause += ' AND d.id = ?';
                params.push(deposito_id);
            }

            if (categoria_id) {
                whereClause += ' AND m.categoria_id = ?';
                params.push(categoria_id);
            }

            const sql = `
                SELECT 
                    m.id,
                    m.descripcion,
                    m.codigo_sku,
                    m.codigo_code128,
                    m.precio_costo,
                    m.precio_venta,
                    c.nombre as categoria,
                    d.nombre as deposito,
                    d.tipo as tipo_deposito,
                    sd.cantidad,
                    (sd.cantidad * m.precio_costo) as valor_costo,
                    (sd.cantidad * m.precio_venta) as valor_venta,
                    ((m.precio_venta - m.precio_costo) * sd.cantidad) as margen_total
                FROM stock_depositos sd
                INNER JOIN mercaderias m ON sd.mercaderia_id = m.id
                INNER JOIN depositos d ON sd.deposito_id = d.id
                LEFT JOIN categorias c ON m.categoria_id = c.id
                ${whereClause}
                AND sd.cantidad > 0
                ORDER BY valor_venta DESC
            `;

            const stock = await db.query(sql, params);

            // Calcular totales
            const totales = {
                total_items: stock.length,
                total_cantidad: stock.reduce((sum, item) => sum + item.cantidad, 0),
                total_valor_costo: stock.reduce((sum, item) => sum + item.valor_costo, 0),
                total_valor_venta: stock.reduce((sum, item) => sum + item.valor_venta, 0),
                total_margen: stock.reduce((sum, item) => sum + item.margen_total, 0)
            };

            totales.margen_porcentaje = totales.total_valor_costo > 0 
                ? ((totales.total_margen / totales.total_valor_costo) * 100) 
                : 0;

            res.json({
                success: true,
                data: stock,
                totales: totales
            });

        } catch (error) {
            logger.error('Error en getStockValorizado:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener reporte valorizado',
                error: error.message
            });
        }
    }

    // GET /api/v1/reportes/movimientos/resumen - Resumen de movimientos
    async getResumenMovimientos(req, res) {
        try {
            const { fecha_desde, fecha_hasta, tipo_movimiento, deposito_id } = req.query;
            
            // Fechas por defecto: último mes
            const fechaHasta = fecha_hasta || new Date().toISOString().split('T')[0];
            const fechaDesde = fecha_desde || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

            let whereClause = 'WHERE DATE(ms.fecha_movimiento) BETWEEN ? AND ?';
            let params = [fechaDesde, fechaHasta];

            if (tipo_movimiento) {
                whereClause += ' AND ms.tipo_movimiento = ?';
                params.push(tipo_movimiento);
            }

            if (deposito_id) {
                whereClause += ' AND (ms.deposito_origen_id = ? OR ms.deposito_destino_id = ?)';
                params.push(deposito_id, deposito_id);
            }

            const [
                resumenPorTipo,
                resumenPorDia,
                movimientosPorDeposito
            ] = await Promise.all([
                // Resumen por tipo de movimiento
                db.query(`
                    SELECT 
                        ms.tipo_movimiento,
                        COUNT(*) as cantidad_movimientos,
                        SUM(ms.cantidad) as total_cantidad,
                        SUM(ms.cantidad * ms.precio_unitario) as valor_total
                    FROM movimientos_stock ms
                    ${whereClause}
                    GROUP BY ms.tipo_movimiento
                    ORDER BY cantidad_movimientos DESC
                `, params),

                // Resumen por día (últimos 30 días)
                db.query(`
                    SELECT 
                        DATE(ms.fecha_movimiento) as fecha,
                        COUNT(*) as cantidad_movimientos,
                        SUM(ms.cantidad) as total_cantidad
                    FROM movimientos_stock ms
                    ${whereClause}
                    GROUP BY DATE(ms.fecha_movimiento)
                    ORDER BY fecha DESC
                    LIMIT 30
                `, params),

                // Movimientos por depósito
                db.query(`
                    SELECT 
                        d.nombre as deposito,
                        d.tipo as tipo_deposito,
                        COUNT(CASE WHEN ms.deposito_destino_id = d.id THEN 1 END) as entradas,
                        COUNT(CASE WHEN ms.deposito_origen_id = d.id THEN 1 END) as salidas,
                        SUM(CASE WHEN ms.deposito_destino_id = d.id THEN ms.cantidad ELSE 0 END) as cantidad_entradas,
                        SUM(CASE WHEN ms.deposito_origen_id = d.id THEN ms.cantidad ELSE 0 END) as cantidad_salidas
                    FROM depositos d
                    LEFT JOIN movimientos_stock ms ON (d.id = ms.deposito_origen_id OR d.id = ms.deposito_destino_id)
                        AND DATE(ms.fecha_movimiento) BETWEEN ? AND ?
                    WHERE d.activo = 1
                    GROUP BY d.id, d.nombre, d.tipo
                    HAVING (entradas > 0 OR salidas > 0)
                    ORDER BY (entradas + salidas) DESC
                `, [fechaDesde, fechaHasta])
            ]);

            res.json({
                success: true,
                data: {
                    periodo: { fecha_desde: fechaDesde, fecha_hasta: fechaHasta },
                    resumen_por_tipo: resumenPorTipo,
                    movimientos_por_dia: resumenPorDia,
                    movimientos_por_deposito: movimientosPorDeposito
                }
            });

        } catch (error) {
            logger.error('Error en getResumenMovimientos:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener resumen de movimientos',
                error: error.message
            });
        }
    }

    // GET /api/v1/reportes/vendedores/performance - Performance de vendedores
    async getPerformanceVendedores(req, res) {
        try {
            const { mes, año, vendedor_id } = req.query;
            
            // Fechas por defecto: mes actual
            const mesActual = mes || new Date().getMonth() + 1;
            const añoActual = año || new Date().getFullYear();

            let whereClause = 'WHERE MONTH(p.fecha_completado) = ? AND YEAR(p.fecha_completado) = ? AND p.estado = "COMPLETADO"';
            let params = [mesActual, añoActual];

            if (vendedor_id) {
                whereClause += ' AND v.vendedorId = ?';
                params.push(vendedor_id);
            }

            const performance = await db.query(`
                SELECT 
                    v.vendedorId,
                    v.razonSocial as vendedor_nombre,
                    v.email,
                    v.comision as porcentaje_comision,
                    COUNT(DISTINCT p.id) as total_pedidos,
                    COUNT(DISTINCT p.clienteId) as clientes_atendidos,
                    SUM(dp.cantidad) as items_vendidos,
                    SUM(dp.cantidad * dp.precio_unitario) as ventas_totales,
                    AVG(dp.cantidad * dp.precio_unitario) as venta_promedio,
                    SUM(dp.cantidad * dp.precio_unitario * v.comision / 100) as comisiones_totales,
                    MAX(p.fecha_completado) as ultima_venta,
                    (SELECT COUNT(*) FROM clientes c WHERE c.vendedorId = v.vendedorId AND c.activo = 1) as total_clientes_asignados
                FROM vendedores v
                LEFT JOIN pedidos p ON v.vendedorId = p.vendedorId ${whereClause.replace('WHERE', 'AND')}
                LEFT JOIN detalles_pedido dp ON p.id = dp.pedido_id
                WHERE v.activo = 1
                GROUP BY v.vendedorId
                ORDER BY ventas_totales DESC
            `, params);

            // Calcular estadísticas adicionales
            const totales = {
                total_vendedores: performance.length,
                total_ventas: performance.reduce((sum, v) => sum + (v.ventas_totales || 0), 0),
                total_comisiones: performance.reduce((sum, v) => sum + (v.comisiones_totales || 0), 0),
                total_pedidos: performance.reduce((sum, v) => sum + (v.total_pedidos || 0), 0)
            };

            // Top 5 vendedores
            const topVendedores = performance
                .filter(v => v.ventas_totales > 0)
                .slice(0, 5)
                .map(v => ({
                    vendedor: v.vendedor_nombre,
                    ventas: v.ventas_totales,
                    comisiones: v.comisiones_totales,
                    pedidos: v.total_pedidos
                }));

            res.json({
                success: true,
                data: {
                    periodo: { mes: mesActual, año: añoActual },
                    performance_vendedores: performance,
                    totales: totales,
                    top_vendedores: topVendedores
                }
            });

        } catch (error) {
            logger.error('Error en getPerformanceVendedores:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener performance de vendedores',
                error: error.message
            });
        }
    }

    // GET /api/v1/reportes/clientes/stock - Stock en clientes
    async getStockClientes(req, res) {
        try {
            const { vendedor_id, zona_id, solo_con_stock = false } = req.query;

            let whereClause = 'WHERE c.activo = 1';
            let params = [];

            if (vendedor_id) {
                whereClause += ' AND c.vendedorId = ?';
                params.push(vendedor_id);
            }

            if (zona_id) {
                whereClause += ' AND c.zonaId = ?';
                params.push(zona_id);
            }

            if (solo_con_stock === 'true') {
                whereClause += ' AND total_stock > 0';
            }

            const stockClientes = await db.query(`
                SELECT 
                    c.clienteId,
                    c.razonSocial,
                    c.cuit,
                    c.email,
                    c.telefono,
                    v.razonSocial as vendedor_nombre,
                    z.zona as zona_nombre,
                    d.nombre as deposito_nombre,
                    COALESCE(stock_summary.total_items, 0) as total_items,
                    COALESCE(stock_summary.total_stock, 0) as total_stock,
                    COALESCE(stock_summary.valor_total, 0) as valor_total,
                    COALESCE(stock_summary.items_bajo_minimo, 0) as items_bajo_minimo
                FROM clientes c
                LEFT JOIN vendedores v ON c.vendedorId = v.vendedorId
                LEFT JOIN zonas z ON c.zonaId = z.zonaId
                LEFT JOIN depositos d ON c.clienteId = d.entity_id AND d.tipo = 'CLIENTE' AND d.activo = 1
                LEFT JOIN (
                    SELECT 
                        d.entity_id,
                        COUNT(sd.mercaderia_id) as total_items,
                        SUM(sd.cantidad) as total_stock,
                        SUM(sd.cantidad * m.precio_venta) as valor_total,
                        SUM(CASE WHEN sd.cantidad <= m.stock_minimo AND m.stock_minimo > 0 THEN 1 ELSE 0 END) as items_bajo_minimo
                    FROM depositos d
                    INNER JOIN stock_depositos sd ON d.id = sd.deposito_id
                    INNER JOIN mercaderias m ON sd.mercaderia_id = m.id
                    WHERE d.tipo = 'CLIENTE' AND d.activo = 1 AND m.activo = 1
                    GROUP BY d.entity_id
                ) stock_summary ON c.clienteId = stock_summary.entity_id
                ${whereClause}
                ORDER BY total_stock DESC
            `, params);

            // Calcular estadísticas generales
            const estadisticas = {
                total_clientes: stockClientes.length,
                clientes_con_stock: stockClientes.filter(c => c.total_stock > 0).length,
                total_items_sistema: stockClientes.reduce((sum, c) => sum + c.total_items, 0),
                valor_total_clientes: stockClientes.reduce((sum, c) => sum + c.valor_total, 0),
                clientes_con_alertas: stockClientes.filter(c => c.items_bajo_minimo > 0).length
            };

            res.json({
                success: true,
                data: stockClientes,
                estadisticas: estadisticas
            });

        } catch (error) {
            logger.error('Error en getStockClientes:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener stock de clientes',
                error: error.message
            });
        }
    }

    // En ReportesController.js - función getDashboard mejorada
// =============================================
// ReportesController.js - getDashboard COMPLETO
// =============================================

async getDashboard(req, res) {
    try {
        // Obtener todas las métricas en paralelo para mejor performance
        const [
            totalMercaderias,
            totalDepositos,
            totalClientes,
            totalVendedores,
            stockBajo,
            transferenciasPendientes,
            movimientosHoy,
            valorStock,
            ultimosMovimientos,
            distribucionStock
        ] = await Promise.all([
            // Total mercaderías activas
            db.query('SELECT COUNT(*) as count FROM mercaderias WHERE activo = 1'),
            
            // Total depósitos activos
            db.query('SELECT COUNT(*) as count FROM depositos WHERE activo = 1'),
            
            // Total clientes activos
            db.query('SELECT COUNT(*) as count FROM clientes WHERE activo = 1'),
            
            // Total vendedores activos
            db.query('SELECT COUNT(*) as count FROM vendedores WHERE activo = 1'),

            // Stock bajo (cantidad actual menor o igual al mínimo)
            db.query(`
                SELECT COUNT(DISTINCT m.id) as count
                FROM mercaderias m
                LEFT JOIN stock_depositos sd ON m.id = sd.mercaderia_id
                WHERE m.activo = 1 
                AND m.stock_minimo > 0
                GROUP BY m.id, m.stock_minimo
                HAVING COALESCE(SUM(sd.cantidad), 0) <= m.stock_minimo
            `),

            // Transferencias pendientes
            db.query(`
                SELECT COUNT(*) as count 
                FROM ordenes_transferencia  
                WHERE estado IN ('PENDIENTE', 'PARCIAL')
            `),

            // Movimientos de hoy
            db.query(`
                SELECT COUNT(*) as count 
                FROM movimientos_stock 
                WHERE DATE(fecha_movimiento) = CURDATE()
            `),

            // Valor total del stock
            db.query(`
                SELECT COALESCE(SUM(sd.cantidad * m.precio_venta), 0) as valor_total
                FROM stock_depositos sd
                INNER JOIN mercaderias m ON sd.mercaderia_id = m.id
                WHERE m.activo = 1
            `),

            // Últimos 10 movimientos
            db.query(`
                SELECT 
                    ms.id,
                    ms.tipo_movimiento,
                    ms.cantidad,
                    ms.fecha_movimiento,
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
                ORDER BY ms.fecha_movimiento DESC
                LIMIT 10
            `),

            // Distribución de stock por tipo de depósito
            db.query(`
                SELECT 
                    d.tipo,
                    COUNT(DISTINCT d.id) as cantidad_depositos,
                    COALESCE(SUM(sd.cantidad), 0) as total_items,
                    COALESCE(SUM(sd.cantidad * m.precio_venta), 0) as valor_total
                FROM depositos d
                LEFT JOIN stock_depositos sd ON d.id = sd.deposito_id
                LEFT JOIN mercaderias m ON sd.mercaderia_id = m.id
                WHERE d.activo = 1
                GROUP BY d.tipo
            `)
        ]);

        const dashboard = {
            metricas: {
                total_mercaderias: totalMercaderias[0].count,
                total_depositos: totalDepositos[0].count,
                total_clientes: totalClientes[0].count,
                total_vendedores: totalVendedores[0].count,
                stock_bajo: stockBajo.length || 0,
                transferencias_pendientes: transferenciasPendientes[0].count,
                movimientos_hoy: movimientosHoy[0].count,
                valor_total_stock: parseFloat(valorStock[0].valor_total || 0)
            },
            ultimos_movimientos: ultimosMovimientos,
            distribucion_stock: distribucionStock
        };

        res.json({
            success: true,
            data: dashboard
        });

    } catch (error) {
        logger.error('Error en getDashboard:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener dashboard',
            error: error.message
        });
    }
}

    // GET /api/v1/reportes/alertas/stock - Alertas de stock crítico
    async getAlertasStock(req, res) {
        try {
            const alertas = await db.query(`
                SELECT 
                    m.id,
                    m.descripcion,
                    m.codigo_sku,
                    m.codigo_code128,
                    m.stock_minimo,
                    c.nombre as categoria,
                    COALESCE(SUM(sd.cantidad), 0) as stock_actual,
                    CASE 
                        WHEN COALESCE(SUM(sd.cantidad), 0) = 0 THEN 'SIN_STOCK'
                        WHEN COALESCE(SUM(sd.cantidad), 0) <= m.stock_minimo THEN 'STOCK_BAJO'
                        ELSE 'NORMAL'
                    END as estado,
                    (m.stock_minimo - COALESCE(SUM(sd.cantidad), 0)) as cantidad_faltante,
                    GROUP_CONCAT(DISTINCT d.nombre ORDER BY d.nombre) as depositos_afectados
                FROM mercaderias m
                LEFT JOIN stock_depositos sd ON m.id = sd.mercaderia_id
                LEFT JOIN depositos d ON sd.deposito_id = d.id AND d.activo = 1
                LEFT JOIN categorias c ON m.categoria_id = c.id
                WHERE m.activo = 1 AND m.stock_minimo > 0
                GROUP BY m.id
                HAVING stock_actual <= m.stock_minimo
                ORDER BY 
                    CASE 
                        WHEN stock_actual = 0 THEN 1
                        ELSE 2
                    END,
                    (stock_actual / m.stock_minimo) ASC
            `);

            // Clasificar alertas
            const sinStock = alertas.filter(a => a.stock_actual === 0);
            const stockBajo = alertas.filter(a => a.stock_actual > 0 && a.stock_actual <= a.stock_minimo);

            res.json({
                success: true,
                data: {
                    alertas_criticas: sinStock,
                    alertas_stock_bajo: stockBajo,
                    resumen: {
                        total_alertas: alertas.length,
                        sin_stock: sinStock.length,
                        stock_bajo: stockBajo.length
                    }
                }
            });

        } catch (error) {
            logger.error('Error en getAlertasStock:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener alertas de stock',
                error: error.message
            });
        }
    }
}

module.exports = new ReportesController();