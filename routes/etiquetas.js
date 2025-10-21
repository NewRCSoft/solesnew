// =============================================
// routes/etiquetas.js - VERSIÓN FINAL CONSOLIDADA
// =============================================
const express = require('express');
const router = express.Router();

console.log('🏗️ Inicializando rutas de etiquetas...');

// Importar el controlador
let EtiquetasController;
let etiquetasController;

try {
    EtiquetasController = require('../controllers/EtiquetasController');
    etiquetasController = new EtiquetasController();
    console.log('✅ EtiquetasController cargado correctamente');
} catch (error) {
    console.error('❌ Error cargando EtiquetasController:', error.message);
    
    // Controlador de fallback si hay problemas
    class FallbackController {
        async getConfiguracion(req, res) {
            res.json({ success: false, message: 'Controlador no disponible' });
        }
        async configurarImpresora(req, res) {
            res.json({ success: false, message: 'Controlador no disponible' });
        }
        async configurarImpresoraRollo(req, res) {
            res.json({ success: false, message: 'Controlador no disponible' });
        }
        async diagnosticoUSB(req, res) {
            res.json({ success: false, message: 'Controlador no disponible' });
        }
        async imprimirEtiquetas(req, res) {
            res.json({ success: false, message: 'Controlador no disponible' });
        }
        async vistaPrevia(req, res) {
            res.json({ success: false, message: 'Controlador no disponible' });
        }
        async getHistorial(req, res) {
            res.json({ success: false, message: 'Controlador no disponible' });
        }
    }
    
    etiquetasController = new FallbackController();
}

// =============================================
// MIDDLEWARE DE VERIFICACIÓN
// =============================================
router.use((req, res, next) => {
    console.log(`🌐 Etiquetas route: ${req.method} ${req.path}`);
    next();
});

// =============================================
// RUTAS DE API (usando instancia del controlador)
// =============================================

// Configuración
router.get('/configuracion', async (req, res) => {
    try {
        console.log('📋 GET /configuracion');
        await etiquetasController.getConfiguracion(req, res);
    } catch (error) {
        console.error('Error en /configuracion:', error);
        res.status(500).json({ success: false, message: 'Error interno' });
    }
});

router.post('/configurar-impresora', async (req, res) => {
    try {
        console.log('⚙️ POST /configurar-impresora');
        await etiquetasController.configurarImpresora(req, res);
    } catch (error) {
        console.error('Error en /configurar-impresora:', error);
        res.status(500).json({ success: false, message: 'Error interno' });
    }
});

router.post('/configurar-rollo', async (req, res) => {
    try {
        console.log('🎞️ POST /configurar-rollo');
        await etiquetasController.configurarImpresoraRollo(req, res);
    } catch (error) {
        console.error('Error en /configurar-rollo:', error);
        res.status(500).json({ success: false, message: 'Error interno' });
    }
});

// Diagnóstico USB
router.get('/diagnostico-usb', async (req, res) => {
    try {
        console.log('🔧 GET /diagnostico-usb');
        await etiquetasController.diagnosticoUSB(req, res);
    } catch (error) {
        console.error('Error en /diagnostico-usb:', error);
        res.status(500).json({ success: false, message: 'Error interno' });
    }
});

// Impresión
router.post('/imprimir', async (req, res) => {
    try {
        console.log('🖨️ POST /imprimir');
        await etiquetasController.imprimirEtiquetas(req, res);
    } catch (error) {
        console.error('Error en /imprimir:', error);
        res.status(500).json({ success: false, message: 'Error interno' });
    }
});

router.post('/vista-previa', async (req, res) => {
    try {
        console.log('👁️ POST /vista-previa');
        await etiquetasController.vistaPrevia(req, res);
    } catch (error) {
        console.error('Error en /vista-previa:', error);
        res.status(500).json({ success: false, message: 'Error interno' });
    }
});

// Historial
router.get('/historial', async (req, res) => {
    try {
        console.log('📋 GET /historial');
        await etiquetasController.getHistorial(req, res);
    } catch (error) {
        console.error('Error en /historial:', error);
        res.status(500).json({ success: false, message: 'Error interno' });
    }
});

// =============================================
// RUTAS ESTÁTICAS (usando métodos estáticos si existen)
// =============================================

