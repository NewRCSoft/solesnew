// =============================================
// scripts/migrate.js - Script de Migración
// =============================================
const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

async function migrate() {
    console.log('🔄 Iniciando migración de base de datos...');

    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 3306,
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'sistema_stock'
        });

        console.log('✅ Conectado a la base de datos');

        // Ejecutar migraciones
        const migrationsDir = path.join(__dirname, 'migrations');
        
        try {
            const migrationFiles = await fs.readdir(migrationsDir);
            const sqlFiles = migrationFiles.filter(file => file.endsWith('.sql')).sort();

            for (const file of sqlFiles) {
                console.log(`📄 Ejecutando migración: ${file}`);
                const sqlContent = await fs.readFile(path.join(migrationsDir, file), 'utf8');
                
                const statements = sqlContent.split(';').filter(stmt => stmt.trim());
                
                for (const statement of statements) {
                    if (statement.trim()) {
                        try {
                            await connection.execute(statement);
                        } catch (error) {
                            console.warn(`⚠️ Warning en ${file}:`, error.message);
                        }
                    }
                }
                console.log(`✅ Migración ${file} completada`);
            }
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('📁 No se encontró directorio de migraciones, creando estructura base...');
                
                // Ejecutar script base
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
            } else {
                throw error;
            }
        }

        await connection.end();
        console.log('🎉 Migración completada exitosamente');

    } catch (error) {
        console.error('❌ Error en la migración:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    migrate();
}

module.exports = { migrate };