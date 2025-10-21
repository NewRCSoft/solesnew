// =============================================
// routes/stock.js - Rutas Completas de Stock
// =============================================
const express = require('express');
const router = express.Router();
const StockController = require('../controllers/StockController');

// =============================================
// RUTAS DE CONSULTA
// =============================================

// GET /api/v1/stock - Stock general con filtros
router.get('/', StockController.getStockGeneral);

// GET /api/v1/stock/deposito/:depositoId - Stock de un depósito específico
router.get('/deposito/:depositoId', StockController.getStockByDeposito);

// GET /api/v1/stock/mercaderia/:mercaderiaId - Stock de una mercadería en todos los depósitos
router.get('/mercaderia/:mercaderiaId', StockController.getStockByMercaderia);

// GET /api/v1/stock/alertas - Alertas de stock bajo
router.get('/alertas', StockController.getAlertas);

// GET /api/v1/stock/movimientos - Historial de movimientos de stock
router.get('/movimientos', StockController.getMovimientos);

// GET /api/v1/stock/estadisticas - Estadísticas generales
router.get('/estadisticas', StockController.getEstadisticas);

// GET /api/v1/stock/movimientos - Historial de movimientos de stock
router.get('/movimientos', StockController.getMovimientos);

// =============================================
// RUTAS DE OPERACIONES
// =============================================

// POST /api/v1/stock/compra - Registrar compra de mercadería
router.post('/compra', StockController.registrarCompra);

// POST /api/v1/stock/transferir - Transferir stock entre depósitos
router.post('/transferir', StockController.transferir);

// POST /api/v1/stock/ajustar - Ajustar stock (incremento/decremento/corrección)
router.post('/ajustar', StockController.ajustarStock);

// =============================================
// RUTAS ADICIONALES ÚTILES
// =============================================

// GET /api/v1/stock/resumen - Resumen ejecutivo de stock
router.get('/resumen', async (req, res) => {
    try {
        // Obtener datos de múltiples fuentes
        const stockPromise = StockController.getStockGeneral(
            { query: { incluir_sin_stock: 'true', limit: 1000 } }, 
            { json: (data) => data }
        );
        
        const alertasPromise = StockController.getAlertas(
            { query: {} }, 
            { json: (data) => data }
        );

        const [stockData, alertasData] = await Promise.all([stockPromise, alertasPromise]);

        // Calcular métricas de resumen
        const resumen = {
            stock: stockData.resumen || {},
            alertas: alertasData.resumen || {},
            productos_criticos: alertasData.data?.filter(a => a.nivel_urgencia === 'CRITICO').length || 0,
            ultima_actualizacion: new Date().toISOString()
        };

        res.json({
            success: true,
            data: resumen
        });

    } catch (error) {
        console.error('Error en resumen:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener resumen de stock'
        });
    }
});

// GET /api/v1/stock/valoracion - Valoración total del inventario
router.get('/valoracion', async (req, res) => {
    try {
        const db = require('../config/database');
        
        const sql = `
            SELECT 
                d.tipo as tipo_deposito,
                d.nombre as deposito_nombre,
                COUNT(DISTINCT sd.mercaderia_id) as productos_diferentes,
                SUM(sd.cantidad) as unidades_totales,
                SUM(sd.cantidad * m.precio_costo) as valor_costo,
                SUM(sd.cantidad * m.precio_venta) as valor_venta,
                (SUM(sd.cantidad * m.precio_venta) - SUM(sd.cantidad * m.precio_costo)) as ganancia_potencial

            FROM depositos d
            INNER JOIN stock_depositos sd ON d.id = sd.deposito_id
            INNER JOIN mercaderias m ON sd.mercaderia_id = m.id
            WHERE d.activo = 1 AND m.activo = 1 AND sd.cantidad > 0
            GROUP BY d.id, d.tipo, d.nombre
            ORDER BY valor_costo DESC
        `;

        const valoracion = await db.query(sql);

        // Calcular totales generales
        const totales = {
            valor_costo_total: valoracion.reduce((sum, v) => sum + v.valor_costo, 0),
            valor_venta_total: valoracion.reduce((sum, v) => sum + v.valor_venta, 0),
            ganancia_potencial_total: valoracion.reduce((sum, v) => sum + v.ganancia_potencial, 0),
            unidades_totales: valoracion.reduce((sum, v) => sum + v.unidades_totales, 0)
        };

        res.json({
            success: true,
            data: valoracion,
            totales: totales
        });

    } catch (error) {
        console.error('Error en valoración:', error);
        res.status(500).json({
            success: false,
            message: 'Error al calcular valoración',
            error: error.message
        });
    }
});

