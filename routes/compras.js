// =============================================
// routes/compras.js - Rutas del Sistema de Compras ACTUALIZADO
// =============================================
const express = require('express');
const router = express.Router();
const ComprasController = require('../controllers/ComprasController');
const DevolucionesController = require('../controllers/DevolucionesController');
const { auth, validateRequest, authorize } = require('../middleware/auth');
const { body, param, query } = require('express-validator');

// ============= VALIDACIONES =============

// Validaciones para órdenes de compra
const ordenCompraValidation = [
    body('proveedor_id').isInt({ min: 1 }).withMessage('Proveedor ID inválido'),
    body('fecha_orden').isISO8601().withMessage('Fecha de orden inválida (formato: YYYY-MM-DD)'),
    body('items').isArray({ min: 1 }).withMessage('Debe incluir al menos un item'),
    body('items.*.mercaderia_id').isInt({ min: 1 }).withMessage('ID de mercadería inválido'),
    body('items.*.cantidad_solicitada').isFloat({ min: 0.01 }).withMessage('Cantidad debe ser mayor a 0'),
    body('items.*.precio_unitario').isFloat({ min: 0.01 }).withMessage('Precio unitario debe ser mayor a 0'),
    body('fecha_entrega_esperada').optional().isISO8601().withMessage('Fecha de entrega inválida'),
    body('moneda').optional().isIn(['ARS', 'USD', 'EUR']).withMessage('Moneda inválida'),
    body('tipo_cambio').optional().isFloat({ min: 0.01 }).withMessage('Tipo de cambio inválido'),
    body('impuestos').optional().isFloat({ min: 0 }).withMessage('Impuestos deben ser mayor o igual a 0'),
    body('observaciones').optional().isString().isLength({ max: 1000 }).withMessage('Observaciones muy largas'),
    body('numero_factura').optional({ nullable: true }).isString(),
    body('observaciones').optional({ nullable: true }).isString(),
    body('items[0].fecha_vencimiento').optional({ nullable: true }).isISO8601()
];

// Validaciones para recepciones
const recepcionValidation = [
    body('proveedor_id').isInt({ min: 1 }).withMessage('Proveedor ID inválido'),
    body('fecha_recepcion').isISO8601().withMessage('Fecha de recepción inválida'),
    
    // 🆕 NUEVO: Validación de fecha de vencimiento del documento
    body('fecha_vencimiento_documento')
        .optional({ nullable: true })
        .isISO8601()
        .withMessage('Fecha de vencimiento inválida')
        .custom((value, { req }) => {
            if (value && req.body.fecha_recepcion) {
                const fechaRecepcion = new Date(req.body.fecha_recepcion);
                const fechaVencimiento = new Date(value);
                if (fechaVencimiento < fechaRecepcion) {
                    throw new Error('La fecha de vencimiento debe ser igual o posterior a la fecha de recepción');
                }
            }
            return true;
        }),
    
    body('items').isArray({ min: 1 }).withMessage('Debe incluir al menos un item'),
    body('items.*.mercaderia_id').isInt({ min: 1 }).withMessage('ID de mercadería inválido'),
    body('items.*.cantidad_recibida').isFloat({ min: 0.01 }).withMessage('Cantidad recibida debe ser mayor a 0'),
    body('items.*.precio_unitario').isFloat({ min: 0 }).withMessage('Precio unitario debe ser mayor o igual a 0'),
    
    // 🆕 NUEVAS VALIDACIONES para campos de IVA
    body('items.*.porcentaje_iva')
        .optional()
        .isFloat({ min: 0, max: 100 })
        .withMessage('Porcentaje de IVA debe estar entre 0% y 100%')
        .custom((value, { req }) => {
            // Validación adicional: si se proporciona iva_unitario, debe coincidir con el cálculo
            const index = req.body.items.findIndex(item => item.porcentaje_iva === value);
            if (index >= 0) {
                const item = req.body.items[index];
                if (item.iva_unitario !== undefined && item.precio_unitario) {
                    const ivaCalculado = item.precio_unitario * (value / 100);
                    const diferencia = Math.abs(item.iva_unitario - ivaCalculado);
                    if (diferencia > 0.01) { // Tolerancia de 1 centavo
                        throw new Error(`IVA unitario no coincide con el cálculo para el item ${index + 1}`);
                    }
                }
            }
            return true;
        }),
    
    body('items.*.iva_unitario')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('IVA unitario debe ser mayor o igual a 0'),
    
    body('items.*.precio_con_iva')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Precio con IVA debe ser mayor o igual a 0'),
    
    body('items.*.numero_lote')
        .optional({ nullable: true })
        .isString()
        .isLength({ max: 100 })
        .withMessage('Número de lote muy largo'),
    
    body('items.*.fecha_vencimiento')
        .optional({ nullable: true })
        .isISO8601()
        .withMessage('Fecha de vencimiento de producto inválida'),
    
    body('orden_compra_id').optional().isInt({ min: 1 }).withMessage('ID de orden de compra inválido'),
    body('numero_remito').optional({ nullable: true }).isString().isLength({ max: 100 }).withMessage('Número de remito muy largo'),
    body('numero_factura').optional({ nullable: true }).isString().isLength({ max: 100 }).withMessage('Número de factura muy largo'),
    body('observaciones').optional({ nullable: true }).isString().isLength({ max: 1000 }).withMessage('Observaciones muy largas')
];

