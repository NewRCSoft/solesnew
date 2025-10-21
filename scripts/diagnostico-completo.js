// =============================================
// scripts/diagnostico-completo.js - Diagnóstico del Sistema
// =============================================
const fs = require('fs').promises;
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

// Colores para console
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

class DiagnosticoSistema {
    constructor() {
        this.errores = [];
        this.warnings = [];
        this.connection = null;
    }

    async ejecutarDiagnostico() {
        printHeader('DIAGNÓSTICO COMPLETO DEL SISTEMA');
        
        await this.verificarEstructuraArchivos();
        await this.verificarDependencias();
        await this.verificarBaseDatos();
        await this.verificarConfiguracion();
        await this.probarEndpoints();
        await this.generarReporte();
    }

    async verificarEstructuraArchivos() {
        printHeader('VERIFICACIÓN DE ESTRUCTURA DE ARCHIVOS');

        const archivosRequeridos = {
            'Archivos Principales': [
                'server.js',
                'index.html',
                'package.json',
                '.env'
            ],
            'Modelos': [
                'models/BaseModel.js',
                'models/Mercaderia.js'
            ],
            'Controladores': [
                'controllers/MercaderiasController.js',
                'controllers/EtiquetasController.js',
                'controllers/ReportesController.js',
                'controllers/DepositosController.js',
                'controllers/StockController.js'
            ],
            'Rutas': [
                'routes/index.js',
                'routes/mercaderias.js'
            ],
            'Configuración': [
                'config/database.js',
                'config/logger.js'
            ]
        };

        for (const [categoria, archivos] of Object.entries(archivosRequeridos)) {
            console.log(`\n📁 ${categoria}:`);
            
            for (const archivo of archivos) {
                try {
                    await fs.access(archivo);
                    printStatus(`${archivo} - Existe`);
                    
                    // Verificar sintaxis básica para archivos JS
                    if (archivo.endsWith('.js')) {
                        try {
                            const content = await fs.readFile(archivo, 'utf8');
                            if (content.length === 0) {
                                printWarning(`${archivo} - Archivo vacío`);
                                this.warnings.push(`${archivo} está vacío`);
                            }
                        } catch (error) {
                            printWarning(`${archivo} - Error leyendo: ${error.message}`);
                        }
                    }
                } catch (error) {
                    printError(`${archivo} - NO EXISTE`);
                    this.errores.push(`Archivo faltante: ${archivo}`);
                }
            }
        }
    }

    async verificarDependencias() {
        printHeader('VERIFICACIÓN DE DEPENDENCIAS');

        try {
            const packageJson = JSON.parse(await fs.readFile('package.json', 'utf8'));
            const dependenciasRequeridas = [
                'express', 'mysql2', 'cors', 'dotenv', 'jsbarcode', 'canvas', 'pdfkit', 'multer'
            ];

            console.log('📦 Dependencias requeridas:');
            for (const dep of dependenciasRequeridas) {
                if (packageJson.dependencies && packageJson.dependencies[dep]) {
                    printStatus(`${dep} v${packageJson.dependencies[dep]}`);
                } else {
                    printError(`${dep} - FALTANTE`);
                    this.errores.push(`Dependencia faltante: ${dep}`);
                }
            }
        } catch (error) {
            printError(`Error leyendo package.json: ${error.message}`);
            this.errores.push('package.json no accesible');
        }
    }

    async verificarBaseDatos() {
        printHeader('VERIFICACIÓN DE BASE DE DATOS');

        try {
            this.connection = await mysql.createConnection({
                host: process.env.DB_HOST || 'localhost',
                port: process.env.DB_PORT || 3306,
                user: process.env.DB_USER || 'root',
                password: process.env.DB_PASSWORD || '',
                database: process.env.DB_NAME || 'sistema_stock'
            });

            printStatus('Conexión a base de datos establecida');

            // Verificar tablas principales
            const tablasRequeridas = [
                'mercaderias', 'depositos', 'categorias', 'stock_depositos', 
                'movimientos_stock', 'usuarios'
            ];

            console.log('\n🗂️  Verificando tablas:');
            for (const tabla of tablasRequeridas) {
                try {
                    const [rows] = await this.connection.execute(`SHOW TABLES LIKE '${tabla}'`);
                    if (rows.length > 0) {
                        // Contar registros
                        const [count] = await this.connection.execute(`SELECT COUNT(*) as total FROM ${tabla}`);
                        printStatus(`${tabla} - Existe (${count[0].total} registros)`);
                    } else {
                        printError(`${tabla} - NO EXISTE`);
                        this.errores.push(`Tabla faltante: ${tabla}`);
                    }
                } catch (error) {
                    printError(`${tabla} - Error: ${error.message}`);
                    this.errores.push(`Error en tabla ${tabla}: ${error.message}`);
                }
            }

            // Verificar estructura de mercaderías
            try {
                const [columns] = await this.connection.execute("DESCRIBE mercaderias");
                const hasCode128 = columns.some(col => col.Field === 'codigo_code128');
                const hasEan13 = columns.some(col => col.Field === 'codigo_ean13');

                if (hasCode128) {
                    printStatus('Tabla mercaderías tiene columna codigo_code128');
                } else {
                    printWarning('Tabla mercaderías NO tiene columna codigo_code128');
                    this.warnings.push('Falta migración de Code 128');
                }

                if (hasEan13) {
                    printWarning('Tabla mercaderías aún tiene columna codigo_ean13 (migración pendiente)');
                }
            } catch (error) {
                printError(`Error verificando estructura mercaderías: ${error.message}`);
            }

        } catch (error) {
            printError(`Error conectando a base de datos: ${error.message}`);
            this.errores.push(`Error de conexión DB: ${error.message}`);
        }
    }

