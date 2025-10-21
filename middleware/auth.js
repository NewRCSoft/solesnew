// =============================================
// middleware/auth.js - Versión Mínima
// =============================================
const { validationResult } = require('express-validator');

// Middleware de autenticación básico
function auth(req, res, next) {
    console.log('🔐 Middleware auth ejecutado');
    
    // Simular usuario autenticado
    req.user = {
        id: 1,
        nombre: 'Usuario Demo',
        rol: 'ADMIN'
    };
    
    next();
}

// Middleware de validación de request
function validateRequest(req, res, next) {
    console.log('✅ Middleware validateRequest ejecutado');
    
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

// Middleware de autorización por roles
function authorize(rolesPermitidos = []) {
    return function(req, res, next) {
        console.log('🛡️ Middleware authorize ejecutado');
        
        // Si no se especifican roles, permitir acceso
        if (rolesPermitidos.length === 0) {
            return next();
        }
        
        // Verificar rol
        const userRole = req.user?.rol;
        
        if (!userRole || !rolesPermitidos.includes(userRole)) {
            return res.status(403).json({
                success: false,
                message: 'No tienes permisos para acceder a este recurso',
                required_roles: rolesPermitidos,
                user_role: userRole
            });
        }
        
        next();
    };
}

// ✅ VERIFICAR QUE TODAS LAS FUNCIONES EXISTEN
console.log('🔍 Verificando funciones del middleware auth:');
console.log('auth:', typeof auth);
console.log('validateRequest:', typeof validateRequest);
console.log('authorize:', typeof authorize);

module.exports = {
    auth,
    validateRequest,
    authorize
};