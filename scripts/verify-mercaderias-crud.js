// =============================================
// scripts/verify-mercaderias-crud.js - Verificación Completa del CRUD
// =============================================
require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');

// Colores para console
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
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

class CRUDVerifier {
    constructor() {
        this.connection = null;
        this.testMercaderiaId = null;
        this.testResults = {
            database: [],
            models: [],
            controllers: [],
            routes: [],
            frontend: []
        };
    }

    async connect() {
        try {
            this.connection = await mysql.createConnection({
                host: process.env.DB_HOST || 'localhost',
                port: process.env.DB_PORT || 3306,
                user: process.env.DB_USER || 'root',
                password: process.env.DB_PASSWORD || '',
                database: process.env.DB_NAME || 'sistema_stock'
            });
            printStatus('Conectado a la base de datos');
        } catch (error) {
            printError('Error conectando a la base de datos: ' + error.message);
            throw error;
        }
    }

    async disconnect() {
        if (this.connection) {
            await this.connection.end();
            printStatus('Desconectado de la base de datos');
        }
    }

    addResult(category, test, passed, message = '') {
        this.testResults[category].push({
            test,
            passed,
            message
        });
        
        if (passed) {
            printStatus(`${test}: PASÓ`);
        } else {
            printError(`${test}: FALLÓ - ${message}`);
        }
    }

    // ========================================
    // VERIFICACIONES DE BASE DE DATOS
    // ========================================
    
    async verifyDatabaseSchema() {
        printHeader('VERIFICACIÓN DE ESQUEMA DE BASE DE DATOS');
        
        try {
            // Verificar que la tabla mercaderias existe
            const [tables] = await this.connection.execute(`
                SELECT TABLE_NAME 
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'mercaderias'
            `, [process.env.DB_NAME]);

            this.addResult('database', 'Tabla mercaderias existe', tables.length > 0);

            // Verificar columnas requeridas
            const [columns] = await this.connection.execute(`
                SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'mercaderias'
            `, [process.env.DB_NAME]);

            const requiredColumns = [
                { name: 'id', type: 'int', nullable: 'NO', key: 'PRI' },
                { name: 'descripcion', type: 'varchar', nullable: 'NO' },
                { name: 'codigo_sku', type: 'varchar', nullable: 'NO', key: 'UNI' },
                { name: 'codigo_code128', type: 'varchar', nullable: 'YES', key: 'UNI' },
                { name: 'precio_costo', type: 'decimal', nullable: 'NO' },
                { name: 'precio_venta', type: 'decimal', nullable: 'NO' },
                { name: 'stock_minimo', type: 'decimal', nullable: 'NO' },
                { name: 'imagen', type: 'longtext', nullable: 'YES' },
                { name: 'activo', type: 'tinyint', nullable: 'YES' }
            ];

            requiredColumns.forEach(reqCol => {
                const found = columns.find(col => col.COLUMN_NAME === reqCol.name);
                const exists = !!found;
                const typeMatch = exists && found.DATA_TYPE.includes(reqCol.type);
                
                this.addResult('database', 
                    `Columna ${reqCol.name}`, 
                    exists && typeMatch,
                    exists ? (typeMatch ? '' : `Tipo incorrecto: ${found.DATA_TYPE}`) : 'No existe'
                );
            });

            // Verificar índices
            const [indexes] = await this.connection.execute(`
                SELECT INDEX_NAME, COLUMN_NAME
                FROM INFORMATION_SCHEMA.STATISTICS 
                WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'mercaderias'
            `, [process.env.DB_NAME]);

            const requiredIndexes = ['idx_codigo_sku', 'idx_codigo_code128'];
            requiredIndexes.forEach(indexName => {
                const exists = indexes.some(idx => idx.INDEX_NAME === indexName);
                this.addResult('database', `Índice ${indexName}`, exists);
            });

        } catch (error) {
            this.addResult('database', 'Verificación de esquema', false, error.message);
        }
    }