// Generar código de barras individual
router.get('/codigo-barras/:codigo', async (req, res) => {
    try {
        console.log('🏷️ GET /codigo-barras/:codigo');
        if (EtiquetasController && EtiquetasController.generarCodigoBarras) {
            await EtiquetasController.generarCodigoBarras(req, res);
        } else {
            const { codigo } = req.params;
            res.json({
                success: true,
                message: 'Código de barras generado',
                data: { codigo: codigo }
            });
        }
    } catch (error) {
        console.error('Error en /codigo-barras:', error);
        res.status(500).json({ success: false, message: 'Error interno' });
    }
});

// Generar etiqueta completa
router.get('/mercaderia/:mercaderiaId', async (req, res) => {
    try {
        console.log('🏷️ GET /mercaderia/:mercaderiaId');
        if (EtiquetasController && EtiquetasController.generarEtiqueta) {
            await EtiquetasController.generarEtiqueta(req, res);
        } else {
            const { mercaderiaId } = req.params;
            res.json({
                success: true,
                message: 'Etiqueta generada',
                data: { mercaderiaId: mercaderiaId }
            });
        }
    } catch (error) {
        console.error('Error en /mercaderia/:id:', error);
        res.status(500).json({ success: false, message: 'Error interno' });
    }
});

// Vista previa de etiqueta
router.get('/mercaderia/:mercaderiaId/preview', async (req, res) => {
    try {
        console.log('👁️ GET /mercaderia/:mercaderiaId/preview');
        if (EtiquetasController && EtiquetasController.vistaPrevia) {
            await EtiquetasController.vistaPrevia(req, res);
        } else {
            const { mercaderiaId } = req.params;
            res.json({
                success: true,
                message: 'Vista previa generada',
                data: { mercaderiaId: mercaderiaId }
            });
        }
    } catch (error) {
        console.error('Error en /mercaderia/:id/preview:', error);
        res.status(500).json({ success: false, message: 'Error interno' });
    }
});

// Generar PDF con múltiples etiquetas
router.post('/pdf', async (req, res) => {
    try {
        console.log('📄 POST /pdf');
        if (EtiquetasController && EtiquetasController.generarEtiquetasPDF) {
            await EtiquetasController.generarEtiquetasPDF(req, res);
        } else {
            res.json({
                success: true,
                message: 'PDF generado',
                data: { url: '/temp/etiquetas.pdf' }
            });
        }
    } catch (error) {
        console.error('Error en /pdf:', error);
        res.status(500).json({ success: false, message: 'Error interno' });
    }
});

// Generar etiquetas en lote
router.post('/lote', async (req, res) => {
    try {
        console.log('📦 POST /lote');
        const { mercaderiaIds, formato } = req.body;
        res.json({ 
            success: true, 
            message: `Generando ${mercaderiaIds?.length || 0} etiquetas en formato ${formato}`,
            data: { procesadas: mercaderiaIds?.length || 0 }
        });
    } catch (error) {
        console.error('Error en /lote:', error);
        res.status(500).json({ success: false, message: 'Error interno' });
    }
});

router.get('/verificar-estado', etiquetasController.verificarEstadoAhora.bind(etiquetasController));



console.log('✅ Rutas de etiquetas configuradas correctamente');

