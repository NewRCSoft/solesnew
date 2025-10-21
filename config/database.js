// =============================================
// config/database.js - Configuración MySQL2 Corregida
// =============================================
const mysql = require('mysql2/promise');

// Configuración corregida para MySQL2
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'sistema_stock',
    port: process.env.DB_PORT || 3306,
    charset: 'utf8mb4',
    timezone: '+00:00',
    
    // ✅ Configuraciones CORRECTAS para MySQL2
    connectionLimit: 20,
    idleTimeout: 900000,        // Reemplaza 'timeout'
    acquireTimeout: 60000,      // Solo en createPool, no en conexión individual
    waitForConnections: true,   // Reemplaza 'reconnect'
    queueLimit: 0,
    multipleStatements: false,  // Por seguridad
    
    // Configuraciones adicionales
    ssl: false,
    dateStrings: false,
    supportBigNumbers: true,
    bigNumberStrings: false
};

// Pool de conexiones
const pool = mysql.createPool(dbConfig);

// Función para ejecutar consultas
const query = async (sql, params = []) => {
    try {
        const [rows] = await pool.execute(sql, params);
        return rows;
    } catch (error) {
        console.error('Error ejecutando query:', { sql, params, error: error.message });
        throw error;
    }
};

// Función para obtener conexión manual
const getConnection = async () => {
    try {
        return await pool.getConnection();
    } catch (error) {
        console.error('Error al obtener conexión:', error);
        throw error;
    }
};

// Función para transacciones
const transaction = async (callback) => {
    const connection = await getConnection();
    try {
        await connection.beginTransaction();
        const result = await callback(connection);
        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

// Función para verificar conexión
const testConnection = async () => {
    try {
        const connection = await getConnection();
        await connection.ping();
        connection.release();
        console.log('✅ Conexión a MySQL exitosa');
        return true;
    } catch (error) {
        console.error('❌ Error de conexión a MySQL:', error.message);
        throw error;
    }
};

// Función para obtener información de la DB
const getDatabaseInfo = async () => {
    try {
        const [serverInfo] = await query('SELECT VERSION() as version');
        const [dbName] = await query('SELECT DATABASE() as database_name');
        const [tableCount] = await query(`
            SELECT COUNT(*) as table_count 
            FROM information_schema.tables 
            WHERE table_schema = DATABASE()
        `);
        
        return {
            mysql_version: serverInfo[0].version,
            database_name: dbName[0].database_name,
            table_count: tableCount[0].table_count,
            host: dbConfig.host,
            port: dbConfig.port
        };
    } catch (error) {
        console.error('Error obteniendo información de DB:', error);
        return null;
    }
};

// Función para cerrar pool
const closePool = async () => {
    try {
        console.log('Cerrando pool de conexiones...');
        await pool.end();
        console.log('✅ Pool de conexiones cerrado');
    } catch (error) {
        console.error('Error cerrando pool:', error);
    }
};

// Manejo de cierre graceful
process.on('SIGINT', async () => {
    console.log('\n⚠️  Recibida señal SIGINT, cerrando conexiones...');
    await closePool();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n⚠️  Recibida señal SIGTERM, cerrando conexiones...');
    await closePool();
    process.exit(0);
});

// Exportar funciones
module.exports = {
    pool,
    query,
    getConnection,
    transaction,
    testConnection,
    getDatabaseInfo,
    closePool
};