    async verifyDatabaseOperations() {
        printHeader('VERIFICACIÓN DE OPERACIONES DE BASE DE DATOS');
        
        try {
            // Test INSERT
            const testData = {
                descripcion: 'Producto de Prueba CRUD',
                codigo_sku: 'TEST-CRUD-' + Date.now(),
                codigo_code128: 'STKTEST' + Date.now().toString().slice(-5),
                precio_costo: 100.50,
                precio_venta: 150.75,
                stock_minimo: 5,
                unidad_medida: 'Unidad',
                activo: 1
            };

            const [insertResult] = await this.connection.execute(`
                INSERT INTO mercaderias (descripcion, codigo_sku, codigo_code128, precio_costo, precio_venta, stock_minimo, unidad_medida, activo)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, Object.values(testData));

            this.testMercaderiaId = insertResult.insertId;
            this.addResult('database', 'INSERT mercadería', insertResult.insertId > 0);

            // Test SELECT
            const [selectResult] = await this.connection.execute(`
                SELECT * FROM mercaderias WHERE id = ?
            `, [this.testMercaderiaId]);

            this.addResult('database', 'SELECT mercadería', selectResult.length === 1);

            // Test UPDATE
            const [updateResult] = await this.connection.execute(`
                UPDATE mercaderias SET descripcion = ? WHERE id = ?
            `, ['Producto de Prueba CRUD ACTUALIZADO', this.testMercaderiaId]);

            this.addResult('database', 'UPDATE mercadería', updateResult.affectedRows === 1);

            // Test búsqueda por SKU
            const [skuResult] = await this.connection.execute(`
                SELECT * FROM mercaderias WHERE codigo_sku = ?
            `, [testData.codigo_sku]);

            this.addResult('database', 'Búsqueda por SKU', skuResult.length === 1);

            // Test búsqueda por Code 128
            const [code128Result] = await this.connection.execute(`
                SELECT * FROM mercaderias WHERE codigo_code128 = ?
            `, [testData.codigo_code128]);

            this.addResult('database', 'Búsqueda por Code 128', code128Result.length === 1);

        } catch (error) {
            this.addResult('database', 'Operaciones CRUD', false, error.message);
        }
    }

    // ========================================
    // VERIFICACIONES DE ARCHIVOS
    // ========================================
    
    async verifyModelFiles() {
        printHeader('VERIFICACIÓN DE ARCHIVOS DE MODELO');
        
        const files = [
            { path: '../models/BaseModel.js', name: 'BaseModel' },
            { path: '../models/Mercaderia.js', name: 'Modelo Mercaderia' }
        ];

        for (const file of files) {
            try {
                const filePath = path.join(__dirname, file.path);
                await fs.access(filePath);
                
                const content = await fs.readFile(filePath, 'utf8');
                
                // Verificar métodos clave en BaseModel
                if (file.name === 'BaseModel') {
                    const methods = ['findAll', 'findById', 'create', 'update', 'delete'];
                    methods.forEach(method => {
                        const hasMethod = content.includes(`async ${method}(`);
                        this.addResult('models', `BaseModel.${method}`, hasMethod);
                    });
                }
                
                // Verificar métodos clave en Mercaderia
                if (file.name === 'Modelo Mercaderia') {
                    const methods = ['findByCode128', 'generateCode128', 'findWithStock'];
                    methods.forEach(method => {
                        const hasMethod = content.includes(method);
                        this.addResult('models', `Mercaderia.${method}`, hasMethod);
                    });
                    
                    // Verificar que no hay referencias a EAN-13
                    const hasEan13 = content.includes('ean13') || content.includes('EAN13');
                    this.addResult('models', 'Sin referencias EAN-13', !hasEan13);
                    
                    // Verificar referencias a Code 128
                    const hasCode128 = content.includes('code128') || content.includes('CODE128');
                    this.addResult('models', 'Con referencias Code 128', hasCode128);
                }
                
                this.addResult('models', `Archivo ${file.name}`, true);
                
            } catch (error) {
                this.addResult('models', `Archivo ${file.name}`, false, error.message);
            }
        }
    }

    async verifyControllerFiles() {
        printHeader('VERIFICACIÓN DE ARCHIVOS DE CONTROLADOR');
        
        const files = [
            { path: '../controllers/MercaderiasController.js', name: 'MercaderiasController' },
            { path: '../controllers/EtiquetasController.js', name: 'EtiquetasController' }
        ];

        for (const file of files) {
            try {
                const filePath = path.join(__dirname, file.path);
                await fs.access(filePath);
                
                const content = await fs.readFile(filePath, 'utf8');
                
                if (file.name === 'MercaderiasController') {
                    const methods = ['index', 'show', 'create', 'update', 'destroy', 'getByCode128', 'uploadImage'];
                    methods.forEach(method => {
                        const hasMethod = content.includes(`async ${method}(`);
                        this.addResult('controllers', `MercaderiasController.${method}`, hasMethod);
                    });
                }
                
                if (file.name === 'EtiquetasController') {
                    const hasCode128 = content.includes('CODE128') || content.includes('Code 128');
                    this.addResult('controllers', 'EtiquetasController con Code 128', hasCode128);
                }
                
                this.addResult('controllers', `Archivo ${file.name}`, true);
                
            } catch (error) {
                this.addResult('controllers', `Archivo ${file.name}`, false, error.message);
            }
        }
    }

    async verifyRouteFiles() {
        printHeader('VERIFICACIÓN DE ARCHIVOS DE RUTAS');
        
        try {
            const filePath = path.join(__dirname, '../routes/mercaderias.js');
            await fs.access(filePath);
            
            const content = await fs.readFile(filePath, 'utf8');
            
            const routes = [
                'router.get(\'/\', MercaderiasController.index)',
                'router.post(\'/\', MercaderiasController.create)',
                'router.get(\'/:id\', MercaderiasController.show)',
                'router.put(\'/:id\', MercaderiasController.update)',
                'router.get(\'/code128/:code128\', MercaderiasController.getByCode128)',
                'router.post(\'/:id/imagen\', MercaderiasController.uploadImage)'
            ];
            
            routes.forEach(route => {
                const hasRoute = content.includes(route.split('(')[0]);
                this.addResult('routes', `Ruta ${route.split('.')[2]}`, hasRoute);
            });
            
            this.addResult('routes', 'Archivo de rutas', true);
            
        } catch (error) {
            this.addResult('routes', 'Archivo de rutas', false, error.message);
        }
    }

    async verifyFrontendFiles() {
        printHeader('VERIFICACIÓN DE ARCHIVOS FRONTEND');
        
        try {
            const filePath = path.join(__dirname, '../index.html');
            await fs.access(filePath);
            
            const content = await fs.readFile(filePath, 'utf8');
            
            const features = [
                'generarCode128',
                'previewImage',
                'uploadImage',
                'codigo_code128',
                'image-preview'
            ];
            
            features.forEach(feature => {
                const hasFeature = content.includes(feature);
                this.addResult('frontend', `Función/Elemento ${feature}`, hasFeature);
            });
            
            // Verificar que no hay referencias a EAN-13
            const hasEan13 = content.includes('ean13') || content.includes('EAN13');
            this.addResult('frontend', 'Sin referencias EAN-13', !hasEan13);
            
            this.addResult('frontend', 'Archivo HTML principal', true);
            
        } catch (error) {
            this.addResult('frontend', 'Archivo HTML principal', false, error.message);
        }
    }

    // ========================================
    // LIMPIEZA Y RESUMEN
    // ========================================
    
    async cleanup() {
        if (this.testMercaderiaId) {
            try {
                await this.connection.execute(`
                    DELETE FROM mercaderias WHERE id = ?
                `, [this.testMercaderiaId]);
                printStatus('Datos de prueba eliminados');
            } catch (error) {
                printWarning('No se pudieron eliminar los datos de prueba: ' + error.message);
            }
        }
    }

    printSummary() {
        printHeader('RESUMEN DE VERIFICACIÓN');
        
        let totalTests = 0;
        let passedTests = 0;
        
        Object.keys(this.testResults).forEach(category => {
            const categoryTests = this.testResults[category];
            const categoryPassed = categoryTests.filter(test => test.passed).length;
            const categoryTotal = categoryTests.length;
            
            totalTests += categoryTotal;
            passedTests += categoryPassed;
            
            console.log(`\n${colors.bright}${category.toUpperCase()}:${colors.reset} ${categoryPassed}/${categoryTotal} pruebas pasaron`);
            
            categoryTests.forEach(test => {
                const status = test.passed ? colors.green + '✅' : colors.red + '❌';
                const message = test.message ? ` (${test.message})` : '';
                console.log(`  ${status} ${test.test}${message}${colors.reset}`);
            });
        });
        
        console.log(`\n${colors.bright}TOTAL: ${passedTests}/${totalTests} pruebas pasaron${colors.reset}`);
        
        if (passedTests === totalTests) {
            printStatus('¡Todas las verificaciones pasaron! El CRUD está funcionando correctamente.');
        } else {
            printWarning(`${totalTests - passedTests} verificaciones fallaron. Revisa los errores arriba.`);
        }
        
        // Mostrar recomendaciones
        if (passedTests < totalTests) {
            console.log(`\n${colors.bright}RECOMENDACIONES:${colors.reset}`);
            console.log('1. Ejecuta el script de actualización: node scripts/update-ean13-to-code128.js');
            console.log('2. Actualiza los archivos de aplicación con las nuevas versiones');
            console.log('3. Reinicia la aplicación: npm restart');
            console.log('4. Ejecuta este script nuevamente para verificar');
        }
    }
}

async function main() {
    const verifier = new CRUDVerifier();
    
    try {
        printHeader('VERIFICACIÓN COMPLETA DEL CRUD DE MERCADERÍAS');
        
        // Conectar a base de datos
        await verifier.connect();
        
        // Ejecutar todas las verificaciones
        await verifier.verifyDatabaseSchema();
        await verifier.verifyDatabaseOperations();
        await verifier.verifyModelFiles();
        await verifier.verifyControllerFiles();
        await verifier.verifyRouteFiles();
        await verifier.verifyFrontendFiles();
        
        // Limpiar datos de prueba
        await verifier.cleanup();
        
        // Mostrar resumen
        verifier.printSummary();
        
    } catch (error) {
        printError('Error durante la verificación: ' + error.message);
        console.error(error);
        process.exit(1);
    } finally {
        await verifier.disconnect();
    }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { CRUDVerifier };