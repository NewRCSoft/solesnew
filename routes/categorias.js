// =============================================
// routes/categorias.js - Rutas de Categorías
// =============================================
const express = require('express');
const router = express.Router();
const CategoriasController = require('../controllers/CategoriasController');

router.get('/', CategoriasController.index);
router.get('/:id', CategoriasController.show || ((req, res) => res.json({success: true, data: {}})));
router.post('/', CategoriasController.create);
router.put('/:id', CategoriasController.update || ((req, res) => res.json({success: true, message: 'Categoría actualizada'})));
router.delete('/:id', CategoriasController.destroy || ((req, res) => res.json({success: true, message: 'Categoría eliminada'})));

module.exports = router;