
// =============================================
// routes/index.js - Sistema de Rutas Modular
// =============================================
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

console.log('🔄 Inicializando sistema de rutas modular...');

// =============================================
// CARGAR RUTAS DINÁMICAMENTE
// =============================================

const rutasDisponibles = {
    // Rutas principales del sistema
    mercaderias: { archivo: './mercaderias', descripcion: 'Gestión de productos' },
    depositos: { archivo: './depositos', descripcion: 'Control de depósitos' },
    stock: { archivo: './stock', descripcion: 'Control de inventario' },
    transferencias: { archivo: './transferencias', descripcion: 'Órdenes de transferencia' },
    movimientos: { archivo: './movimientos', descripcion: 'Historial de movimientos' },
    clientes: { archivo: './clientes', descripcion: 'Gestión de clientes' },
    vendedores: { archivo: './vendedores', descripcion: 'Gestión de vendedores' },
    proveedores: { archivo: './proveedores', descripcion: 'Gestión de proveedores' }, // ← NUEVA RUTA
    zonas: { archivo: './zonas', descripcion: 'Gestión de zonas' },
    etiquetas: { archivo: './etiquetas', descripcion: 'Generación de etiquetas' },
    categorias: { archivo: './categorias', descripcion: 'Categorías de productos' },
    reportes: { archivo: './reportes', descripcion: 'Reportes y dashboard' },
    compras: { archivo: './compras', descripcion: 'Gestión de compras' } // ← AGREGAR SI NO EXISTE
};

// Cargar cada ruta disponible
Object.entries(rutasDisponibles).forEach(([nombre, config]) => {
    try {
        const rutaArchivo = path.join(__dirname, config.archivo);
        
        // Verificar si el archivo existe
        if (fs.existsSync(rutaArchivo + '.js')) {
            const rutas = require(config.archivo);
            router.use(`/${nombre}`, rutas);
            console.log(`✅ /${nombre} - ${config.descripcion}`);
        } else {
            console.log(`⚠️  /${nombre} - Archivo no encontrado (${config.archivo}.js)`);
            
            // Crear ruta básica de fallback
            router.use(`/${nombre}`, (req, res) => {
                res.status(501).json({
                    success: false,
                    message: `Módulo ${nombre} no implementado`,
                    descripcion: config.descripcion,
                    suggestion: `Crear archivo ${config.archivo}.js para implementar esta funcionalidad`
                });
            });
        }
    } catch (error) {
        console.log(`❌ Error cargando /${nombre}: ${error.message}`);
        
        // Ruta de error para el módulo problemático
        router.use(`/${nombre}`, (req, res) => {
            res.status(500).json({
                success: false,
                message: `Error en módulo ${nombre}`,
                error: error.message,
                suggestion: `Verificar el archivo ${config.archivo}.js`
            });
        });
    }
});

// =============================================
// RUTAS ESPECIALES Y TEMPORALES
// =============================================

// Ruta raíz de la API v1
router.get('/', (req, res) => {
    const rutasCargadas = Object.keys(rutasDisponibles).map(nombre => {
        const rutaArchivo = path.join(__dirname, rutasDisponibles[nombre].archivo + '.js');
        return {
            endpoint: `/api/v1/${nombre}`,
            descripcion: rutasDisponibles[nombre].descripcion,
            estado: fs.existsSync(rutaArchivo) ? 'Disponible' : 'No implementado'
        };
    });

    res.json({
        success: true,
        message: 'Sistema de Stock - API v1',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        rutas_disponibles: rutasCargadas,
        estadisticas: {
            total_rutas: rutasCargadas.length,
            rutas_activas: rutasCargadas.filter(r => r.estado === 'Disponible').length,
            rutas_pendientes: rutasCargadas.filter(r => r.estado === 'No implementado').length
        }
    });
});

// =============================================
// RUTAS DE REPORTES Y DASHBOARD (si no existe archivo separado)
// =============================================

// Dashboard principal (temporal hasta implementar archivo de reportes)
router.get('/reportes/dashboard', (req, res) => {
    res.json({
        success: true,
        data: {
            stats: {
                productos_total: 0,
                productos_activos: 0,
                stock_valor: 0,
                movimientos_mes: 0,
                transferencias_pendientes: 0,
                alertas: 0,
                proveedores_activos: 0, // ← Stat para proveedores
                compras_mes: 0
            },
            charts: {
                movimientos_recientes: [],
                stock_por_categoria: [],
                compras_por_proveedor: [] // ← Chart para proveedores
            },
            alerts: [],
            modulos_activos: Object.keys(rutasDisponibles).filter(nombre => {
                const rutaArchivo = path.join(__dirname, rutasDisponibles[nombre].archivo + '.js');
                return fs.existsSync(rutaArchivo);
            })
        },
        message: 'Dashboard temporal - implementar reportes completos'
    });
});

// Categorías básicas (temporal hasta implementar archivo separado)
router.get('/categorias', (req, res) => {
    res.json({
        success: true,
        data: [
            { id: 1, descripcion: 'Electrónicos', activo: 1 },
            { id: 2, descripcion: 'Herramientas', activo: 1 },
            { id: 3, descripcion: 'Materiales', activo: 1 },
            { id: 4, descripcion: 'Repuestos', activo: 1 },
            { id: 5, descripcion: 'Accesorios', activo: 1 },
            { id: 6, descripcion: 'Insumos', activo: 1 }
        ],
        message: 'Categorías básicas - implementar gestión completa'
    });
});

// =============================================
// MANEJO DE RUTAS NO ENCONTRADAS
// =============================================

router.use('*', (req, res) => {
    // ✅ CORRECCIÓN: Cambiar nombre de variable para evitar conflicto
    const listaRutas = Object.keys(rutasDisponibles).map(r => `/api/v1/${r}`);
    
    res.status(404).json({
        success: false,
        message: 'Ruta no encontrada',
        path: req.originalUrl,
        rutas_disponibles: listaRutas,
        suggestion: 'Verifica la documentación de la API'
    });
});

// =============================================
// LOGGING FINAL
// =============================================

console.log('\n🎯 Sistema de rutas modular inicializado');
console.log(`📊 Total de rutas configuradas: ${Object.keys(rutasDisponibles).length}`);
console.log('🔗 Endpoints disponibles en: /api/v1/\n');

module.exports = router;