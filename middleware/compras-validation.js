// =============================================
// middleware/compras-validation.js - Validaciones Específicas
// =============================================
const { body, validationResult } = require('express-validator');
const ComprasHelper = require('../utils/compras-helper');

// Validación personalizada para fechas de orden
const validarFechasOrden = body('fecha_orden').custom((fechaOrden, { req }) => {
    try {
        ComprasHelper.validarFechasOrden(fechaOrden, req.body.fecha_entrega_esperada);
        return true;
    } catch (error) {
        throw new Error(error.message);
    }
});

// Validación personalizada para items de orden
const validarItemsOrden = body('items').custom((items) => {
    if (!Array.isArray(items) || items.length === 0) {
        throw new Error('Debe incluir al menos un item');
    }

    try {
        ComprasHelper.validarConsistenciaPrecios(items);
        return true;
    } catch (error) {
        throw new Error(error.message);
    }
});

// Validación personalizada para códigos de lote
const validarCodigoLote = body('items.*.numero_lote').optional().custom((codigoLote) => {
    if (codigoLote && !ComprasHelper.validarCodigoLote(codigoLote)) {
        throw new Error('Formato de código de lote inválido. Use formato: PROVEEDOR-YYYYMMDD-NNN');
    }
    return true;
});

// Middleware de validación de compras
const validacionCompras = [
    validarFechasOrden,
    validarItemsOrden,
    validarCodigoLote,
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Errores de validación',
                errors: errors.array()
            });
        }
        next();
    }
];

module.exports = {
    validacionCompras,
    validarFechasOrden,
    validarItemsOrden,
    validarCodigoLote
};