    async verificarConfiguracion() {
        printHeader('VERIFICACIÓN DE CONFIGURACIÓN');

        // Verificar .env
        try {
            await fs.access('.env');
            printStatus('.env existe');

            const envContent = await fs.readFile('.env', 'utf8');
            const variablesRequeridas = [
                'DB_HOST', 'DB_USER', 'DB_NAME', 'PORT'
            ];

            console.log('\n🔧 Variables de entorno:');
            for (const variable of variablesRequeridas) {
                if (envContent.includes(variable)) {
                    printStatus(`${variable} - Configurada`);
                } else {
                    printWarning(`${variable} - NO CONFIGURADA`);
                    this.warnings.push(`Variable faltante: ${variable}`);
                }
            }
        } catch (error) {
            printError('.env no existe');
            this.errores.push('Archivo .env faltante');
        }

        // Verificar puerto disponible
        const puerto = process.env.PORT || 3001;
        printInfo(`Puerto configurado: ${puerto}`);
    }

    async probarEndpoints() {
        printHeader('VERIFICACIÓN DE CONTROLADORES');

        const controladores = [
            'MercaderiasController',
            'EtiquetasController', 
            'ReportesController',
            'DepositosController'
        ];

        for (const controlador of controladores) {
            try {
                const controllerPath = `./controllers/${controlador}.js`;
                await fs.access(controllerPath);
                
                // Intentar cargar el controlador
                try {
                    delete require.cache[require.resolve(controllerPath)];
                    const Controller = require(controllerPath);
                    
                    if (Controller && typeof Controller === 'object') {
                        printStatus(`${controlador} - Carga correctamente`);
                        
                        // Verificar métodos principales
                        const metodos = ['index', 'show', 'create', 'update'];
                        for (const metodo of metodos) {
                            if (typeof Controller[metodo] === 'function') {
                                printStatus(`  └─ ${metodo}() disponible`);
                            } else {
                                printWarning(`  └─ ${metodo}() FALTANTE`);
                            }
                        }
                    } else {
                        printError(`${controlador} - No exporta objeto válido`);
                        this.errores.push(`Controlador ${controlador} inválido`);
                    }
                } catch (requireError) {
                    printError(`${controlador} - Error al cargar: ${requireError.message}`);
                    this.errores.push(`Error cargando ${controlador}: ${requireError.message}`);
                }
            } catch (error) {
                printError(`${controlador} - NO EXISTE`);
                this.errores.push(`Controlador faltante: ${controlador}`);
            }
        }
    }

    async generarReporte() {
        printHeader('REPORTE FINAL');

        console.log(`\n📊 RESUMEN:`);
        console.log(`   • Errores críticos: ${this.errores.length}`);
        console.log(`   • Advertencias: ${this.warnings.length}`);

        if (this.errores.length > 0) {
            console.log(`\n${colors.red}❌ ERRORES CRÍTICOS:${colors.reset}`);
            this.errores.forEach((error, index) => {
                console.log(`   ${index + 1}. ${error}`);
            });
        }

        if (this.warnings.length > 0) {
            console.log(`\n${colors.yellow}⚠️  ADVERTENCIAS:${colors.reset}`);
            this.warnings.forEach((warning, index) => {
                console.log(`   ${index + 1}. ${warning}`);
            });
        }

        console.log(`\n${colors.cyan}📋 RECOMENDACIONES:${colors.reset}`);
        
        if (this.errores.length > 0) {
            console.log('1. Resolver errores críticos antes de continuar');
            console.log('2. Crear archivos faltantes usando los artefactos generados');
            console.log('3. Instalar dependencias faltantes: npm install');
            console.log('4. Verificar configuración de base de datos');
        } else {
            console.log('✅ Sistema en buen estado base');
            console.log('1. Resolver advertencias para optimizar funcionamiento');
            console.log('2. Probar endpoints manualmente');
        }

        console.log('\n🚀 PRÓXIMOS PASOS:');
        console.log('   • node scripts/implementar-sistema-completo.js (implementar artefactos)');
        console.log('   • npm start (iniciar servidor)');
        console.log('   • curl http://localhost:3001/api/health (probar conexión)');

        if (this.connection) {
            await this.connection.end();
        }
    }
}

// Ejecutar diagnóstico
if (require.main === module) {
    const diagnostico = new DiagnosticoSistema();
    diagnostico.ejecutarDiagnostico()
        .then(() => {
            console.log('\n🎯 Diagnóstico completado');
            process.exit(0);
        })
        .catch(error => {
            console.error('Error en diagnóstico:', error);
            process.exit(1);
        });
}

module.exports = DiagnosticoSistema;