// Validaciones para devoluciones
const devolucionValidation = [
    body('proveedor_id').isInt({ min: 1 }).withMessage('Proveedor ID inválido'),
    body('fecha_devolucion').isISO8601().withMessage('Fecha de devolución inválida'),
    body('motivo').isString().isLength({ min: 10, max: 500 }).withMessage('Motivo debe tener entre 10 y 500 caracteres'),
    body('items').isArray({ min: 1 }).withMessage('Debe incluir al menos un item'),
    body('items.*.mercaderia_id').isInt({ min: 1 }).withMessage('ID de mercadería inválido'),
    body('items.*.cantidad').isFloat({ min: 0.01 }).withMessage('Cantidad debe ser mayor a 0'),
    body('items.*.precio_unitario').isFloat({ min: 0.01 }).withMessage('Precio unitario debe ser mayor a 0'),
    body('items.*.lote_id').optional().isInt({ min: 1 }).withMessage('ID de lote inválido'),
    body('items.*.motivo_detalle').optional().isString().isLength({ max: 500 }).withMessage('Motivo del detalle muy largo'),
    body('numero_nota_credito').optional().isString().isLength({ max: 100 }).withMessage('Número de nota de crédito muy largo'),
    body('observaciones').optional().isString().isLength({ max: 1000 }).withMessage('Observaciones muy largas')
];

// Validaciones para procesamiento de devoluciones
const procesarDevolucionValidation = [
    body('accion').isIn(['PROCESAR', 'RECHAZAR', 'RESOLVER']).withMessage('Acción inválida'),
    body('observaciones_procesamiento').optional().isString().isLength({ max: 500 }).withMessage('Observaciones de procesamiento muy largas')
];

// Validaciones para cancelación
const cancelarValidation = [
    body('motivo').optional().isString().isLength({ max: 500 }).withMessage('Motivo muy largo')
];

// ============= MIDDLEWARE PERSONALIZADO =============
// 🔧 MOVIDO AQUÍ ANTES DE SU USO

