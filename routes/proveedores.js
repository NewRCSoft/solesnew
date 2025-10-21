// =============================================
// routes/proveedores.js - Rutas de Proveedores COMPLETAS
// =============================================
const express = require('express');
const router = express.Router();
const ProveedoresController = require('../controllers/ProveedoresController');

// =============================================
// CRUD BÁSICO
// =============================================

// GET /api/v1/proveedores - Listar todos los proveedores
router.get('/', ProveedoresController.index);

// GET /api/v1/proveedores/:id - Obtener proveedor por ID
router.get('/:id', ProveedoresController.show);

// POST /api/v1/proveedores - Crear nuevo proveedor
router.post('/', ProveedoresController.create);

// PUT /api/v1/proveedores/:id - Actualizar proveedor
router.put('/:id', ProveedoresController.update);

// DELETE /api/v1/proveedores/:id - Eliminar proveedor (cambiar a inactivo)
router.delete('/:id', ProveedoresController.destroy);

// =============================================
// OPERACIONES ESPECIALES
// =============================================

// PUT /api/v1/proveedores/:id/toggle-active - Activar/Desactivar proveedor
router.put('/:id/toggle-active', ProveedoresController.toggleActive);

// GET /api/v1/proveedores/buscar/:termino - Búsqueda por razón social o CUIT
router.get('/buscar/:termino', ProveedoresController.buscar);

// GET /api/v1/proveedores/cuit/:cuit - Buscar por CUIT específico
router.get('/cuit/:cuit', ProveedoresController.getByCuit);

// =============================================
// REPORTES Y ESTADÍSTICAS
// =============================================

// GET /api/v1/proveedores/:id/estadisticas - Estadísticas del proveedor
router.get('/:id/estadisticas', ProveedoresController.getEstadisticas);

// GET /api/v1/proveedores/:id/compras - Historial de compras del proveedor
router.get('/:id/compras', ProveedoresController.getCompras);

// GET /api/v1/proveedores/activos/count - Contar proveedores activos
router.get('/activos/count', ProveedoresController.getProveedoresActivos);

// =============================================
// 🆕 NUEVAS RUTAS PARA COMPRAS
// =============================================

// GET /api/v1/proveedores/:id/mercaderias - Mercaderías del proveedor
router.get('/:id/mercaderias', ProveedoresController.getMercaderias);

// GET /api/v1/proveedores/:id/info-compras - Información para compras
router.get('/:id/info-compras', ProveedoresController.getInfoCompras);

module.exports = router;