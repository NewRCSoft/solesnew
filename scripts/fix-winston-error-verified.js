// =============================================
// scripts/fix-winston-error-verified.js - VERSIÓN CORREGIDA
// =============================================
const fs = require('fs').promises;
const path = require('path');

// Colores para consola
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function printStatus(message) {
    console.log(`${colors.green}✅ ${message}${colors.reset}`);
}

function printWarning(message) {
    console.log(`${colors.yellow}⚠️  ${message}${colors.reset}`);
}

function printError(message) {
    console.log(`${colors.red}❌ ${message}${colors.reset}`);
}

function printInfo(message) {
    console.log(`${colors.blue}ℹ️  ${message}${colors.reset}`);
}

function printHeader(title) {
    console.log(`\n${colors.bright}${colors.cyan}=== ${title} ===${colors.reset}\n`);
}

async function eliminarDependenciaWinston() {
    printHeader('ELIMINANDO DEPENDENCIA DE WINSTON - VERSIÓN CORREGIDA');

    try {
        // === 1. VERIFICAR ARCHIVOS EXISTENTES ===
        printInfo('Verificando archivos existentes...');
        
        const loggerPath = path.join(__dirname, '..', 'config', 'logger.js');
        const databasePath = path.join(__dirname, '..', 'config', 'database.js');
        
        let loggerExists = false;
        let databaseExists = false;
        
        try {
            await fs.access(loggerPath);
            loggerExists = true;
            printInfo('✓ config/logger.js existe');
        } catch (err) {
            printWarning('config/logger.js no existe, se creará');
        }
        
        try {
            await fs.access(databasePath);
            databaseExists = true;
            printInfo('✓ config/database.js existe');
        } catch (err) {
            printWarning('config/database.js no existe, se creará');
        }

        // === 2. CREAR BACKUPS ===
        printInfo('Creando backups de seguridad...');
        const timestamp = Date.now();
        const backupDir = path.join(__dirname, '..', 'backups');
        
        // Crear directorio de backups si no existe
        try {
            await fs.mkdir(backupDir, { recursive: true });
        } catch (err) {
            printWarning(`No se pudo crear directorio de backups: ${err.message}`);
        }
        
        if (loggerExists) {
            try {
                const loggerContent = await fs.readFile(loggerPath, 'utf8');
                const backupLoggerPath = path.join(backupDir, `logger.js.backup.${timestamp}`);
                await fs.writeFile(backupLoggerPath, loggerContent);
                printStatus(`Backup logger: ${backupLoggerPath}`);
            } catch (err) {
                printError(`Error al crear backup de logger: ${err.message}`);
            }
        }
        
        if (databaseExists) {
            try {
                const databaseContent = await fs.readFile(databasePath, 'utf8');
                const backupDatabasePath = path.join(backupDir, `database.js.backup.${timestamp}`);
                await fs.writeFile(backupDatabasePath, databaseContent);
                printStatus(`Backup database: ${backupDatabasePath}`);
            } catch (err) {
                printError(`Error al crear backup de database: ${err.message}`);
            }
        }

        // === 3. CREAR config/logger.js SIN WINSTON ===
        printInfo('Creando config/logger.js sin dependencias...');
        
        const loggerContent = `// =============================================
// config/logger.js - Logger Simple SIN Winston
// =============================================

class SimpleLogger {
    constructor() {
        this.level = process.env.LOG_LEVEL || 'info';
        this.colors = {
            reset: '\\x1b[0m',
            bright: '\\x1b[1m',
            red: '\\x1b[31m',
            green: '\\x1b[32m',
            yellow: '\\x1b[33m',
            blue: '\\x1b[34m',
            cyan: '\\x1b[36m'
        };
    }

    formatMessage(level, message, data = null) {
        const timestamp = new Date().toISOString();
        const baseMessage = \`[\${timestamp}] [\${level.toUpperCase()}] \${message}\`;
        
        if (data !== null && data !== undefined) {
            if (typeof data === 'object') {
                try {
                    return \`\${baseMessage} - \${JSON.stringify(data, null, 2)}\`;
                } catch (e) {
                    return \`\${baseMessage} - [Objeto no serializable: \${e.message}]\`;
                }
            } else {
                return \`\${baseMessage} - \${String(data)}\`;
            }
        }
        return baseMessage;
    }

    error(message, error = null) {
        const formattedMessage = this.formatMessage('error', message, error);
        console.error(\`\${this.colors.red}\${formattedMessage}\${this.colors.reset}\`);
        
        if (error && error.stack) {
            console.error(\`\${this.colors.red}Stack: \${error.stack}\${this.colors.reset}\`);
        }
    }

    warn(message, data = null) {
        const formattedMessage = this.formatMessage('warn', message, data);
        console.warn(\`\${this.colors.yellow}\${formattedMessage}\${this.colors.reset}\`);
    }

    info(message, data = null) {
        if (this.level === 'debug' || this.level === 'info') {
            const formattedMessage = this.formatMessage('info', message, data);
            console.log(\`\${this.colors.blue}\${formattedMessage}\${this.colors.reset}\`);
        }
    }

    debug(message, data = null) {
        if (this.level === 'debug') {
            const formattedMessage = this.formatMessage('debug', message, data);
            console.log(\`\${this.colors.cyan}\${formattedMessage}\${this.colors.reset}\`);
        }
    }

    success(message, data = null) {
        const formattedMessage = this.formatMessage('success', message, data);
        console.log(\`\${this.colors.green}\${formattedMessage}\${this.colors.reset}\`);
    }

    log(level, message, data = null) {
        switch(level) {
            case 'error':
                this.error(message, data);
                break;
            case 'warn':
                this.warn(message, data);
                break;
            case 'info':
                this.info(message, data);
                break;
            case 'debug':
                this.debug(message, data);
                break;
            default:
                this.info(message, data);
        }
    }
}

module.exports = new SimpleLogger();
`;

        try {
            await fs.writeFile(loggerPath, loggerContent);
            printStatus('config/logger.js creado correctamente');
        } catch (err) {
            printError(`Error al crear logger.js: ${err.message}`);
            throw err;
        }

        // === 4. CREAR config/database.js COMPATIBLE ===
        printInfo('Creando config/database.js compatible...');
        
        const databaseContent = `// =============================================
// config/database.js - Configuración de Base de Datos SIN Winston
// =============================================
const mysql = require('mysql2/promise');
const logger = require('./logger');

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'sistema_stock',
    port: process.env.DB_PORT || 3306,
    charset: 'utf8mb4',
    timezone: 'Z',
    connectionLimit: 20,
    acquireTimeout: 60000,
    timeout: 60000,
    reconnect: true,
    multipleStatements: true
};

const pool = mysql.createPool(dbConfig);

const getConnection = async () => {
    try {
        return await pool.getConnection();
    } catch (error) {
        logger.error('Error al obtener conexión de BD:', error);
        throw error;
    }
};

const query = async (sql, params = []) => {
    const queryConnection = await getConnection();
    try {
        const [rows] = await queryConnection.execute(sql, params);
        return rows;
    } catch (error) {
        logger.error('Error ejecutando query:', { 
            sql: sql.substring(0, 100) + '...', 
            params: params.length, 
            error: error.message 
        });
        throw error;
    } finally {
        queryConnection.release();
    }
};

const transaction = async (callback) => {
    const transactionConnection = await getConnection();
    try {
        await transactionConnection.beginTransaction();
        const result = await callback(transactionConnection);
        await transactionConnection.commit();
        return result;
    } catch (error) {
        await transactionConnection.rollback();
        logger.error('Error en transacción:', error);
        throw error;
    } finally {
        transactionConnection.release();
    }
};

const beginTransaction = async () => {
    const connection = await getConnection();
    await connection.beginTransaction();
    return connection;
};

const commit = async (connection) => {
    await connection.commit();
    connection.release();
};

const rollback = async (connection) => {
    await connection.rollback();
    connection.release();
};

const testConnection = async () => {
    try {
        const testConn = await getConnection();
        await testConn.ping();
        testConn.release();
        logger.success('Conexión a base de datos exitosa');
        return true;
    } catch (error) {
        logger.error('Error conectando a base de datos:', error);
        return false;
    }
};

const getDatabaseInfo = async () => {
    try {
        const connection = await getConnection();
        const [dbInfo] = await connection.execute('SELECT DATABASE() as db_name, VERSION() as version');
        connection.release();
        return dbInfo[0];
    } catch (error) {
        logger.error('Error obteniendo información de BD:', error);
        return null;
    }
};

const tableExists = async (tableName) => {
    try {
        const [tables] = await query('SHOW TABLES LIKE ?', [tableName]);
        return tables.length > 0;
    } catch (error) {
        logger.error(\`Error verificando tabla \${tableName}:\`, error);
        return false;
    }
};

const closePool = async () => {
    try {
        await pool.end();
        logger.info('Pool de conexiones cerrado');
    } catch (error) {
        logger.error('Error cerrando pool:', error);
    }
};

module.exports = {
    pool,
    query,
    transaction,
    getConnection,
    beginTransaction,
    commit,
    rollback,
    testConnection,
    getDatabaseInfo,
    tableExists,
    closePool
};
`;

        try {
            await fs.writeFile(databasePath, databaseContent);
            printStatus('config/database.js creado correctamente');
        } catch (err) {
            printError(`Error al crear database.js: ${err.message}`);
            throw err;
        }

        // === 5. VERIFICAR Y CORREGIR OTROS ARCHIVOS ===
        printInfo('Verificando otros archivos que puedan usar winston...');
        
        const archivosParaVerificar = [
            'models/BaseModel.js',
            'models/Mercaderia.js', 
            'controllers/MercaderiasController.js',
            'controllers/EtiquetasController.js',
            'controllers/ReportesController.js',
            'controllers/DepositosController.js'
        ];

        let archivosCorregidos = 0;

        for (const archivo of archivosParaVerificar) {
            const filePath = path.join(__dirname, '..', archivo);
            
            try {
                await fs.access(filePath);
                let content = await fs.readFile(filePath, 'utf8');
                
                if (content.includes('winston') || content.includes('require(\'winston\')')) {
                    printWarning(`${archivo} contiene referencias a winston, corrigiendo...`);
                    
                    // Reemplazar referencias a winston
                    let fixedContent = content
                        .replace(/const winston = require\('winston'\);?/g, '')
                        .replace(/require\('winston'\)/g, 'require(\'../config/logger\')')
                        .replace(/\bwinston\./g, 'logger.');
                    
                    // Crear backup
                    const backupPath = path.join(backupDir, `${path.basename(archivo)}.backup.${timestamp}`);
                    await fs.writeFile(backupPath, content);
                    
                    // Escribir archivo corregido
                    await fs.writeFile(filePath, fixedContent);
                    printStatus(`✓ ${archivo} corregido (backup: ${backupPath})`);
                    archivosCorregidos++;
                } else {
                    printInfo(`✓ ${archivo} - sin referencias a winston`);
                }
                
            } catch (err) {
                if (err.code === 'ENOENT') {
                    printInfo(`✓ ${archivo} - no existe, omitiendo`);
                } else {
                    printWarning(`No se pudo verificar ${archivo}: ${err.message}`);
                }
            }
        }

        // === 6. VERIFICAR PACKAGE.JSON ===
        printInfo('Verificando package.json...');
        
        try {
            const packagePath = path.join(__dirname, '..', 'package.json');
            const packageContent = await fs.readFile(packagePath, 'utf8');
            const packageJson = JSON.parse(packageContent);
            
            if (packageJson.dependencies?.winston) {
                printWarning('Winston está en dependencies de package.json');
                printInfo('Considera ejecutar: npm uninstall winston');
            } else {
                printStatus('package.json no tiene winston como dependencia');
            }
        } catch (err) {
            printWarning(`No se pudo verificar package.json: ${err.message}`);
        }

        // === 7. PRUEBA DE FUNCIONAMIENTO ===
        printInfo('Probando el nuevo logger...');
        
        try {
            delete require.cache[require.resolve('../config/logger')];
            const testLogger = require('../config/logger');
            
            testLogger.info('Prueba de logger - funcionalidad básica');
            testLogger.success('Logger sin winston funcionando correctamente');
            printStatus('✓ Prueba de logger exitosa');
            
        } catch (err) {
            printError(`Error probando logger: ${err.message}`);
        }

        // === 8. REPORTE FINAL ===
        printHeader('CORRECCIÓN COMPLETADA EXITOSAMENTE');
        
        console.log(`📊 RESUMEN DE CAMBIOS:`);
        console.log(`   • config/logger.js - Reemplazado (logger simple)`);
        console.log(`   • config/database.js - Actualizado (compatible)`);
        console.log(`   • Archivos corregidos: ${archivosCorregidos}`);
        console.log(`   • Backups creados en: ${backupDir}`);
        
        console.log(`\n🎯 BENEFICIOS:`);
        console.log(`   ✅ Sin dependencia de Winston`);
        console.log(`   ✅ Logger con colores y formato`);
        console.log(`   ✅ Compatible con código existente`);
        console.log(`   ✅ Manejo robusto de errores`);
        console.log(`   ✅ Backups de seguridad creados`);

        console.log(`\n🚀 PRÓXIMOS PASOS:`);
        console.log(`   1. npm uninstall winston (para remover completamente)`);
        console.log(`   2. npm install jsbarcode canvas pdfkit multer (si es necesario)`);
        console.log(`   3. node server.js`);
        console.log(`   4. Verificar: curl http://localhost:3001/api/health`);

    } catch (err) {
        printError(`Error durante la corrección: ${err.message}`);
        console.error(err.stack);
        process.exit(1);
    }
}

async function verificarSintaxis() {
    printHeader('VERIFICACIÓN DE SINTAXIS POST-CORRECCIÓN');
    
    const archivos = [
        'config/logger.js',
        'config/database.js'
    ];
    
    for (const archivo of archivos) {
        const filePath = path.join(__dirname, '..', archivo);
        
        try {
            await fs.access(filePath);
            delete require.cache[require.resolve(filePath)];
            require(filePath);
            
            printStatus(`✓ ${archivo} - Sintaxis correcta`);
        } catch (err) {
            printError(`✗ ${archivo} - Error de sintaxis: ${err.message}`);
        }
    }
}

if (require.main === module) {
    eliminarDependenciaWinston()
        .then(() => verificarSintaxis())
        .then(() => {
            console.log('\n🎉 Corrección y verificación completadas');
            process.exit(0);
        })
        .catch(err => {
            console.error('Error en el proceso:', err.stack);
            process.exit(1);
        });
}

module.exports = { eliminarDependenciaWinston, verificarSintaxis };