const validarConsistenciaIva = (req, res, next) => {
    if (req.body.items && Array.isArray(req.body.items)) {
        for (let i = 0; i < req.body.items.length; i++) {
            const item = req.body.items[i];
            
            // Si no se proporciona porcentaje de IVA, establecer 0 por defecto
            if (item.porcentaje_iva === undefined || item.porcentaje_iva === null) {
                item.porcentaje_iva = 0;
            }
            
            // Validar y recalcular valores de IVA si es necesario
            if (item.precio_unitario && item.porcentaje_iva >= 0) {
                const precioUnitario = parseFloat(item.precio_unitario);
                const porcentajeIva = parseFloat(item.porcentaje_iva);
                
                // Calcular IVA unitario si no se proporciona
                if (!item.iva_unitario) {
                    item.iva_unitario = precioUnitario * (porcentajeIva / 100);
                }
                
                // Calcular precio con IVA si no se proporciona
                if (!item.precio_con_iva) {
                    item.precio_con_iva = precioUnitario + item.iva_unitario;
                }
                
                // Validar coherencia en los cálculos
                const ivaCalculado = precioUnitario * (porcentajeIva / 100);
                const precioConIvaCalculado = precioUnitario + ivaCalculado;
                
                const tolerancia = 0.01; // 1 centavo de tolerancia
                
                if (Math.abs(item.iva_unitario - ivaCalculado) > tolerancia) {
                    return res.status(422).json({
                        success: false,
                        message: `Error en cálculo de IVA para item ${i + 1}`,
                        errors: [{
                            field: `items[${i}].iva_unitario`,
                            message: `Valor esperado: ${ivaCalculado.toFixed(2)}, valor recibido: ${item.iva_unitario}`
                        }]
                    });
                }
                
                if (Math.abs(item.precio_con_iva - precioConIvaCalculado) > tolerancia) {
                    return res.status(422).json({
                        success: false,
                        message: `Error en cálculo de precio con IVA para item ${i + 1}`,
                        errors: [{
                            field: `items[${i}].precio_con_iva`,
                            message: `Valor esperado: ${precioConIvaCalculado.toFixed(2)}, valor recibido: ${item.precio_con_iva}`
                        }]
                    });
                }
            }
        }
    }
    
    next();
};

// ============= RUTAS DE ÓRDENES DE COMPRA =============

