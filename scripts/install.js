// =============================================
// scripts/install.js - Script de Instalación
// =============================================
const readline = require('readline');
const fs = require('fs').promises;
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
    console.log('🚀 Instalador del Sistema de Control de Stock\n');

    try {
        // Configuración de base de datos
        console.log('📊 Configuración de Base de Datos');
        const dbHost = await question('Host de la base de datos (localhost): ') || 'localhost';
        const dbPort = await question('Puerto de la base de datos (3306): ') || '3306';
        const dbUser = await question('Usuario de la base de datos (root): ') || 'root';
        const dbPassword = await question('Contraseña de la base de datos: ');
        const dbName = await question('Nombre de la base de datos (sistema_stock): ') || 'sistema_stock';

        // Configuración del servidor
        console.log('\n⚙️ Configuración del Servidor');
        const serverPort = await question('Puerto del servidor (3001): ') || '3001';
        const jwtSecret = await question('JWT Secret (generará uno aleatorio si está vacío): ') || generateRandomString(64);

        // Configuración del usuario administrador
        console.log('\n👤 Usuario Administrador');
        const adminName = await question('Nombre del administrador: ');
        const adminEmail = await question('Email del administrador: ');
        const adminPassword = await question('Contraseña del administrador: ');

        console.log('\n🔧 Instalando sistema...');

        // 1. Crear archivo .env
        const envContent = `
NODE_ENV=production
PORT=${serverPort}

# Base de datos
DB_HOST=${dbHost}
DB_USER=${dbUser}
DB_PASSWORD=${dbPassword}
DB_NAME=${dbName}
DB_PORT=${dbPort}

# JWT
JWT_SECRET=${jwtSecret}
JWT_EXPIRES_IN=24h

# Logging
LOG_LEVEL=info

# Upload
MAX_FILE_SIZE=10485760
UPLOAD_PATH=./uploads

# Etiquetas
LABEL_WIDTH=100
LABEL_HEIGHT=50
`.trim();

        await fs.writeFile('.env', envContent);
        console.log('✅ Archivo .env creado');

        // 2. Crear directorio de logs
        await fs.mkdir('logs', { recursive: true });
        console.log('✅ Directorio de logs creado');

        // 3. Crear directorio de uploads
        await fs.mkdir('uploads', { recursive: true });
        console.log('✅ Directorio de uploads creado');

        // 4. Conectar a base de datos y crear esquema
        const connection = await mysql.createConnection({
            host: dbHost,
            port: dbPort,
            user: dbUser,
            password: dbPassword
        });

        // Crear base de datos si no existe
        await connection.execute(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        await connection.execute(`USE \`${dbName}\``);
        console.log('✅ Base de datos creada/conectada');

        // 5. Ejecutar script SQL
        const sqlScript = await fs.readFile(path.join(__dirname, '../database_schema.sql'), 'utf8');
        const statements = sqlScript.split(';').filter(stmt => stmt.trim());

        for (const statement of statements) {
            if (statement.trim()) {
                try {
                    await connection.execute(statement);
                } catch (error) {
                    if (!error.message.includes('already exists')) {
                        console.warn('Warning en SQL:', error.message);
                    }
                }
            }
        }
        console.log('✅ Esquema de base de datos creado');

        // 6. Crear usuario administrador
        const passwordHash = await bcrypt.hash(adminPassword, 12);
        await connection.execute(`
            INSERT INTO usuarios (nombre, email, password_hash, rol, activo)
            VALUES (?, ?, ?, 'ADMIN', 1)
            ON DUPLICATE KEY UPDATE 
            nombre = VALUES(nombre),
            password_hash = VALUES(password_hash)
        `, [adminName, adminEmail, passwordHash]);
        console.log('✅ Usuario administrador creado');

        // 7. Insertar datos de ejemplo
        await insertSampleData(connection);
        console.log('✅ Datos de ejemplo insertados');

        await connection.end();

        console.log('\n🎉 ¡Instalación completada exitosamente!');
        console.log('\n📋 Información importante:');
        console.log(`   - Servidor: http://localhost:${serverPort}`);
        console.log(`   - API: http://localhost:${serverPort}/api/v1`);
        console.log(`   - Admin: ${adminEmail}`);
        console.log(`   - Base de datos: ${dbName}`);
        console.log('\n🚀 Para iniciar el sistema:');
        console.log('   npm install');
        console.log('   npm start');

    } catch (error) {
        console.error('❌ Error durante la instalación:', error.message);
        process.exit(1);
    } finally {
        rl.close();
    }
}

async function insertSampleData(connection) {
    // Categorías de ejemplo
    const categorias = [
        'Electrónicos',
        'Ropa y Accesorios',
        'Hogar y Jardín',
        'Deportes',
        'Libros',
        'Alimentación'
    ];

    for (const categoria of categorias) {
        await connection.execute(
            'INSERT IGNORE INTO categorias (descripcion) VALUES (?)',
            [categoria]
        );
    }

    // Zonas de ejemplo
    const zonas = [
        'Zona Norte',
        'Zona Sur',
        'Zona Este',
        'Zona Oeste',
        'Centro'
    ];

    for (const zona of zonas) {
        await connection.execute(
            'INSERT IGNORE INTO zonas (zona) VALUES (?)',
            [zona]
        );
    }

    // Proveedores de ejemplo
    const proveedores = [
        { razonSocial: 'Proveedor Ejemplo S.A.', cuit: '30123456789', telefono: '11-1234-5678', email: 'contacto@proveedor1.com' },
        { razonSocial: 'Distribuidora Central', cuit: '30987654321', telefono: '11-8765-4321', email: 'ventas@distribuidora.com' }
    ];

    for (const proveedor of proveedores) {
        await connection.execute(
            'INSERT IGNORE INTO proveedores (razonSocial, cuit, telefono, email) VALUES (?, ?, ?, ?)',
            [proveedor.razonSocial, proveedor.cuit, proveedor.telefono, proveedor.email]
        );
    }
}

function generateRandomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

if (require.main === module) {
    main();
}

module.exports = { main };