// =============================================
// controllers/AuthController.js - Controlador de Autenticación
// =============================================
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const logger = require('../config/logger');

class AuthController {
    async login(req, res) {
        try {
            const { email, password } = req.body;

            // Buscar usuario
            const sql = `
                SELECT u.*, v.razonSocial as vendedor_nombre 
                FROM usuarios u 
                LEFT JOIN vendedores v ON u.vendedor_id = v.vendedorId
                WHERE u.email = ? AND u.activo = 1
            `;
            const users = await db.query(sql, [email]);
            const user = users[0];

            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: 'Email o password incorrectos'
                });
            }

            // Verificar password
            const isValidPassword = await bcrypt.compare(password, user.password_hash);
            if (!isValidPassword) {
                return res.status(401).json({
                    success: false,
                    message: 'Email o password incorrectos'
                });
            }

            // Generar token
            const token = jwt.sign(
                { 
                    id: user.id, 
                    email: user.email, 
                    rol: user.rol,
                    vendedor_id: user.vendedor_id 
                },
                process.env.JWT_SECRET || 'fallback_secret',
                { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
            );

            // Actualizar último login
            await db.query('UPDATE usuarios SET ultimo_login = NOW() WHERE id = ?', [user.id]);

            // Remover password del response
            delete user.password_hash;

            res.json({
                success: true,
                message: 'Login exitoso',
                token,
                user
            });

        } catch (error) {
            logger.error('Error en login:', error);
            res.status(500).json({
                success: false,
                message: 'Error interno del servidor',
                error: error.message
            });
        }
    }

    async register(req, res) {
        try {
            const { nombre, email, password, rol, vendedor_id = null } = req.body;

            // Verificar si el email ya existe
            const existingUser = await db.query('SELECT id FROM usuarios WHERE email = ?', [email]);
            if (existingUser.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: 'El email ya está registrado'
                });
            }

            // Hash del password
            const saltRounds = 12;
            const passwordHash = await bcrypt.hash(password, saltRounds);

            // Crear usuario
            const sql = `
                INSERT INTO usuarios (nombre, email, password_hash, rol, vendedor_id)
                VALUES (?, ?, ?, ?, ?)
            `;
            const result = await db.query(sql, [nombre, email, passwordHash, rol, vendedor_id]);

            res.status(201).json({
                success: true,
                message: 'Usuario creado exitosamente',
                user_id: result.insertId
            });

        } catch (error) {
            logger.error('Error en register:', error);
            res.status(500).json({
                success: false,
                message: 'Error al crear usuario',
                error: error.message
            });
        }
    }

    async getProfile(req, res) {
        try {
            const sql = `
                SELECT u.id, u.nombre, u.email, u.rol, u.vendedor_id, u.ultimo_login,
                       v.razonSocial as vendedor_nombre
                FROM usuarios u
                LEFT JOIN vendedores v ON u.vendedor_id = v.vendedorId
                WHERE u.id = ?
            `;
            const users = await db.query(sql, [req.user.id]);
            const user = users[0];

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'Usuario no encontrado'
                });
            }

            res.json({
                success: true,
                user
            });
        } catch (error) {
            logger.error('Error en getProfile:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener perfil',
                error: error.message
            });
        }
    }

    async refreshToken(req, res) {
        try {
            const { token } = req.body;
            
            if (!token) {
                return res.status(401).json({
                    success: false,
                    message: 'Token requerido'
                });
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
            
            // Verificar que el usuario sigue activo
            const users = await db.query('SELECT id FROM usuarios WHERE id = ? AND activo = 1', [decoded.id]);
            if (users.length === 0) {
                return res.status(401).json({
                    success: false,
                    message: 'Usuario no válido'
                });
            }

            // Generar nuevo token
            const newToken = jwt.sign(
                { 
                    id: decoded.id, 
                    email: decoded.email, 
                    rol: decoded.rol,
                    vendedor_id: decoded.vendedor_id 
                },
                process.env.JWT_SECRET || 'fallback_secret',
                { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
            );

            res.json({
                success: true,
                token: newToken
            });

        } catch (error) {
            logger.error('Error en refreshToken:', error);
            res.status(401).json({
                success: false,
                message: 'Token inválido'
            });
        }
    }
}

module.exports = new AuthController();