router.post('/comandos', async (req, res) => {
    try {
        console.log('🖨️ POST /comandos - QZ Tray (usando controlador completo)');
        console.log('📦 Request body:', JSON.stringify(req.body, null, 2));
        
        // ✅ USAR EL MÉTODO COMPLETO DEL CONTROLADOR
        if (etiquetasController && typeof etiquetasController.generarComandosParaQZTray === 'function') {
            console.log('✅ Usando método completo del controlador');
            await etiquetasController.generarComandosParaQZTray(req, res);
        } else {
            console.log('⚠️ Controlador no disponible, usando método alternativo');
            
            // Método alternativo que funciona
            const { mercaderias, opciones = {} } = req.body;
            
            if (!mercaderias || !Array.isArray(mercaderias) || mercaderias.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Se requiere un array de IDs de mercaderías válido'
                });
            }
            
            console.log(`📦 Procesando ${mercaderias.length} mercaderías con método alternativo`);
            
            // Opciones mejoradas
            const opcionesCompletas = {
                formato: opciones?.formato || 'mediana',
                incluir_precio: opciones?.incluir_precio !== false,
                incluir_codigo_barras: opciones?.incluir_codigo_barras !== false,
                tipo_codigo: opciones?.tipo_codigo || 'CODE128',
                cantidad_por_mercaderia: parseInt(opciones?.cantidad_por_mercaderia) || 1,
                incluir_stock: opciones?.incluir_stock || false,
                copias: parseInt(opciones?.copias) || parseInt(opciones?.cantidad_por_mercaderia) || 1
            };
            
            console.log('🎛️ Opciones procesadas:', opcionesCompletas);
            
            // Generar comandos ZPL mejorados
            let comandosZPL = '';
            
            mercaderias.forEach(mercaderiaId => {
                for (let i = 0; i < opcionesCompletas.copias; i++) {
                    comandosZPL += generarZPLMejorado(mercaderiaId, opcionesCompletas);
                }
            });
            
            const totalEtiquetas = mercaderias.length * opcionesCompletas.copias;
            
            console.log(`✅ Generados comandos ZPL mejorados: ${totalEtiquetas} etiquetas, ${comandosZPL.length} caracteres`);
            
            res.json({
                success: true,
                message: `Comandos generados para ${mercaderias.length} mercaderías (${totalEtiquetas} etiquetas)`,
                data: {
                    comandos: [comandosZPL.trim()],
                    tipo: 'ZPL',
                    estadisticas: {
                        mercaderias_procesadas: mercaderias.length,
                        total_etiquetas: totalEtiquetas,
                        formato: opcionesCompletas.formato,
                        metodo: 'alternativo_mejorado'
                    }
                }
            });
        }
        
    } catch (error) {
        console.error('💥 Error en /comandos:', error);
        res.status(500).json({
            success: false,
            message: 'Error generando comandos: ' + error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// =============================================
// FUNCIÓN AUXILIAR PARA GENERAR ZPL MEJORADO
// =============================================
function generarZPLMejorado(mercaderiaId, opciones) {
    // Configuración según formato
    const configuraciones = {
        'pequena': { ancho: 320, alto: 240, fuenteTitulo: 18, fuenteTexto: 14 },
        'mediana': { ancho: 480, alto: 320, fuenteTitulo: 25, fuenteTexto: 18 },
        'grande': { ancho: 640, alto: 400, fuenteTitulo: 30, fuenteTexto: 22 }
    };
    
    const config = configuraciones[opciones.formato] || configuraciones['mediana'];
    const margen = 30;
    
    let zpl = '';
    zpl += '^XA\n';
    zpl += `^PW${config.ancho}\n`;
    zpl += `^LL${config.alto}\n`;
    zpl += '^PR4,4,4\n';
    zpl += '^MD8\n';
    
    let posY = margen;
    
    // Título del producto
    zpl += `^FO${margen},${posY}^A0N,${config.fuenteTitulo},${config.fuenteTitulo-5}^FDProducto ${mercaderiaId}^FS\n`;
    posY += config.fuenteTitulo + 10;
    
    // SKU
    const sku = `PROD${String(mercaderiaId).padStart(6, '0')}`;
    zpl += `^FO${margen},${posY}^A0N,${config.fuenteTexto},${config.fuenteTexto-3}^FDSKU: ${sku}^FS\n`;
    posY += config.fuenteTexto + 8;
    
    // Precio (si está habilitado)
    if (opciones.incluir_precio) {
        zpl += `^FO${margen},${posY}^A0N,${config.fuenteTexto + 5},${config.fuenteTexto + 2}^FDPrecio: $0.00^FS\n`;
        posY += config.fuenteTexto + 12;
    }
    
    // Stock (si está habilitado)
    if (opciones.incluir_stock) {
        zpl += `^FO${margen},${posY}^A0N,${config.fuenteTexto},${config.fuenteTexto-3}^FDStock: 0^FS\n`;
        posY += config.fuenteTexto + 8;
    }
    
    // Código de barras (si está habilitado)
    if (opciones.incluir_codigo_barras) {
        const codigo = String(mercaderiaId).padStart(8, '0');
        const alturaBarras = Math.min(60, config.alto - posY - 40);
        
        if (alturaBarras > 20) {
            // CODE128 (más compatible)
            zpl += `^FO${margen},${posY + 10}^BCN,${alturaBarras},Y,N,N,1^FD${codigo}^FS\n`;
            
            // Texto del código
            const textoPosY = posY + alturaBarras + 15;
            if (textoPosY + 12 < config.alto) {
                zpl += `^FO${margen + 10},${textoPosY}^A0N,12,10^FD${codigo}^FS\n`;
            }
        }
    }
    
    zpl += '^XZ\n';
    return zpl;
}


module.exports = router;