// =============================================
// routes/auth.js - Rutas de Autenticación
// =============================================
const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/AuthController');
const { body } = require('express-validator');
const { validateRequest, auth } = require('../middleware/auth');

const loginValidation = [
    body('email').isEmail().withMessage('Email inválido'),
    body('password').notEmpty().withMessage('Password requerido')
];

const registerValidation = [
    body('nombre').notEmpty().withMessage('Nombre requerido'),
    body('email').isEmail().withMessage('Email inválido'),
    body('password').isLength({ min: 6 }).withMessage('Password debe tener al menos 6 caracteres'),
    body('rol').isIn(['ADMIN', 'OPERADOR', 'VENDEDOR']).withMessage('Rol inválido')
];

router.post('/login', loginValidation, validateRequest, AuthController.login);
router.post('/register', registerValidation, validateRequest, AuthController.register);
router.get('/profile', auth, AuthController.getProfile);
router.post('/refresh', AuthController.refreshToken);

module.exports = router;