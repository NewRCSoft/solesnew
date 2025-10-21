// =============================================
// routes/mercaderias.js - Rutas de Mercaderías CORREGIDAS
// =============================================
const express = require('express');
const router = express.Router();
const { query } = require('express-validator');
const { validateRequest } = require('../middleware/auth');

// Importar controladores - NOTA: Ahora importamos la instancia, no la clase
const mercaderiasController = require('../controllers/MercaderiasController');
const EtiquetasController = require('../controllers/EtiquetasController');

// Verificar que el controlador se importó correctamente
if (!mercaderiasController) {
    console.error('❌ ERROR: MercaderiasController no se pudo importar');
}

console.log('✅ MercaderiasController importado:', typeof mercaderiasController.index);

// Instanciar controlador de mercadería-proveedores si existe
let mpController = null;
try {
    const MercaderiaProveedoresController = require('../controllers/MercaderiaProveedoresController');
    mpController = new MercaderiaProveedoresController();
    console.log('✅ MercaderiaProveedoresController importado');
} catch (error) {
    console.warn('⚠️  MercaderiaProveedoresController no disponible:', error.message);
}

// =============================================
// RUTAS QUE DEBEN IR PRIMERO (para evitar conflictos con parámetros dinámicos)
// =============================================

// Búsqueda dinámica de mercaderías
router.get('/buscar', 
    query('q').isLength({ min: 2 }).withMessage('Término de búsqueda debe tener al menos 2 caracteres'),
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Límite debe ser entre 1 y 50'),
    validateRequest,
    mercaderiasController.buscar
);

router.get('/buscar-con-stock', mercaderiasController.buscarConStock);


// Reportes (van antes de las rutas con parámetros)
if (mpController) {
    router.get('/reportes/sin-proveedores', mpController.getMercaderiasSinProveedores);
}

router.get('/stock/bajo', mercaderiasController.getLowStock);

// =============================================
// CRUD BÁSICO
// =============================================
router.get('/', mercaderiasController.index);
router.get('/:id', mercaderiasController.show);
router.post('/', mercaderiasController.create);
router.put('/:id', mercaderiasController.update);
router.delete('/:id', mercaderiasController.destroy);

// =============================================
// BÚSQUEDAS ESPECIALES
// =============================================
router.get('/sku/:sku', mercaderiasController.getBySku);

// =============================================
// GESTIÓN DE IMÁGENES
// =============================================
router.post('/:id/imagen', mercaderiasController.uploadImage);
router.delete('/:id/imagen', mercaderiasController.removeImage);

// =============================================
// OPERACIONES ESPECIALES
// =============================================
router.put('/:id/toggle-active', mercaderiasController.toggleActive);
router.post('/:id/duplicar', mercaderiasController.duplicate);

// =============================================
// RUTAS DE RELACIONES CON PROVEEDORES (solo si el controlador está disponible)
// =============================================
if (mpController) {
    router.get('/:id/proveedores', mpController.getProveedoresMercaderia);
    router.post('/:id/proveedores', mpController.asignarProveedor);
    router.put('/:mercaderia_id/proveedores/:proveedor_id', mpController.actualizarRelacion);
    router.delete('/:mercaderia_id/proveedores/:proveedor_id', mpController.eliminarRelacion);
    router.get('/:id/proveedores/mejor-precio', mpController.getMejorPrecio);
} else {
    // Rutas de fallback si no está disponible el controlador de proveedores
    router.get('/:id/proveedores', (req, res) => {
        res.json({
            success: false,
            message: 'Módulo de proveedores no disponible',
            data: []
        });
    });
}

// =============================================
// MIDDLEWARE DE MANEJO DE ERRORES
// =============================================
router.use((error, req, res, next) => {
    console.error('Error en rutas de mercaderías:', error);
    
    if (error.type === 'entity.parse.failed') {
        return res.status(400).json({
            success: false,
            message: 'JSON inválido en la solicitud'
        });
    }
    
    res.status(500).json({
        success: false,
        message: 'Error interno del servidor en rutas de mercaderías'
    });
});

module.exports = router;