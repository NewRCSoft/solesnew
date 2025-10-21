// =============================================
// routes/transferencias.js - Rutas de Transferencias CORREGIDAS
// =============================================
const express = require('express');
const router = express.Router();
const TransferenciasController = require('../controllers/TransferenciasController');

// =============================================
// RUTAS BÁSICAS CRUD
// =============================================

// GET /transferencias - Listar todas las transferencias
router.get('/', TransferenciasController.index);

// GET /transferencias/:id - Obtener transferencia específica con detalles
router.get('/:id', TransferenciasController.show);

// POST /transferencias - Crear nueva orden de transferencia
router.post('/', TransferenciasController.create);

// PUT /transferencias/:id - Actualizar orden de transferencia
router.put('/:id', TransferenciasController.update);

// =============================================
// OPERACIONES ESPECIALES DE TRANSFERENCIAS
// =============================================

// POST /transferencias/enviar - Envío parcial/total (CORREGIDO)
router.post('/enviar', TransferenciasController.enviar);

// PUT /transferencias/:id/cancelar - Cancelar orden (CORREGIDO)
router.put('/:id/cancelar', TransferenciasController.cancelar);

// GET /transferencias/:id/detalles - Obtener solo detalles de la orden
router.get('/:id/detalles', async (req, res) => {
    try {
        const { id } = req.params;
        const detalles = await TransferenciasController.getDetallesOrdenData(id);
        
        res.json({
            success: true,
            data: detalles,
            message: 'Detalles obtenidos correctamente'
        });
    } catch (error) {
        console.error('Error obteniendo detalles:', error);
        res.status(500).json({
            success: false,
            message: 'Error obteniendo detalles de la orden',
            error: error.message
        });
    }
});

// =============================================
// RUTAS ESPECÍFICAS POR ENTIDAD
// =============================================

// GET /transferencias/vendedor/:vendedorId/pendientes - Órdenes pendientes del vendedor
router.get('/vendedor/:vendedorId/pendientes', TransferenciasController.getOrdenesPendientesVendedor);

// GET /transferencias/cliente/:clienteId/pendientes - Órdenes pendientes del cliente
router.get('/cliente/:clienteId/pendientes', TransferenciasController.getOrdenesPendientesCliente);

// =============================================
// RUTAS ADICIONALES DE OPERACIONES
// =============================================

// POST /transferencias/:id/completar - Marcar como completada manualmente
router.post('/:id/completar', async (req, res) => {
    try {
        const { id } = req.params;
        const { motivo } = req.body;
        
        // Verificar que todos los items estén enviados completamente
        const detalles = await TransferenciasController.getDetallesOrdenData(id);
        const pendientes = detalles.filter(d => d.cantidad_enviada < d.cantidad_solicitada);
        
        if (pendientes.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'No se puede completar la orden. Hay items pendientes de envío.',
                items_pendientes: pendientes.length
            });
        }
        
        // Actualizar estado a COMPLETADA
        await db.query(
            'UPDATE ordenes_transferencia SET estado = ?, observaciones = CONCAT(COALESCE(observaciones, ""), ?, ?) WHERE id = ?',
            ['COMPLETADA', '\n--- COMPLETADA MANUALMENTE ---\n', motivo || 'Completada por usuario', id]
        );
        
        res.json({
            success: true,
            message: 'Orden marcada como completada exitosamente'
        });
        
    } catch (error) {
        console.error('Error completando orden:', error);
        res.status(500).json({
            success: false,
            message: 'Error al completar orden',
            error: error.message
        });
    }
});

// GET /transferencias/reportes/resumen - Resumen de transferencias
router.get('/reportes/resumen', async (req, res) => {
    try {
        const { fecha_desde, fecha_hasta } = req.query;
        
        let whereClause = '1=1';
        let params = [];
        
        if (fecha_desde) {
            whereClause += ' AND DATE(fecha_orden) >= ?';
            params.push(fecha_desde);
        }
        
        if (fecha_hasta) {
            whereClause += ' AND DATE(fecha_orden) <= ?';
            params.push(fecha_hasta);
        }
        
        const resumen = await db.query(`
            SELECT 
                estado,
                COUNT(*) as cantidad,
                SUM(CASE WHEN total > 0 THEN total ELSE 0 END) as valor_total
            FROM ordenes_transferencia 
            WHERE ${whereClause}
            GROUP BY estado
            ORDER BY 
                CASE estado 
                    WHEN 'PENDIENTE' THEN 1
                    WHEN 'PARCIAL' THEN 2  
                    WHEN 'COMPLETADA' THEN 3
                    WHEN 'CANCELADA' THEN 4
                    ELSE 5
                END
        `, params);
        
        res.json({
            success: true,
            data: resumen,
            periodo: { fecha_desde, fecha_hasta }
        });
        
    } catch (error) {
        console.error('Error en reporte de resumen:', error);
        res.status(500).json({
            success: false,
            message: 'Error generando reporte de resumen',
            error: error.message
        });
    }
});

// =============================================
// MIDDLEWARE DE VALIDACIÓN
// =============================================

// Middleware para validar que la orden existe (aplicar a rutas que lo necesiten)
const validarOrdenExiste = async (req, res, next) => {
    try {
        const { id } = req.params;
        
        if (!id || isNaN(id)) {
            return res.status(400).json({
                success: false,
                message: 'ID de orden inválido'
            });
        }
        
        const [orden] = await db.query('SELECT id FROM ordenes_transferencia WHERE id = ?', [id]);
        
        if (!orden.length) {
            return res.status(404).json({
                success: false,
                message: 'Orden de transferencia no encontrada'
            });
        }
        
        req.orden = orden[0];
        next();
        
    } catch (error) {
        console.error('Error validando orden:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
};

// Aplicar middleware a rutas que lo necesiten
router.put('/:id/cancelar', validarOrdenExiste, TransferenciasController.cancelar);
router.post('/:id/completar', validarOrdenExiste);

// =============================================
// MANEJO DE ERRORES
// =============================================

// Middleware de manejo de errores para todas las rutas de transferencias
router.use((error, req, res, next) => {
    console.error('Error en ruta de transferencias:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({
            success: false,
            message: 'Ya existe un registro con esos datos'
        });
    }
    
    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
        return res.status(400).json({
            success: false,
            message: 'Referencia inválida en los datos proporcionados'
        });
    }
    
    res.status(500).json({
        success: false,
        message: 'Error interno del servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
});

module.exports = router;