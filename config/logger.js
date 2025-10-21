// =============================================
// config/logger.js - Logger Básico
// =============================================
const fs = require('fs');
const path = require('path');

// Crear directorio de logs si no existe
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Logger básico
const logger = {
    info: (message, meta = {}) => {
        const timestamp = new Date().toISOString();
        const logMessage = `${timestamp} [INFO] ${message} ${JSON.stringify(meta)}`;
        console.log('ℹ️ ', logMessage);
        
        // Escribir a archivo
        fs.appendFileSync(
            path.join(logsDir, 'combined.log'),
            logMessage + '\n'
        );
    },
    
    error: (message, meta = {}) => {
        const timestamp = new Date().toISOString();
        const logMessage = `${timestamp} [ERROR] ${message} ${JSON.stringify(meta)}`;
        console.error('❌', logMessage);
        
        // Escribir a archivo
        fs.appendFileSync(
            path.join(logsDir, 'error.log'),
            logMessage + '\n'
        );
        fs.appendFileSync(
            path.join(logsDir, 'combined.log'),
            logMessage + '\n'
        );
    },
    
    warn: (message, meta = {}) => {
        const timestamp = new Date().toISOString();
        const logMessage = `${timestamp} [WARN] ${message} ${JSON.stringify(meta)}`;
        console.warn('⚠️ ', logMessage);
        
        // Escribir a archivo
        fs.appendFileSync(
            path.join(logsDir, 'combined.log'),
            logMessage + '\n'
        );
    },
    
    debug: (message, meta = {}) => {
        if (process.env.NODE_ENV === 'development') {
            const timestamp = new Date().toISOString();
            const logMessage = `${timestamp} [DEBUG] ${message} ${JSON.stringify(meta)}`;
            console.log('🐛', logMessage);
        }
    }
};

module.exports = logger;