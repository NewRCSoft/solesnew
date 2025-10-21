// =============================================
// server.js - Servidor Completo con Sistema de Rutas Modular
// =============================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

// =============================================
// VERIFICACIÓN DEL SISTEMA DE RUTAS
// =============================================
function verificarSistemaRutas() {
    console.log('\n🔍 Verificando sistema de rutas...');
    
    const archivosRequeridos = [
        './routes/index.js',
        './routes/mercaderias.js',
        './controllers/MercaderiasController.js',
        './routes/clientes.js',
        './controllers/ClientesController.js',
        './routes/vendedores.js',
        './controllers/VendedoresController.js',
        './routes/zonas.js',
        './controllers/ZonasController.js',
        './routes/depositos.js',
        './controllers/DepositosController.js',
        './routes/stock.js',
        './controllers/StockController.js',
        './routes/transferencias.js',
        './controllers/TransferenciasController.js',
        './routes/movimientos.js',
        './controllers/MovimientosController.js',
        './routes/etiquetas.js',
        './controllers/EtiquetasController.js',
        './routes/proveedores.js',
        './controllers/ProveedoresController.js',

    ];
    
    let todoOK = true;
    
    archivosRequeridos.forEach(archivo => {
        try {
            if (fs.existsSync(path.join(__dirname, archivo))) {
                console.log(`✅ ${archivo} - OK`);
            } else {
                console.log(`❌ ${archivo} - NO ENCONTRADO`);
                todoOK = false;
            }
        } catch (error) {
            console.log(`⚠️  ${archivo} - ERROR: ${error.message}`);
            todoOK = false;
        }
    });
    
    if (todoOK) {
        console.log('✅ Sistema de rutas verificado correctamente\n');
    } else {
        console.log('⚠️  Algunos archivos del sistema de rutas no están disponibles\n');
    }
    
    return todoOK;
}

// =============================================
// MIDDLEWARE BÁSICO
// =============================================