// GET /api/compras/ordenes - Listar órdenes de compra
router.get('/ordenes', 
    auth, 
    query('page').optional().isInt({ min: 1 }).withMessage('Página inválida'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Límite inválido'),
    query('estado').optional().isIn(['PENDIENTE', 'PARCIAL', 'RECIBIDA', 'CANCELADA']).withMessage('Estado inválido'),
    query('proveedor_id').optional().isInt({ min: 1 }).withMessage('Proveedor ID inválido'),
    query('fecha_desde').optional().isISO8601().withMessage('Fecha desde inválida'),
    query('fecha_hasta').optional().isISO8601().withMessage('Fecha hasta inválida'),
    validateRequest,
    ComprasController.getOrdenes
);

// GET /api/compras/ordenes/:id - Obtener orden específica
router.get('/ordenes/:id', 
    auth, 
    param('id').isInt({ min: 1 }).withMessage('ID inválido'), 
    validateRequest, 
    ComprasController.getOrdenById
);

// POST /api/compras/ordenes - Crear nueva orden
router.post('/ordenes', 
    auth, 
    authorize(['ADMIN', 'OPERADOR']),
    ordenCompraValidation, 
    validateRequest, 
    ComprasController.crearOrden
);

// PUT /api/compras/ordenes/:id/cancelar - Cancelar orden
router.put('/ordenes/:id/cancelar', 
    auth, 
    authorize(['ADMIN', 'OPERADOR']),
    param('id').isInt({ min: 1 }).withMessage('ID inválido'),
    cancelarValidation,
    validateRequest, 
    ComprasController.cancelarOrden
);

// ============= RUTAS DE RECEPCIONES =============

// GET /api/compras/recepciones - Listar recepciones
router.get('/recepciones', 
    auth,
    query('page').optional().isInt({ min: 1 }).withMessage('Página inválida'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Límite inválido'),
    query('proveedor_id').optional().isInt({ min: 1 }).withMessage('Proveedor ID inválido'),
    query('fecha_desde').optional().isISO8601().withMessage('Fecha desde inválida'),
    query('fecha_hasta').optional().isISO8601().withMessage('Fecha hasta inválida'),
    validateRequest,
    ComprasController.getRecepciones
);

// GET /api/compras/recepciones/:id - Obtener recepción específica
router.get('/recepciones/:id', 
    auth, 
    param('id').isInt({ min: 1 }).withMessage('ID inválido'), 
    validateRequest, 
    ComprasController.getRecepcionById
);

// POST /api/compras/recepciones - Crear nueva recepción
router.post('/recepciones', 
    auth, 
    authorize(['ADMIN', 'OPERADOR']),
    recepcionValidation, // 🆕 Nuevas validaciones
    validarConsistenciaIva, // ✅ AHORA FUNCIONA - middleware definido arriba
    validateRequest, 
    ComprasController.crearRecepcion // Tu función existente, pero modificada
);

// ============= RUTAS DE LOTES Y VENCIMIENTOS =============

// GET /api/compras/lotes/proximos-vencer - Lotes próximos a vencer
router.get('/lotes/proximos-vencer', 
    auth,
    query('dias').optional().isInt({ min: 1, max: 365 }).withMessage('Días debe estar entre 1 y 365'),
    validateRequest,
    ComprasController.getLotesProximosVencer
);

// GET /api/compras/lotes/mercaderia/:mercaderiaId - Lotes por mercadería
router.get('/lotes/mercaderia/:mercaderiaId', 
    auth, 
    param('mercaderiaId').isInt({ min: 1 }).withMessage('ID de mercadería inválido'), 
    validateRequest, 
    ComprasController.getLotesPorMercaderia
);

// GET /api/compras/con-iva - Recepciones con información de IVA
router.get('/con-iva', 
    auth,
    query('page').optional().isInt({ min: 1 }).withMessage('Página inválida'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Límite inválido'),
    query('proveedor_id').optional().isInt({ min: 1 }).withMessage('Proveedor ID inválido'),
    query('fecha_desde').optional().isISO8601().withMessage('Fecha desde inválida'),
    query('fecha_hasta').optional().isISO8601().withMessage('Fecha hasta inválida'),
    query('estado_vencimiento').optional().isIn(['vencido', 'vence_pronto', 'vigente']).withMessage('Estado de vencimiento inválido'),
    query('porcentaje_iva').optional().isFloat({ min: 0, max: 100 }).withMessage('Porcentaje de IVA inválido'),
    validateRequest,
    ComprasController.getRecepcionesConIva
);

// GET /api/compras/alertas-vencimientos - Alertas de vencimientos de documentos
router.get('/alertas-vencimientos', 
    auth,
    query('dias').optional().isInt({ min: 1, max: 365 }).withMessage('Días debe estar entre 1 y 365'),
    validateRequest,
    ComprasController.getAlertasVencimientos
);

// GET /api/compras/reporte-iva - Reporte de IVA por período
router.get('/reporte-iva', 
    auth,
    query('fecha_desde').isISO8601().withMessage('Fecha desde inválida'),
    query('fecha_hasta').isISO8601().withMessage('Fecha hasta inválida'),
    query('proveedor_id').optional().isInt({ min: 1 }).withMessage('Proveedor ID inválido'),
    validateRequest,
    ComprasController.getReporteIva
);

// GET /api/compras/estadisticas-iva - Estadísticas generales de IVA
router.get('/estadisticas-iva', 
    auth,
    query('fecha_desde').optional().isISO8601().withMessage('Fecha desde inválida'),
    query('fecha_hasta').optional().isISO8601().withMessage('Fecha hasta inválida'),
    validateRequest,
    async (req, res) => {
        try {
            const { fecha_desde, fecha_hasta } = req.query;
            
            let whereClause = '';
            let params = [];
            
            if (fecha_desde && fecha_hasta) {
                whereClause = 'WHERE rm.fecha_recepcion BETWEEN ? AND ?';
                params = [fecha_desde, fecha_hasta];
            } else {
                // Por defecto, último mes
                whereClause = 'WHERE rm.fecha_recepcion >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH)';
            }
            
            const sql = `
                SELECT 
                    COUNT(DISTINCT rm.id) as total_recepciones,
                    COUNT(dr.id) as total_items,
                    AVG(dr.porcentaje_iva) as promedio_iva,
                    SUM(dr.cantidad_recibida * dr.precio_unitario) as subtotal_sin_iva,
                    SUM(dr.cantidad_recibida * dr.iva_unitario) as total_iva,
                    SUM(dr.cantidad_recibida * dr.precio_con_iva) as total_con_iva,
                    COUNT(CASE WHEN dr.porcentaje_iva = 0 THEN 1 END) as items_exentos,
                    COUNT(CASE WHEN dr.porcentaje_iva > 0 AND dr.porcentaje_iva <= 10.5 THEN 1 END) as items_iva_reducido,
                    COUNT(CASE WHEN dr.porcentaje_iva > 10.5 AND dr.porcentaje_iva <= 21 THEN 1 END) as items_iva_general,
                    COUNT(CASE WHEN dr.porcentaje_iva > 21 THEN 1 END) as items_iva_adicional
                FROM recepciones_mercaderia rm
                JOIN detalle_recepciones dr ON rm.id = dr.recepcion_id
                ${whereClause}
            `;
            
            const [estadisticas] = await db.query(sql, params);
            
            res.json({
                success: true,
                data: estadisticas,
                periodo: fecha_desde && fecha_hasta ? { desde: fecha_desde, hasta: fecha_hasta } : { descripcion: 'Último mes' },
                message: 'Estadísticas de IVA obtenidas correctamente'
            });
            
        } catch (error) {
            console.error('Error obteniendo estadísticas de IVA:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener estadísticas',
                error: error.message
            });
        }
    }
);

// PUT /api/compras/actualizar-vencimiento/:id - Actualizar fecha de vencimiento de un documento
router.put('/actualizar-vencimiento/:id',
    auth,
    authorize(['ADMIN', 'OPERADOR']),
    param('id').isInt({ min: 1 }).withMessage('ID inválido'),
    body('fecha_vencimiento_documento').isISO8601().withMessage('Fecha de vencimiento inválida'),
    validateRequest,
    async (req, res) => {
        try {
            const { id } = req.params;
            const { fecha_vencimiento_documento } = req.body;
            
            const [result] = await db.query(`
                UPDATE recepciones_mercaderia 
                SET fecha_vencimiento_documento = ?, updated_at = NOW()
                WHERE id = ?
            `, [fecha_vencimiento_documento, id]);
            
            if (result.affectedRows === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Recepción no encontrada'
                });
            }
            
            res.json({
                success: true,
                data: { id, fecha_vencimiento_documento },
                message: 'Fecha de vencimiento actualizada correctamente'
            });
            
        } catch (error) {
            console.error('Error actualizando fecha de vencimiento:', error);
            res.status(500).json({
                success: false,
                message: 'Error al actualizar fecha de vencimiento',
                error: error.message
            });
        }
    }
);