// GET /api/v1/stock/rotacion - Análisis de rotación de stock
router.get('/rotacion', async (req, res) => {
    try {
        const { dias = 30 } = req.query;
        const db = require('../config/database');
        
        const sql = `
            SELECT 
                m.id,
                m.descripcion,
                m.codigo_sku,
                COALESCE(SUM(sd.cantidad), 0) as stock_actual,
                
                -- Movimientos de salida en el período
                COALESCE(salidas.total_salidas, 0) as total_salidas,
                COALESCE(salidas.cantidad_vendida, 0) as cantidad_vendida,
                
                -- Calcular rotación
                CASE 
                    WHEN COALESCE(SUM(sd.cantidad), 0) > 0 AND COALESCE(salidas.cantidad_vendida, 0) > 0 
                    THEN ROUND(COALESCE(salidas.cantidad_vendida, 0) / COALESCE(SUM(sd.cantidad), 1), 2)
                    ELSE 0
                END as indice_rotacion,
                
                CASE 
                    WHEN COALESCE(salidas.cantidad_vendida, 0) = 0 THEN 'SIN_MOVIMIENTO'
                    WHEN (COALESCE(salidas.cantidad_vendida, 0) / COALESCE(SUM(sd.cantidad), 1)) > 2 THEN 'ALTA'
                    WHEN (COALESCE(salidas.cantidad_vendida, 0) / COALESCE(SUM(sd.cantidad), 1)) > 0.5 THEN 'MEDIA'
                    ELSE 'BAJA'
                END as clasificacion_rotacion

            FROM mercaderias m
            LEFT JOIN stock_depositos sd ON m.id = sd.mercaderia_id
            LEFT JOIN depositos d ON sd.deposito_id = d.id AND d.activo = 1
            
            -- Subquery para calcular salidas
            LEFT JOIN (
                SELECT 
                    ms.mercaderia_id,
                    COUNT(*) as total_salidas,
                    SUM(ms.cantidad) as cantidad_vendida
                FROM movimientos_stock ms
                WHERE ms.tipo_movimiento IN ('VENTA', 'TRANSFERENCIA')
                AND ms.fecha_movimiento >= DATE_SUB(NOW(), INTERVAL ? DAY)
                GROUP BY ms.mercaderia_id
            ) salidas ON m.id = salidas.mercaderia_id

            WHERE m.activo = 1
            GROUP BY m.id
            ORDER BY indice_rotacion DESC, cantidad_vendida DESC
        `;

        const rotacion = await db.query(sql, [dias]);

        res.json({
            success: true,
            data: rotacion,
            total: rotacion.length,
            periodo_analizado: `${dias} días`,
            resumen: {
                sin_movimiento: rotacion.filter(r => r.clasificacion_rotacion === 'SIN_MOVIMIENTO').length,
                rotacion_alta: rotacion.filter(r => r.clasificacion_rotacion === 'ALTA').length,
                rotacion_media: rotacion.filter(r => r.clasificacion_rotacion === 'MEDIA').length,
                rotacion_baja: rotacion.filter(r => r.clasificacion_rotacion === 'BAJA').length
            }
        });

    } catch (error) {
        console.error('Error en análisis de rotación:', error);
        res.status(500).json({
            success: false,
            message: 'Error al analizar rotación',
            error: error.message
        });
    }
});

// =============================================
// RUTAS DE SOPORTE PARA EL FRONTEND
// =============================================