// CORS configurado para desarrollo
app.use(cors({
    origin: ['http://localhost', 'http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:5500', 'http://localhost:5173'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Middleware básico
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging de requests
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} - ${req.method} ${req.path}`);
    next();
});

// =============================================
// RUTAS DEL FRONTEND
// =============================================

// Ruta principal - Sistema completo
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// =============================================
// RUTAS DE LA API - INFORMACIÓN BÁSICA
// =============================================

// Ruta de salud del sistema
app.get('/api/health', (req, res) => {
    res.json({ 
        success: true,
        status: 'OK', 
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        message: 'Sistema de Stock funcionando correctamente',
        environment: process.env.NODE_ENV || 'development',
        version: '1.0.0'
    });
});

// Información general de la API
app.get('/api', (req, res) => {
    res.json({
        success: true,
        message: 'API Sistema de Stock v1',
        version: '1.0.0',
        documentation: '/api/v1',
        health_check: '/api/health',
        available_endpoints: [
            '/api/health',
            '/api/v1/mercaderias',
            '/api/v1/depositos',
            '/api/v1/stock',
            '/api/v1/transferencias',
            '/api/v1/movimientos',
            '/api/v1/clientes',
            '/api/v1/vendedores',
            '/api/v1/proveedores',
            '/api/v1/etiquetas',
            '/api/v1/reportes',
            '/api/v1/categorias'
        ]
    });
});

// Información de la API v1
app.get('/api/v1', (req, res) => {
    res.json({
        success: true,
        message: 'API v1 Sistema de Stock',
        status: 'Funcionando',
        timestamp: new Date().toISOString(),
        modules: {
            mercaderias: 'Activo - CRUD completo con Code 128',
            depositos: 'Activo - Gestión multi-depósito', 
            stock: 'Activo - Control consolidado',
            transferencias: 'Activo - Órdenes y entregas',
            movimientos: 'Activo - Historial completo',
            clientes: 'Activo - Gestión con depósitos',
            vendedores: 'Activo - Seguimiento de performance',
            etiquetas: 'Activo - Generación Code 128',
            reportes: 'Activo - Dashboard y análisis',
            categorias: 'Activo - Clasificación de productos'
        },
        features: [
            'Códigos Code 128',
            'Carga de imágenes',
            'Filtros avanzados',
            'Etiquetas en PDF',
            'Stock multi-depósito',
            'Transferencias parciales',
            'Dashboard en tiempo real'
        ]
    });
});

// =============================================
// SISTEMA DE RUTAS MODULAR
// =============================================

// Verificar sistema antes de cargar rutas
const sistemaRutasOK = verificarSistemaRutas();

if (sistemaRutasOK) {
    // Cargar sistema de rutas modular
    try {
        const routes = require('./routes');
        app.use('/api/v1', routes);
        console.log('✅ Sistema de rutas modular cargado exitosamente');
    } catch (error) {
        console.error('❌ Error cargando sistema de rutas:', error.message);
        
        // Ruta de fallback si el sistema de rutas falla
        app.use('/api/v1/*', (req, res) => {
            res.status(503).json({
                success: false,
                message: 'Sistema de rutas no disponible',
                error: 'Las rutas no se pudieron cargar correctamente',
                suggestion: 'Verifica que existan los archivos routes/index.js y los controladores'
            });
        });
    }
} else {
    // Rutas básicas de fallback si no existe el sistema completo
    console.log('⚠️  Cargando rutas básicas de fallback...');
    
    // Mercaderías básicas
    app.get('/api/v1/mercaderias', (req, res) => {
        res.json({
            success: true,
            data: [
                {
                    id: 1,
                    codigo_sku: 'DEMO-001',
                    descripcion: 'Producto Demo 1',
                    codigo_code128: 'STKDEMO001',
                    precio_venta: 100,
                    stock_total: 50,
                    stock_minimo: 10,
                    categoria: 'Demo',
                    activo: 1,
                    imagen: null
                }
            ],
            message: 'Datos de demostración - Sistema de rutas no disponible'
        });
    });
    
    app.post('/api/v1/mercaderias', (req, res) => {
        res.json({
            success: true,
            message: 'Mercadería creada (modo demo)',
            data: { id: Date.now(), ...req.body }
        });
    });
    
    // Fallback para todas las demás rutas de API
    app.use('/api/v1/*', (req, res) => {
        res.status(503).json({
            success: false,
            message: 'Endpoint no disponible',
            error: 'Sistema de rutas no configurado',
            path: req.originalUrl,
            suggestion: 'Configura el sistema de rutas completo para acceder a todas las funcionalidades'
        });
    });
}

// =============================================
// MANEJO DE ERRORES 404
// =============================================

app.use('*', (req, res) => {
    if (req.originalUrl.startsWith('/api/')) {
        res.status(404).json({
            success: false,
            message: 'Endpoint no encontrado',
            path: req.originalUrl,
            timestamp: new Date().toISOString(),
            suggestion: 'Verifica la documentación de la API en /api'
        });
    } else {
        // Redirigir todas las rutas no API al frontend (SPA)
        res.sendFile(path.join(__dirname, 'index.html'));
    }
});

// =============================================
// MANEJO DE ERRORES GLOBALES
// =============================================

app.use((error, req, res, next) => {
    console.error('❌ Error interno del servidor:', error);
    
    // Log detallado para desarrollo
    if (process.env.NODE_ENV === 'development') {
        console.error('Stack trace:', error.stack);
    }
    
    res.status(500).json({
        success: false,
        message: 'Error interno del servidor',
        timestamp: new Date().toISOString(),
        error: process.env.NODE_ENV === 'development' ? error.message : 'Error interno',
        path: req.originalUrl
    });
});

// =============================================
// INICIALIZACIÓN DEL SERVIDOR
// =============================================

// Función para mostrar información de inicio
function mostrarInformacionInicio() {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 SISTEMA DE CONTROL DE STOCK');
    console.log('='.repeat(60));
    console.log(`📅 Iniciado: ${new Date().toLocaleString()}`);
    console.log(`🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 Servidor: http://localhost:${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
    console.log(`🔗 API: http://localhost:${PORT}/api/v1`);
    console.log(`❤️  Estado: http://localhost:${PORT}/api/health`);
    
    console.log('\n📋 Endpoints principales:');
    console.log('   GET  /api/v1/mercaderias      - Listar mercaderías');
    console.log('   POST /api/v1/mercaderias      - Crear mercadería');
    console.log('   PUT  /api/v1/mercaderias/:id  - Actualizar mercadería');
    console.log('   POST /api/v1/mercaderias/:id/duplicate - Duplicar');
    console.log('   PUT  /api/v1/mercaderias/:id/toggle-active - Activar/Desactivar');
    console.log('   GET  /api/v1/depositos        - Listar depósitos');
    console.log('   GET  /api/v1/stock            - Control de stock');
    console.log('   GET  /api/v1/clientes         - Listar clientes');
    console.log('   GET  /api/v1/vendedores       - Listar vendedores');
    console.log('   GET  /api/v1/reportes/dashboard - Dashboard principal');
    console.log('   GET  /api/v1/etiquetas/codigo-barras/:codigo - Código de barras');
    
    console.log('\n🔧 Funcionalidades activas:');
    console.log('   ✅ CRUD de Mercaderías con Code 128');
    console.log('   ✅ Carga de imágenes de productos');
    console.log('   ✅ Generación de etiquetas en PDF');
    console.log('   ✅ Control de stock multi-depósito');
    console.log('   ✅ Sistema de transferencias');
    console.log('   ✅ Dashboard con métricas en tiempo real');
    console.log('   ✅ Filtros avanzados y búsquedas');
    
    console.log('\n' + '='.repeat(60));
}

// Iniciar el servidor
const server = app.listen(PORT, () => {
    mostrarInformacionInicio();
});

// Manejo graceful de cierre del servidor
process.on('SIGTERM', () => {
    console.log('\n⚠️  Recibida señal SIGTERM, cerrando servidor...');
    server.close(() => {
        console.log('✅ Servidor cerrado correctamente');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('\n⚠️  Recibida señal SIGINT (Ctrl+C), cerrando servidor...');
    server.close(() => {
        console.log('✅ Servidor cerrado correctamente');
        process.exit(0);
    });
});

module.exports = app;