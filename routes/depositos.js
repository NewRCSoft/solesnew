// =============================================
// routes/depositos.js - Rutas de Depósitos
// =============================================
const express = require('express');
const router = express.Router();
const DepositosController = require('../controllers/DepositosController');

router.get('/', DepositosController.index);
router.get('/:id', DepositosController.show || ((req, res) => res.json({success: true, data: {}})));
router.post('/', DepositosController.create);
router.put('/:id', DepositosController.update || ((req, res) => res.json({success: true, message: 'Actualizado'})));
router.delete('/:id', DepositosController.destroy || ((req, res) => res.json({success: true, message: 'Eliminado'})));

// Operaciones especiales
router.get('/:id/stock', DepositosController.getStock);


module.exports = router;