// 📊 RUTA PARA DASHBOARD CON INFORMACIÓN DE IVA
router.get('/dashboard-iva', 
    auth,
    async (req, res) => {
        try {
            // Estadísticas del último mes
            const sql = `
                SELECT 
                    COUNT(DISTINCT rm.id) as recepciones_mes,
                    SUM(dr.cantidad_recibida * dr.precio_con_iva) as total_comprado_mes,
                    SUM(dr.cantidad_recibida * dr.iva_unitario) as iva_pagado_mes,
                    COUNT(CASE WHEN rm.fecha_vencimiento_documento < CURDATE() THEN 1 END) as documentos_vencidos,
                    COUNT(CASE WHEN rm.fecha_vencimiento_documento BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY) THEN 1 END) as documentos_vencen_pronto,
                    AVG(dr.porcentaje_iva) as promedio_iva_mes
                FROM recepciones_mercaderia rm
                JOIN detalle_recepciones dr ON rm.id = dr.recepcion_id
                WHERE rm.fecha_recepcion >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH)
                  OR rm.fecha_vencimiento_documento IS NOT NULL
            `;
            
            const [dashboard] = await db.query(sql);
            
            res.json({
                success: true,
                data: dashboard,
                message: 'Dashboard con información de IVA obtenido correctamente'
            });
            
        } catch (error) {
            console.error('Error obteniendo dashboard de IVA:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener dashboard',
                error: error.message
            });
        }
    }
);

// ============= RUTAS DE DEVOLUCIONES =============