// GET /api/v1/stock/mercaderias-disponibles - Lista de mercaderías para selects
router.get('/mercaderias-disponibles', async (req, res) => {
    try {
        const db = require('../config/database');
        
        const mercaderias = await db.query(`
            SELECT 
                m.id,
                m.descripcion,
                m.codigo_sku,
                m.precio_venta,
                m.precio_costo,
                c.categoria as categoria,
                COALESCE(SUM(sd.cantidad), 0) as stock_total
            FROM mercaderias m
            LEFT JOIN categorias c ON m.id_categoria = c.id
            LEFT JOIN stock_depositos sd ON m.id = sd.mercaderia_id
            LEFT JOIN depositos d ON sd.deposito_id = d.id AND d.activo = 1
            WHERE m.activo = 1
            GROUP BY m.id
            ORDER BY m.descripcion ASC
        `);

        res.json({
            success: true,
            data: mercaderias
        });

    } catch (error) {
        console.error('Error obteniendo mercaderías disponibles:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener mercaderías',
            error: error.message
        });
    }
});

// GET /api/v1/stock/depositos-disponibles - Lista de depósitos para selects
router.get('/depositos-disponibles', async (req, res) => {
    try {
        const db = require('../config/database');
        
        const depositos = await db.query(`
            SELECT 
                d.id,
                d.nombre,
                d.tipo,
                d.entity_id,
                CASE 
                    WHEN d.tipo = 'VENDEDOR' THEN v.razonSocial
                    WHEN d.tipo = 'CLIENTE' THEN c.razonSocial
                    ELSE 'N/A'
                END as entidad_nombre,
                COUNT(DISTINCT sd.mercaderia_id) as productos_con_stock
                
            FROM depositos d
            LEFT JOIN vendedores v ON d.entity_id = v.vendedorId AND d.tipo = 'VENDEDOR'
            LEFT JOIN clientes c ON d.entity_id = c.clienteId AND d.tipo = 'CLIENTE'
            LEFT JOIN stock_depositos sd ON d.id = sd.deposito_id AND sd.cantidad > 0
            WHERE d.activo = 1
            GROUP BY d.id
            ORDER BY 
                CASE d.tipo 
                    WHEN 'CENTRAL' THEN 1
                    WHEN 'VENDEDOR' THEN 2
                    ELSE 3
                END,
                d.nombre ASC
        `);

        res.json({
            success: true,
            data: depositos
        });

    } catch (error) {
        console.error('Error obteniendo depósitos disponibles:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener depósitos',
            error: error.message
        });
    }
});

// GET /api/v1/stock/verificar-disponibilidad - Verificar stock disponible para transferencias
router.get('/verificar-disponibilidad', async (req, res) => {
    try {
        const { mercaderia_id, deposito_id } = req.query;

        if (!mercaderia_id || !deposito_id) {
            return res.status(400).json({
                success: false,
                message: 'mercaderia_id y deposito_id son requeridos'
            });
        }

        const db = require('../config/database');
        
        const [stock] = await db.query(`
            SELECT 
                COALESCE(sd.cantidad, 0) as cantidad_disponible,
                m.descripcion as mercaderia,
                d.nombre as deposito
            FROM mercaderias m
            CROSS JOIN depositos d
            LEFT JOIN stock_depositos sd ON m.id = sd.mercaderia_id AND d.id = sd.deposito_id
            WHERE m.id = ? AND d.id = ? AND m.activo = 1 AND d.activo = 1
        `, [mercaderia_id, deposito_id]);

        if (!stock) {
            return res.status(404).json({
                success: false,
                message: 'Mercadería o depósito no encontrado'
            });
        }

        res.json({
            success: true,
            data: stock
        });

    } catch (error) {
        console.error('Error verificando disponibilidad:', error);
        res.status(500).json({
            success: false,
            message: 'Error al verificar disponibilidad',
            error: error.message
        });
    }
});

// GET /api/v1/stock/movimientos/:id - Obtener movimiento específico desde contexto de stock
router.get('/movimientos/:id', async (req, res) => {
    try {
        const MovimientosController = require('../controllers/MovimientosController');
        
        // Agregar contexto de stock al request
        req.query.include_stock_impact = 'true';
        req.query.context = 'stock';
        
        // Redirigir al método show del MovimientosController
        await MovimientosController.show(req, res);
    } catch (error) {
        const logger = require('../config/logger');
        logger.error('Error obteniendo movimiento desde stock:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener movimiento',
            error: error.message
        });
    }
});
module.exports = router;