// GET /api/compras/devoluciones - Listar devoluciones
router.get('/devoluciones', 
    auth,
    query('page').optional().isInt({ min: 1 }).withMessage('Página inválida'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Límite inválido'),
    query('estado').optional().isIn(['PENDIENTE', 'PROCESADA', 'RESUELTA']).withMessage('Estado inválido'),
    query('proveedor_id').optional().isInt({ min: 1 }).withMessage('Proveedor ID inválido'),
    query('fecha_desde').optional().isISO8601().withMessage('Fecha desde inválida'),
    query('fecha_hasta').optional().isISO8601().withMessage('Fecha hasta inválida'),
    validateRequest,
    DevolucionesController.getDevoluciones
);

// GET /api/compras/devoluciones/:id - Obtener devolución específica
router.get('/devoluciones/:id', 
    auth, 
    param('id').isInt({ min: 1 }).withMessage('ID inválido'), 
    validateRequest, 
    DevolucionesController.getDevolucionById
);

// POST /api/compras/devoluciones - Crear nueva devolución
router.post('/devoluciones', 
    auth, 
    authorize(['ADMIN', 'OPERADOR']),
    devolucionValidation,
    validateRequest,
    DevolucionesController.crearDevolucion
);

// PUT /api/compras/devoluciones/:id/procesar - Procesar devolución
router.put('/devoluciones/:id/procesar', 
    auth, 
    authorize(['ADMIN', 'OPERADOR']),
    param('id').isInt({ min: 1 }).withMessage('ID inválido'),
    procesarDevolucionValidation,
    validateRequest, 
    DevolucionesController.procesarDevolucion
);

// GET /api/compras/devoluciones/proveedor/:proveedor_id - Devoluciones por proveedor
router.get('/devoluciones/proveedor/:proveedor_id',
    auth,
    param('proveedor_id').isInt({ min: 1 }).withMessage('Proveedor ID inválido'),
    query('estado').optional().isIn(['PENDIENTE', 'PROCESADA', 'RESUELTA']).withMessage('Estado inválido'),
    query('fecha_desde').optional().isISO8601().withMessage('Fecha desde inválida'),
    query('fecha_hasta').optional().isISO8601().withMessage('Fecha hasta inválida'),
    validateRequest,
    DevolucionesController.getDevolucionesPorProveedor
);

// GET /api/compras/devoluciones/estadisticas - Estadísticas de devoluciones
router.get('/devoluciones/estadisticas',
    auth,
    authorize(['ADMIN', 'OPERADOR']),
    query('fecha_desde').optional().isISO8601().withMessage('Fecha desde inválida'),
    query('fecha_hasta').optional().isISO8601().withMessage('Fecha hasta inválida'),
    validateRequest,
    DevolucionesController.getEstadisticasDevoluciones
);

// ============= RUTAS DE REPORTES =============

// GET /api/compras/reportes/dashboard - Dashboard de compras
router.get('/reportes/dashboard', 
    auth, 
    ComprasController.getDashboardCompras
);

// GET /api/compras/reportes/compras - Reporte de compras
router.get('/reportes/compras', 
    auth,
    query('fecha_desde').optional().isISO8601().withMessage('Fecha desde inválida'),
    query('fecha_hasta').optional().isISO8601().withMessage('Fecha hasta inválida'),
    query('proveedor_id').optional().isInt({ min: 1 }).withMessage('Proveedor ID inválido'),
    validateRequest,
    ComprasController.getReporteCompras
);

// GET /api/compras/reportes/vencimientos - Reporte de vencimientos
router.get('/reportes/vencimientos', 
    auth, 
    authorize(['ADMIN', 'OPERADOR']),
    query('dias').optional().isInt({ min: 1, max: 365 }).withMessage('Días debe estar entre 1 y 365'),
    validateRequest,
    ComprasController.getReporteVencimientos
);

// ============= MIDDLEWARE DE MANEJO DE ERRORES =============

// Middleware para manejar errores específicos de este módulo
router.use((error, req, res, next) => {
    console.error('Error en rutas de compras:', error);
    
    // Errores de validación de express-validator ya son manejados por validateRequest
    if (error.type === 'entity.parse.failed') {
        return res.status(400).json({
            success: false,
            message: 'JSON inválido en la solicitud'
        });
    }
    
    // Errores de base de datos
    if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
            success: false,
            message: 'Registro duplicado'
        });
    }
    
    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
        return res.status(400).json({
            success: false,
            message: 'Referencia a registro inexistente'
        });
    }
    
    // Error genérico
    res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
    });
});

module.exports = router;