// =============================================
// controllers/EtiquetasController.js - USB DESHABILITADO
// =============================================
const logger = require('../config/logger');
const path = require('path');
const fs = require('fs');
const db = require('../config/database'); // Para validar mercaderías
const net = require('net'); // Para conexión TCP/IP
// =============================================
// CONFIGURACIÓN: USB DESHABILITADO
// =============================================
const USB_DESHABILITADO = true; // ← USB DESHABILITADO - Solo usar impresoras de red

// =============================================
// IMPORTACIÓN SOLO DE LO NECESARIO
// =============================================
let escpos, escposNetwork;
let redDisponible = false;

try {
    // Importar solo escpos principal
    escpos = require('escpos');
    console.log('✅ escpos principal importado');
    
    // Importar escpos-network (para impresoras TCP/IP)
    try {
        escposNetwork = require('escpos-network');
        escpos.Network = escposNetwork;
        redDisponible = true;
        console.log('✅ escpos-network importado - Impresoras de red disponibles');
    } catch (networkError) {
        console.error('❌ Error importando escpos-network:', networkError.message);
        redDisponible = false;
    }
    
    // NO IMPORTAR USB - está deshabilitado
    console.log('ℹ️ USB deshabilitado en configuración - Solo impresoras de red');
    
} catch (escposError) {
    console.error('💥 Error importando escpos:', escposError.message);
}

class EtiquetasController {
    
    constructor() {
        console.log('🏗️ Inicializando EtiquetasController (solo red)...');
        
        this.impresoras = {
            red: {
                host: process.env.PRINTER_IP || '192.168.1.100',
                puerto: process.env.PRINTER_PORT || 9100,
                activa: false,
                configuracion_rollo: {
                    ancho_rollo: 80,
                    velocidad: 4,
                    densidad: 8,
                    auto_corte: true
                }
            },
            usb: {
                activa: false,
                deshabilitado: true,
                razon: 'Deshabilitado por compatibilidad'
            }
        };
        
        this.formatos = {
            'pequena': { ancho: 40, alto: 30, columnas: 1, descripcion: 'Pequeña (40x30mm)' },
            'mediana': { ancho: 60, alto: 40, columnas: 1, descripcion: 'Mediana (60x40mm)' },
            'grande': { ancho: 80, alto: 50, columnas: 1, descripcion: 'Grande (80x50mm)' },
            'rollo_dos_columnas': { 
                ancho: 40, 
                alto: 20, 
                columnas: 2, 
                ancho_total: 80,
                descripcion: 'Rollo 80mm - 2 columnas (40x20mm)'
            }
        };

        this.verificarDependenciasESCPOS();
        
        this.estadoUSB = {
            verificado: true,
            ultimaVerificacion: new Date(),
            metodoExitoso: 'deshabilitado_manual',
            erroresAcumulados: ['USB deshabilitado en configuración'],
            bibliotecaDisponible: false,
            deshabilitado_manualmente: USB_DESHABILITADO,
            version_escpos: this.getVersionEscpos(),
            version_node: process.version,
            mensaje: 'USB deshabilitado - Use impresoras de red TCP/IP'
        };

        this.verificacionInterval = null;
        this.ultimaVerificacion = null;
        this.estadoAnterior = null;
        
        // Iniciar verificación automática cada 30 segundos
        this.iniciarVerificacionAutomatica();

        console.log('✅ EtiquetasController inicializado (solo red)');
    }
    
    getVersionEscpos() {
        try {
            return require('escpos/package.json').version;
        } catch (e) {
            return 'desconocida';
        }
    }

    verificarDependenciasESCPOS() {
        try {
            logger.info('🔍 Verificando dependencias ESCPOS (solo red)...');
            
            const versionEscpos = this.getVersionEscpos();
            logger.info(`📦 Versión escpos: ${versionEscpos}`);
            
            if (escpos) {
                logger.info('✅ escpos principal: disponible');
            } else {
                logger.error('❌ escpos principal: no disponible');
                return false;
            }
            
            if (redDisponible) {
                logger.info('✅ escpos-network: disponible');
                logger.info('🌐 Impresoras de red TCP/IP: LISTAS PARA USAR');
            } else {
                logger.error('❌ escpos-network: no disponible');
                logger.error('💥 Sin escpos-network no se pueden usar impresoras de red');
                return false;
            }
            
            logger.info('📋 Info del sistema:');
            logger.info(`   - Node.js: ${process.version}`);
            logger.info(`   - Plataforma: ${process.platform}`);
            logger.info(`   - USB: DESHABILITADO`);
            logger.info(`   - Red: ${redDisponible ? 'DISPONIBLE' : 'NO DISPONIBLE'}`);
            
            return true;
            
        } catch (error) {
            logger.error('💥 Error verificando dependencias:', error);
            return false;
        }
    }

    entornoSoportaUSB() {
        // Siempre retorna false porque USB está deshabilitado
        return false;
    }

    async probarConexionUSBRobusta() {
        // USB deshabilitado - siempre retorna false
        logger.info('ℹ️ USB deshabilitado en configuración');
        
        this.estadoUSB.verificado = true;
        this.estadoUSB.ultimaVerificacion = new Date();
        this.estadoUSB.metodoExitoso = 'deshabilitado_manual';
        
        return false;
    }

    // =============================================
    // MÉTODOS DE API
    // =============================================
    
    async getConfiguracion(req, res) {
        try {
            console.log('📋 getConfiguracion llamado');
            
            // NUEVO: Verificar estado actual si hay impresora configurada
            if (this.impresoras.red.host && this.impresoras.red.host !== '192.168.1.100') {
                const estadoActual = await this.probarConexionRed();
                this.impresoras.red.activa = estadoActual;
                this.ultimaVerificacion = new Date();
            }
            
            res.json({
                success: true,
                data: {
                    impresoras: this.impresoras,
                    formatos: this.formatos,
                    tipos_codigo: ['CODE128', 'EAN13', 'QR'],
                    estado_usb: this.estadoUSB,
                    soporte_usb: false,
                    biblioteca_usb_disponible: false,
                    usb_deshabilitado: USB_DESHABILITADO,
                    red_disponible: redDisponible,
                    version_escpos: this.estadoUSB.version_escpos,
                    version_node: this.estadoUSB.version_node,
                    mensaje_usb: 'USB deshabilitado - Use impresoras de red TCP/IP',
                    configuracion_predeterminada: {
                        host: process.env.PRINTER_IP || '192.168.1.100',
                        puerto: process.env.PRINTER_PORT || '9100',
                        desde_env: !!process.env.PRINTER_IP
                    },
                    // NUEVO: Información de verificación automática
                    verificacion_automatica: {
                        activa: !!this.verificacionInterval,
                        ultima_verificacion: this.ultimaVerificacion,
                        intervalo_segundos: 30
                    }
                }
            });
        } catch (error) {
            logger.error('Error obteniendo configuración de etiquetas:', error);
            res.status(500).json({
                success: false,
                message: 'Error obteniendo configuración'
            });
        }
    }

    destruir() {
        if (this.verificacionInterval) {
            clearInterval(this.verificacionInterval);
            logger.info('🛑 Verificación automática detenida');
        }
    }

     iniciarVerificacionAutomatica() {
        // Limpiar intervalo anterior si existe
        if (this.verificacionInterval) {
            clearInterval(this.verificacionInterval);
        }
        
        // Verificar cada 30 segundos si hay una impresora configurada
        this.verificacionInterval = setInterval(async () => {
            await this.verificarEstadoPeriodico();
        }, 30000); // 30 segundos
        
        logger.info('🔄 Verificación automática de impresora iniciada (cada 30 seg)');
    }
    
    // NUEVO: Verificación periódica de estado
    async verificarEstadoPeriodico() {
        try {
            // Solo verificar si hay una impresora configurada
            if (!this.impresoras.red.host || this.impresoras.red.host === '192.168.1.100') {
                return; // No hay configuración real
            }
            
            const estadoActual = await this.probarConexionRed();
            const estadoAnterior = this.impresoras.red.activa;
            
            // Solo actualizar si cambió el estado
            if (estadoActual !== estadoAnterior) {
                this.impresoras.red.activa = estadoActual;
                this.ultimaVerificacion = new Date();
                
                const mensaje = estadoActual ? 
                    '🟢 Impresora reconectada' : 
                    '🔴 Impresora desconectada';
                    
                logger.info(`📡 Estado impresora cambió: ${mensaje} (${this.impresoras.red.host}:${this.impresoras.red.puerto})`);
                
                // NUEVO: Notificar a clientes conectados vía WebSocket (opcional)
                // this.notificarCambioEstado(estadoActual);
            }
            
        } catch (error) {
            logger.warn('⚠️ Error en verificación periódica:', error.message);
        }
    }
    
    // =============================================
    // NUEVO: Verificar estado bajo demanda
    // =============================================
    async verificarEstadoAhora(req, res) {
        try {
            if (!this.impresoras.red.host) {
                return res.json({
                    success: false,
                    message: 'No hay impresora configurada'
                });
            }
            
            logger.info('🔍 Verificación manual de impresora solicitada');
            
            const estadoActual = await this.probarConexionRed();
            const estadoAnterior = this.impresoras.red.activa;
            
            // Actualizar estado
            this.impresoras.red.activa = estadoActual;
            this.ultimaVerificacion = new Date();
            
            const cambio = estadoActual !== estadoAnterior;
            
            res.json({
                success: true,
                data: {
                    activa: estadoActual,
                    cambio_detectado: cambio,
                    estado_anterior: estadoAnterior,
                    host: this.impresoras.red.host,
                    puerto: this.impresoras.red.puerto,
                    ultima_verificacion: this.ultimaVerificacion,
                    mensaje: estadoActual ? 
                        '✅ Impresora conectada y disponible' : 
                        '❌ Impresora no disponible'
                }
            });
            
        } catch (error) {
            logger.error('Error verificando estado:', error);
            res.status(500).json({
                success: false,
                message: 'Error verificando estado de impresora'
            });
        }
    }
    
    async configurarImpresora(req, res) {
        try {
            console.log('⚙️ configurarImpresora llamado con:', req.body);
            const { tipo, host, puerto } = req.body;
            
            if (tipo === 'red') {
                // FUNCIONALIDAD COMPLETA PARA RED
                this.impresoras.red.host = host || this.impresoras.red.host;
                this.impresoras.red.puerto = puerto || this.impresoras.red.puerto;
                
                if (!redDisponible) {
                    res.json({
                        success: false,
                        message: 'escpos-network no está disponible. Instale: npm install escpos-network',
                        data: { activa: false }
                    });
                    return;
                }
                
                const conexionOk = await this.probarConexionRed();
                this.impresoras.red.activa = conexionOk;
                
                res.json({
                    success: true,
                    message: `Impresora de red ${conexionOk ? 'configurada y conectada' : 'configurada pero sin conexión'}`,
                    data: { 
                        activa: conexionOk,
                        host: this.impresoras.red.host,
                        puerto: this.impresoras.red.puerto,
                        recomendacion: conexionOk ? null : 'Verifique que la impresora esté encendida y conectada a la red'
                    }
                });
                
            } else if (tipo === 'usb') {
                // USB DESHABILITADO - Respuesta informativa
                res.json({
                    success: true,
                    message: 'USB deshabilitado en esta configuración. Use impresora de red TCP/IP.',
                    data: { 
                        activa: false,
                        razon: 'deshabilitado_manual',
                        recomendacion: 'Configure una impresora de red TCP/IP para imprimir etiquetas',
                        ventajas_red: [
                            'Mayor estabilidad',
                            'No requiere drivers USB',
                            'Funciona remotamente',
                            'Compatible con cualquier sistema'
                        ],
                        como_configurar: {
                            paso1: 'Conecte la impresora a la red (WiFi o Ethernet)',
                            paso2: 'Obtenga la IP de la impresora (ej: 192.168.1.100)',
                            paso3: 'Configure puerto (generalmente 9100)',
                            paso4: 'Use el botón "Configurar IP" en la interfaz'
                        }
                    }
                });
                
            } else {
                res.status(400).json({
                    success: false,
                    message: 'Tipo de impresora no válido. Use "red" para impresoras TCP/IP.'
                });
            }
            
        } catch (error) {
            logger.error('Error configurando impresora:', error);
            res.status(500).json({
                success: false,
                message: 'Error configurando impresora: ' + error.message
            });
        }
    }

    async diagnosticoUSB(req, res) {
        try {
            console.log('🔧 diagnosticoUSB llamado');
            
            const diagnostico = {
                timestamp: new Date().toISOString(),
                estado: 'USB_DESHABILITADO',
                mensaje: 'USB deshabilitado en configuración del sistema',
                entorno: {
                    node_version: process.version,
                    plataforma: process.platform,
                    arquitectura: process.arch,
                    env: process.env.NODE_ENV || 'development'
                },
                configuracion: {
                    usb_deshabilitado: USB_DESHABILITADO,
                    red_disponible: redDisponible,
                    escpos_version: this.getVersionEscpos()
                },
                estado_actual: this.estadoUSB,
                recomendaciones: [
                    {
                        tipo: 'configuracion',
                        mensaje: 'Use impresoras de red TCP/IP en lugar de USB',
                        beneficios: [
                            'Mayor estabilidad y confiabilidad',
                            'No requiere drivers o permisos especiales',
                            'Funciona de forma remota',
                            'Compatible con cualquier sistema operativo',
                            'Más fácil de mantener y troubleshoot'
                        ]
                    },
                    {
                        tipo: 'implementacion',
                        mensaje: 'Pasos para usar impresoras de red',
                        pasos: [
                            '1. Conectar impresora a la red (WiFi/Ethernet)',
                            '2. Obtener dirección IP de la impresora',
                            '3. Configurar puerto (generalmente 9100)',
                            '4. Probar conexión desde la interfaz web'
                        ]
                    }
                ],
                alternativas_usb: {
                    habilitacion: 'Para habilitar USB, cambiar USB_DESHABILITADO = false en EtiquetasController.js',
                    requisitos: [
                        'Node.js v18 LTS (recomendado)',
                        'Librerías USB compatibles',
                        'Permisos de administrador (Windows)',
                        'Drivers USB instalados'
                    ],
                    nota: 'USB puede tener problemas de compatibilidad con Node.js v22'
                }
            };

            res.json({
                success: true,
                data: diagnostico
            });
            
        } catch (error) {
            logger.error('Error en diagnóstico USB:', error);
            res.status(500).json({
                success: false,
                message: 'Error ejecutando diagnóstico USB',
                error: error.message
            });
        }
    }

    // =============================================
    // MÉTODOS DE CONEXIÓN RED
    // =============================================
    
    async probarConexionRed() {
        return new Promise((resolve) => {
            try {
                if (!redDisponible || !escpos || !escpos.Network) {
                    logger.warn('Red no disponible - escpos.Network no encontrado');
                    resolve(false);
                    return;
                }
                
                const device = new escpos.Network(
                    this.impresoras.red.host,
                    this.impresoras.red.puerto
                );
                
                device.open((error) => {
                    if (error) {
                        logger.warn(`Error conectando a ${this.impresoras.red.host}:${this.impresoras.red.puerto} - ${error.message}`);
                        resolve(false);
                        return;
                    }
                    
                    logger.info(`✅ Conexión exitosa a impresora de red ${this.impresoras.red.host}:${this.impresoras.red.puerto}`);
                    device.close();
                    resolve(true);
                });
                
                setTimeout(() => {
                    try { device.close(); } catch {}
                    logger.warn(`Timeout conectando a ${this.impresoras.red.host}:${this.impresoras.red.puerto}`);
                    resolve(false);
                }, 5000);
                
            } catch (error) {
                logger.error('Error en probarConexionRed:', error);
                resolve(false);
            }
        });
    }

    // =============================================
    // RESTO DE MÉTODOS
    // =============================================

    async configurarImpresoraRollo(req, res) {
        try {
            const { 
                host, 
                puerto, 
                ancho_rollo = 80, 
                velocidad = 4, 
                densidad = 8,
                auto_corte = true 
            } = req.body;
            
            this.impresoras.red.host = host;
            this.impresoras.red.puerto = puerto;
            this.impresoras.red.configuracion_rollo = {
                ancho_rollo,
                velocidad,
                densidad,
                auto_corte
            };
            
            const conexionOk = await this.probarConexionRed();
            this.impresoras.red.activa = conexionOk;
            
            res.json({
                success: true,
                message: conexionOk ? 
                    'Impresora de rollo configurada y conectada' : 
                    'Impresora de rollo configurada pero sin conexión',
                data: { 
                    activa: conexionOk,
                    configuracion: this.impresoras.red.configuracion_rollo
                }
            });
            
        } catch (error) {
            logger.error('Error configurando impresora de rollo:', error);
            res.status(500).json({
                success: false,
                message: 'Error configurando impresora de rollo'
            });
        }
    }

    async imprimirEtiquetas(req, res) {
    try {
        const { mercaderias, opciones, impresora } = req.body;
        
        // 📋 Validaciones iniciales
        if (!mercaderias || mercaderias.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No se proporcionaron mercaderías para imprimir'
            });
        }

        if (impresora.tipo === 'usb') {
            return res.status(400).json({
                success: false,
                message: 'USB deshabilitado. Configure una impresora de red TCP/IP.'
            });
        }

        if (impresora.tipo === 'red' && !this.impresoras.red.activa) {
            return res.status(400).json({
                success: false,
                message: 'Impresora de red no está conectada. Verifique la configuración.'
            });
        }

        // 🔍 Validar que las mercaderías existen en la base de datos
        const mercaderiasCompletas = await this.validarYCompletarMercaderias(mercaderias);
        if (mercaderiasCompletas.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No se encontraron mercaderías válidas para imprimir'
            });
        }

        // 📏 Obtener formato de etiqueta
        const formato = this.formatos[opciones.formato] || this.formatos['mediana'];
        
        logger.info(`🖨️ Iniciando impresión de etiquetas`);
        logger.info(`📊 Mercaderías: ${mercaderiasCompletas.length}`);
        logger.info(`📏 Formato: ${opciones.formato} (${formato.descripcion})`);
        logger.info(`🎯 Impresora: ${impresora.host}:${impresora.puerto}`);

        // 🖨️ Generar comandos de impresión según el formato
        let comandosImpresion;
        let totalEtiquetasProcesadas = 0;
        // Resetear configuración de impresora

        if (formato.columnas === 2) {
            // Formato rollo dos columnas
            comandosImpresion = await this.generarComandosRolloDobleColumna(mercaderiasCompletas, opciones, formato);
            totalEtiquetasProcesadas = this.calcularTotalEtiquetasRollo(mercaderiasCompletas, opciones);
        } else {
            // Formatos estándar (una columna)
            comandosImpresion = await this.generarComandosEtiquetasEstandar(mercaderiasCompletas, opciones, formato);
            totalEtiquetasProcesadas = this.calcularTotalEtiquetasEstandar(mercaderiasCompletas, opciones);
        }

  

        // 🌐 Enviar comandos a la impresora de red
        const resultadoImpresion = await this.enviarAImpresoraRed(
            comandosImpresion, 
            impresora.host, 
            impresora.puerto
        );

        if (resultadoImpresion.success) {
            // 📊 Registrar en historial (opcional)
            await this.registrarImpressionEnHistorial({
                mercaderias: mercaderiasCompletas.length,
                formato: opciones.formato,
                opciones,
                timestamp: new Date(),
                impresora: `${impresora.host}:${impresora.puerto}`,
                total_etiquetas: totalEtiquetasProcesadas
            });

            logger.info(`✅ Impresión completada: ${totalEtiquetasProcesadas} etiquetas`);

            res.json({
                success: true,
                message: `Se imprimieron ${totalEtiquetasProcesadas} etiquetas correctamente`,
                data: {
                    tipo_impresora: 'red',
                    host: impresora.host,
                    puerto: impresora.puerto,
                    etiquetas_procesadas: totalEtiquetasProcesadas,
                    mercaderias_procesadas: mercaderiasCompletas.length,
                    formato: opciones.formato,
                    tiempo_procesamiento: resultadoImpresion.tiempo_ms,
                    comandos_enviados: comandosImpresion.length > 1000 ? 
                        `${Math.round(comandosImpresion.length / 1000)}KB` : 
                        `${comandosImpresion.length} chars`
                }
            });
        } else {
            throw new Error(resultadoImpresion.error);
        }
        
    } catch (error) {
        logger.error('❌ Error imprimiendo etiquetas:', error);
        res.status(500).json({
            success: false,
            message: `Error imprimiendo etiquetas: ${error.message}`
        });
    }
}

// =============================================
// NUEVO MÉTODO: Validar y completar datos de mercaderías
// =============================================
async validarYCompletarMercaderias(mercaderias) {
    try {
        const mercaderiasCompletas = [];
        
        for (const mercaderia of mercaderias) {
            let mercaderiaCompleta = mercaderia;
            
            // Si solo tenemos ID, obtener datos completos de la base de datos
            if (mercaderia.id && (!mercaderia.descripcion && !mercaderia.nombre)) {
                try {
                    const mercaderiaDB = await db.query(`
                        SELECT 
                            m.id,
                            m.descripcion,
                            m.codigo_sku,
                            m.precio_venta,
                            m.precio_costo,
                            m.stock_minimo,
                            m.unidad_medida,
                            m.activo,
                            c.categoria,
                            COALESCE(SUM(sd.cantidad), 0) as stock_actual
                        FROM mercaderias m
                        LEFT JOIN categorias c ON m.id_categoria = c.id
                        LEFT JOIN stock_depositos sd ON m.id = sd.mercaderia_id
                        WHERE m.id = ? AND m.activo = 1
                        GROUP BY m.id
                    `, [mercaderia.id]);
                    
                    if (mercaderiaDB && mercaderiaDB.length > 0) {
                        mercaderiaCompleta = {
                            ...mercaderia,
                            ...mercaderiaDB[0],
                            nombre: mercaderiaDB[0].descripcion, // Alias para compatibilidad
                            sku: mercaderiaDB[0].codigo_sku,
                            stock: mercaderiaDB[0].stock_actual
                        };
                    }
                } catch (dbError) {
                    logger.warn(`⚠️ No se pudo obtener mercadería ID ${mercaderia.id}:`, dbError.message);
                    continue; // Saltar esta mercadería
                }
            }
            
            // Validar que tenga los datos mínimos necesarios
            if (mercaderiaCompleta.descripcion || mercaderiaCompleta.nombre) {
                mercaderiasCompletas.push(mercaderiaCompleta);
            } else {
                logger.warn(`⚠️ Mercadería sin descripción, saltando:`, mercaderia);
            }
        }
        
        logger.info(`📋 Mercaderías validadas: ${mercaderiasCompletas.length}/${mercaderias.length}`);
        return mercaderiasCompletas;
        
    } catch (error) {
        logger.error('❌ Error validando mercaderías:', error);
        return [];
    }
}

// =============================================
// NUEVO MÉTODO: Generar comandos ZPL para etiquetas estándar
// =============================================
async generarComandosEtiquetasEstandar(mercaderias, opciones, formato) {
    let comandosZPL = '';
    
    for (const mercaderia of mercaderias) {
        const copias = opciones.copias || opciones.cantidad_por_mercaderia || 1;
        
        for (let i = 0; i < copias; i++) {
            comandosZPL += this.generarZPLEtiquetaIndividual(mercaderia, opciones, formato);
        }
    }
    
    logger.info(`📄 Comandos ZPL generados: ${comandosZPL.length} caracteres`);
    return comandosZPL;
}

// =============================================
// NUEVO MÉTODO: Generar comandos ZPL para rollo doble columna
// =============================================
async generarComandosRolloDobleColumna(mercaderias, opciones, formato) {
    let comandosZPL = '';
    const repeticionesPorMercaderia = opciones.copias || 1;
    
    for (const mercaderia of mercaderias) {
        for (let rep = 0; rep < repeticionesPorMercaderia; rep++) {
            // Cada "repetición" genera una fila con la misma mercadería en ambas columnas
            comandosZPL += this.generarEPLFilaDobleColumna(mercaderia, opciones, formato);
        }
    }
    
    logger.info(`📄 Comandos ZPL rollo generados: ${comandosZPL.length} caracteres`);
    return comandosZPL;
}

// =============================================
// NUEVO MÉTODO: Generar ZPL para una etiqueta individual - OPTIMIZADO PARA ETIQUETAS PEQUEÑAS
// =============================================
generarZPLEtiquetaIndividual(mercaderia, opciones, formato) {
    const ancho = formato.ancho * 8; // Convertir mm a dots (aprox 8 dots/mm)
    const alto = formato.alto * 8;
    const margen = ancho < 350 ? 8 : 15; // Margen más pequeño para etiquetas pequeñas
    const anchoUtil = ancho - (margen * 2);
    
    let zpl = '';
    
    // Inicializar etiqueta
    zpl += '^XA\n';
    zpl += `^PW${ancho}\n`;
    zpl += `^LL${alto}\n`;
    zpl += '^PR4,4,4\n';
    zpl += '^MD8\n';
    
    let posY = ancho < 350 ? 12 : 20; // Posición inicial más alta en etiquetas pequeñas
    
    // Ajustar tamaños de fuente según el ancho de la etiqueta
    const esPequena = ancho < 350;
    const fuenteTitulo = esPequena ? 18 : 25;
    const fuenteTexto = esPequena ? 14 : 20;
    const fuentePrecio = esPequena ? 28 : 35; // ¡Precio más grande!
    
    // Título del producto
    const nombre = mercaderia.nombre || mercaderia.descripcion || 'Sin nombre';
    const maxCaracteresNombre = this.calcularMaxCaracteres(anchoUtil, fuenteTitulo);
    const nombreCorto = this.truncarTexto(nombre, maxCaracteresNombre);
    zpl += `^FO${margen},${posY}^A0N,${fuenteTitulo},${fuenteTitulo-5}^FD${this.escapeZPL(nombreCorto)}^FS\n`;
    posY += esPequena ? 25 : 35;
    
    // SKU/Código (solo si hay espacio)
    const sku = mercaderia.sku || mercaderia.codigo_sku;
    if (sku && posY + 20 < alto - 60) { // Solo si hay espacio suficiente
        const maxCaracteresSku = this.calcularMaxCaracteres(anchoUtil, fuenteTexto);
        const skuCorto = this.truncarTexto(sku, maxCaracteresSku - 5); // -5 por "SKU: "
        zpl += `^FO${margen},${posY}^A0N,${fuenteTexto},${fuenteTexto-5}^FDSKU: ${this.escapeZPL(skuCorto)}^FS\n`;
        posY += esPequena ? 20 : 25;
    }
    
    // Precio (si está habilitado)
    if (opciones.incluir_precio && mercaderia.precio_venta && posY + 35 < alto - 60) {
        const precioFormateado = new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS',
            minimumFractionDigits: 0
        }).format(mercaderia.precio_venta);
        
        zpl += `^FO${margen},${posY}^A0N,${fuentePrecio},${fuentePrecio-3}^FD${this.escapeZPL(precioFormateado)}^FS\n`;
        posY += esPequena ? 35 : 45; // Más espacio para el precio grande
    }
    
    // Stock (solo en etiquetas medianas/grandes)
    if (opciones.incluir_stock && mercaderia.stock !== undefined && !esPequena && posY + 20 < alto - 60) {
        zpl += `^FO${margen},${posY}^A0N,18,15^FDStock: ${mercaderia.stock}^FS\n`;
        posY += 25;
    }
    
    // Código de barras - OPTIMIZADO PARA ETIQUETAS PEQUEÑAS
    if (opciones.incluir_codigo_barras) {
    const codigo = mercaderia.codigo_barras || sku || mercaderia.id;
    if (codigo) {
        const tipoCodigo = opciones.tipo_codigo || 'CODE128';
        const espacioDisponible = alto - posY - 10;
        
        if (espacioDisponible >= 30) {
            const codigoPosY = alto - Math.min(60, espacioDisponible);
            
            if (tipoCodigo === 'QR') {
                // Mantener QR como opción
                const tamanQR = Math.min(esPequena ? 40 : 60, anchoUtil * 0.8);
                const qrPosX = margen + (anchoUtil - tamanoQR) / 2;
                zpl += `^FO${qrPosX},${codigoPosY}^BQN,2,${esPequena ? 3 : 4}^FDMA,${this.escapeZPL(codigo)}^FS\n`;
            } else {
                // SIEMPRE USAR CODE128 - Más flexible
                const codigoCode128 = this.prepararCodigoCode128(codigo);
                const alturaBarras = esPequena ? 20 : Math.min(35, espacioDisponible - 20);
                
                // Centrar código de barras
                const codigoPosX = margen + 2;
                
                // CODE128 con ajuste automático
               zpl += `^FO${codigoPosX},${codigoPosY}^BCN,${alturaBarras},Y,N,N,1^FD${this.escapeZPL(codigoCode128)}^FS\n`;
                
                // Texto del código (solo si hay espacio)
                const textoCodigoPosY = codigoPosY + alturaBarras + 3;
                if (textoCodigoPosY + 12 < alto) {
                    const codigoTexto = this.truncarTexto(codigoCode128, esPequena ? 12 : 20);
                    const textoPosX = margen + (anchoUtil - (codigoTexto.length * (esPequena ? 4 : 6))) / 2;
                    zpl += `^FO${textoPosX},${textoCodigoPosY}^A0N,${esPequena ? 10 : 12},${esPequena ? 8 : 10}^FD${this.escapeZPL(codigoTexto)}^FS\n`;
                }
            }
        }
    }
}
    
    // Finalizar etiqueta
    zpl += '^XZ\n';
    
    return zpl;
}


ajustarCodigoParaCode128(codigo, anchoDisponible) {
    if (!codigo) return 'ITEM001';
    
    // CODE128 es más eficiente que EAN-13 para códigos alfanuméricos
    const margenesYControl = 50;
    const dotsPorCaracter = 11; // Aproximado para CODE128
    
    const maxCaracteres = Math.floor((anchoDisponible - margenesYControl) / dotsPorCaracter);
    
    if (maxCaracteres < 4) {
        return 'PROD';
    }
    
    // Limpiar código manteniendo alfanuméricos
    let codigoLimpio = String(codigo).replace(/[^A-Za-z0-9]/g, '');
    
    if (codigoLimpio.length === 0) {
        codigoLimpio = `ITEM${Math.abs(this.hashCode(codigo))}`;
    }
    
    if (codigoLimpio.length <= maxCaracteres) {
        return codigoLimpio;
    }
    
    // Para códigos largos, mantener balance
    if (maxCaracteres >= 8) {
        const inicio = codigoLimpio.substring(0, Math.floor(maxCaracteres / 2));
        const final = codigoLimpio.substring(codigoLimpio.length - Math.floor(maxCaracteres / 2));
        return inicio + final;
    }
    
    return codigoLimpio.substring(0, maxCaracteres);
}

//--------------------------------------------

generarTSPLFilaDobleColumna(mercaderia, opciones, formato) {
    const anchoTotal = formato.ancho_total; // 80mm
    const altoFila = formato.alto; // 20mm
    const anchoColumna = formato.ancho; // 40mm

    let tspl = '';

    // Configuración TSPL
    tspl += `SIZE ${anchoTotal} mm, ${altoFila} mm\n`;
    tspl += 'GAP 2 mm, 0 mm\n';
    tspl += 'DIRECTION 1,0\n';
    tspl += 'REFERENCE 0,0\n';
    tspl += 'OFFSET 0 mm\n';
    tspl += 'SET PEEL OFF\n';
    tspl += 'SET CUTTER OFF\n';
    tspl += 'SET PARTIAL_CUTTER OFF\n';
    tspl += 'SET TEAR ON\n';
    tspl += 'CLS\n'; // Clear buffer

    // Generar contenido para ambas columnas
    for (let col = 0; col < 2; col++) {
        const offsetX = col * (anchoColumna * 8); // Convertir a dots
        let posY = 40; // dots desde arriba

        // Nombre del producto
        const nombre = (mercaderia.nombre || mercaderia.descripcion || 'Producto').substring(0, 15);
        tspl += `TEXT ${offsetX + 40},${posY},"1",0,1,1,"${this.escapeTSPL(nombre)}"\n`;
        posY += 140;

        // Código de barras
        let codigo = String(mercaderia.codigo_barras || mercaderia.codigo_sku || mercaderia.id).replace(/[^0-9]/g, '');

        if (codigo.length > 13) {
            codigo = codigo.substring(0, 6) + codigo.slice(-6);
        }

        // TSPL Code 128 - CAMBIO AQUÍ
        // BARCODE X, Y, "Code 128", altura, mostrarTexto(1=si, 0=no), rotacion, ancho_barra, ancho_multiplicador, "contenido"
        tspl += `BARCODE ${offsetX + 20},${posY},"128",60,1,0,1,1,"${codigo}"\n`;

        // Línea divisoria
        if (col === 0) {
            const lineaX = offsetX + (anchoColumna * 8) - 8;
            tspl += `BAR ${lineaX},0,2,${altoFila * 8}\n`;
        }
    }

    tspl += 'PRINT 1,1\n'; // Imprimir 1 copia

    return tspl;
}

escapeTSPL(texto) {
    if (!texto) return '';
    return String(texto)
        .replace(/"/g, '\\"') // Escapar comillas
        .replace(/\\/g, '\\\\') // Escapar backslashes
        .substring(0, 50); // Límite de seguridad
}



// Se asume una resolución de 203 DPI (8 dots/mm) para la conversión
generarEPLFilaDobleColumna(mercaderia, opciones, formato) {
    const anchoTotalDots = formato.ancho_total * 8; // 80mm * 8 = 640 dots
    const altoFilaDots = formato.alto * 8; // 20mm * 8 = 160 dots
    const anchoColumnaDots = formato.ancho * 8; // 40mm * 8 = 320 dots
    
    let epl = '';

    // Configuración EPL
    epl += 'N\n'; // Borra el buffer de la impresora
    epl += `q${anchoTotalDots}\n`; // Ancho de la etiqueta en dots
    epl += `Q${altoFilaDots},24\n`; // Alto de la etiqueta y offset para rasgar
    epl += 'ZT\n'; // Set Tear-off mode
    epl += 'S3\n'; // Set printer speed (ajusta según tu impresora)
    epl += 'D12\n'; // Set darkness (ajusta según tu impresora)
    
    // Generar contenido para ambas columnas
    for (let col = 0; col < 2; col++) {
        const offsetX = col * anchoColumnaDots;
        let posY = 40; // Coordenada Y en dots

        // Nombre del producto (dividido en dos líneas)
        const nombreCompleto = (mercaderia.nombre || mercaderia.descripcion || 'Producto').substring(0, 40);
        
        const max_chars_linea = 20;
        const nombreLinea1 = nombreCompleto.substring(0, max_chars_linea);
        const nombreLinea2 = nombreCompleto.length > max_chars_linea ? nombreCompleto.substring(max_chars_linea) : '';

        // Función para centrar el texto (aproximación)
        const centrarTexto = (texto, ancho_columna_dots) => {
            // La fuente '2' tiene aproximadamente 8 dots por carácter (depende de la fuente)
            const ancho_texto_dots = texto.length * 8; 
            return (ancho_columna_dots / 2) - (ancho_texto_dots / 2);
        };

        // Imprimir el primer renglón del nombre
        //const xPos1 = offsetX + centrarTexto(nombreLinea1, anchoColumnaDots);
        const xPos1 = offsetX + 20; // Margen fijo a la izquierda
        epl += `A${xPos1},${posY},0,2,1,1,N,"${this.escapeEPL(nombreLinea1)}"\n`;
        
        // Ajustar la posición Y para la segunda línea
        posY += 20; // Separación entre líneas en dots
        
        // Imprimir el segundo renglón si existe
        if (nombreLinea2) {
            //const xPos2 = offsetX + centrarTexto(nombreLinea2, anchoColumnaDots);
            const xPos2 = offsetX + 20; // Margen fijo a la izquierda
            epl += `A${xPos2},${posY},0,2,1,1,N,"${this.escapeEPL(nombreLinea2)}"\n`;
        }

        // Ajustar la posición Y para el código de barras
        posY += 20; // Separación entre el texto y el código de barras

        // Código de barras
        let codigo = String(mercaderia.codigo_barras || mercaderia.codigo_sku || mercaderia.id).replace(/[^0-9A-Za-z]/g, '');

        // EPL: B <x>,<y>,<rotación>,<tipo>,<ancho_barra>,<multiplicador_x>,<altura>,<modo_texto>,"<datos>"
        epl += `B${offsetX + 20},${posY},0,1,2,6,50,B,"${codigo}"\n`;

        // Línea divisoria
        if (col === 0) {
            const lineaX = offsetX + anchoColumnaDots - 8;
            // G <x>,<y>,<ancho>,<alto>
            epl += `LO${lineaX},0,2,${altoFilaDots}\n`;
        }
    }

    epl += 'P1\n'; // Imprimir 1 copia
    
    return epl;
}

escapeEPL(texto) {
    if (!texto) return '';
    return String(texto)
        .replace(/"/g, '\"')
        .substring(0, 50);
}

// =============================================
// NUEVO MÉTODO: Generar ZPL para fila doble columna - CENTRADO CON DOS RENGLONES
// =============================================
generarZPLFilaDobleColumna(mercaderia, opciones, formato) {



    const anchoTotal = formato.ancho_total * 8; // 640 dots
    const altoFila = formato.alto * 8; // 160 dots  
    const anchoColumna = formato.ancho * 8; // 320 dots
    
    let zpl = '';
    
    // Configuración agresiva para códigos largos
    zpl += '^XA\n';
    zpl += `^PW${anchoTotal}\n`;
    zpl += `^LL${altoFila}\n`;
    zpl += '^PR6,6,6\n';  // Velocidad alta
    zpl += '^MD2\n';      // Densidad muy baja
    
    for (let col = 0; col < 2; col++) {
        const offsetX = col * anchoColumna;
        let posY = 5;
        
        // Nombre ultra compacto
        const nombre = (mercaderia.nombre || mercaderia.descripcion || 'Producto').substring(0, 15);
        const posX1 = offsetX + 5;
        zpl += `^FO${posX1},${posY}^A0N,12,8^FD${this.escapeZPL(nombre)}^FS\n`;
        posY += 18;
        
        // Código optimizado para 13-14 dígitos
        let codigo = String(mercaderia.codigo_barras || mercaderia.codigo_sku || mercaderia.id).replace(/[^0-9]/g, '');
        
        // Si es muy largo, usar solo los dígitos más significativos
        if (codigo.length > 13) {
            // Para 13 dígitos: tomar primeros 6 + últimos 6
            codigo = codigo.substring(0, 6) + codigo.slice(-6);
        }
        
        // Posición centrada SIN desplazamiento erróneo
        const anchoEstimado = codigo.length * 6; // Conservador
        const codigoPosX = offsetX + Math.max(5, (anchoColumna - anchoEstimado) / 2);
        const codigoPosY = posY + 10;
        
        // CODE128 con densidad mínima
        zpl += `^FO${codigoPosX},${codigoPosY}^BKN,150,Y,N,N,A,A^FD${codigo}^FS\n`;
        //zpl += `^FO${Math.floor(codigoPosX)},${codigoPosY}^BCN,45,N,N,N,1^FD${codigo}^FS\n`;
        
        // Texto del código
        const textoPosX = offsetX + (anchoColumna - (codigo.length * 3)) / 2;
        zpl += `^FO${Math.floor(textoPosX)},${codigoPosY + 50}^A0N,8,6^FD${codigo}^FS\n`;
        
        // Línea divisoria
        if (col === 0) {
            zpl += `^FO${offsetX + anchoColumna - 1},0^GB1,${altoFila},1^FS\n`;
        }
    }
    
    zpl += '^XZ\n';
    return zpl;
}

// 2. NUEVO MÉTODO: Preparar código para CODE128 (reemplaza convertirAEAN13)
prepararCodigoCode128(codigo) {
    if (!codigo) {
        return 'PROD001'; // Código de ejemplo
    }
    
    // Limpiar el código - CODE128 acepta letras, números y algunos símbolos
    let codigoLimpio = String(codigo)
        .replace(/[^A-Za-z0-9\-_\.]/g, '') // Mantener alfanuméricos y algunos símbolos
        .substring(0, 20); // Límite para etiquetas pequeñas
    
    // Si queda vacío, generar uno basado en hash
    if (codigoLimpio.length === 0) {
        const hash = Math.abs(this.hashCode(String(codigo)));
        codigoLimpio = `ITEM${hash}`.substring(0, 10);
    }
    
    // Asegurar que tenga al menos 4 caracteres
    if (codigoLimpio.length < 4) {
        codigoLimpio = codigoLimpio.padEnd(4, '0');
    }
    
    return codigoLimpio;
}
// =============================================
// NUEVO MÉTODO: Enviar comandos a impresora - COMPATIBLE CON DYNDNS
// =============================================
async enviarAImpresoraRed(comandos, host, puerto) {
    return new Promise(async (resolve) => {
        const tiempoInicio = Date.now();
        
        logger.info(`🔗 Conectando a impresora ${host}:${puerto}...`);
        
        // Detectar tipo de conexión
        if (this.esBridgeHTTP(host, puerto)) {
            // Usar bridge HTTP
            try {
                const response = await this.enviarViaBridgeHTTP(comandos, host, puerto);
                const tiempoTotal = Date.now() - tiempoInicio;
                resolve({
                    success: response.success,
                    tiempo_ms: tiempoTotal,
                    via: 'bridge_http',
                    host_resuelto: host,
                    error: response.error || null
                });
            } catch (error) {
                resolve({
                    success: false,
                    error: `Error en bridge HTTP: ${error.message}`
                });
            }
        } else {
            // Usar conexión TCP directa (IP o DynDNS)
            const client = new net.Socket();
            
            // Timeout más largo para DynDNS (pueden tardar más en resolver)
            const timeoutMs = this.esDominio(host) ? 10000 : 5000;
            client.setTimeout(timeoutMs);
            
            logger.info(`📡 ${this.esDominio(host) ? 'Resolviendo dominio' : 'Conectando a IP'}: ${host}`);
            
            client.connect(puerto, host, () => {
                const tipoConexion = this.esDominio(host) ? 'DynDNS' : 'IP directa';
                logger.info(`✅ Conectado vía ${tipoConexion} a ${host}:${puerto}`);
                
                client.write(comandos, 'utf8');
                logger.info(`📤 Comandos ZPL enviados (${comandos.length} chars)`);
                
                setTimeout(() => {
                    client.destroy();
                    const tiempoTotal = Date.now() - tiempoInicio;
                    logger.info(`⏱️ Impresión completada en ${tiempoTotal}ms vía ${tipoConexion}`);
                    resolve({
                        success: true,
                        tiempo_ms: tiempoTotal,
                        via: tipoConexion.toLowerCase().replace(' ', '_'),
                        host_resuelto: host
                    });
                }, 100);
            });
            
            client.on('error', (error) => {
                const tipoError = this.esDominio(host) ? 
                    `Error resolviendo/conectando a dominio ${host}` : 
                    `Error conectando a IP ${host}`;
                    
                logger.error(`❌ ${tipoError}:${puerto} - ${error.message}`);
                
                // Mensajes de error más específicos
                let mensajeError = error.message;
                if (error.code === 'ENOTFOUND') {
                    mensajeError = `No se pudo resolver el dominio ${host}. Verifique DynDNS.`;
                } else if (error.code === 'ECONNREFUSED') {
                    mensajeError = `Conexión rechazada. Verifique port forwarding en router.`;
                } else if (error.code === 'ETIMEDOUT') {
                    mensajeError = `Timeout. Verifique conectividad de red y firewall.`;
                }
                
                resolve({
                    success: false,
                    error: mensajeError,
                    codigo_error: error.code,
                    host_intentado: host
                });
            });
            
            client.on('timeout', () => {
                client.destroy();
                const tipoTimeout = this.esDominio(host) ? 
                    `Timeout resolviendo dominio ${host}` : 
                    `Timeout conectando a ${host}`;
                logger.error(`⏰ ${tipoTimeout}:${puerto}`);
                
                resolve({
                    success: false,
                    error: `${tipoTimeout}. Verifique conectividad y configuración de red.`,
                    codigo_error: 'TIMEOUT'
                });
            });
        }
    });
}

// Detectar si es un dominio (DynDNS)
esDominio(host) {
    // Si contiene puntos pero NO es una IP, es un dominio
    return host.includes('.') && !host.match(/^\d+\.\d+\.\d+\.\d+$/);
}

// Detectar si es un bridge HTTP
esBridgeHTTP(host, puerto) {
    // Puertos comunes para HTTP o si el host sugiere HTTP
    return puerto == 8080 || puerto == 8000 || puerto == 3000 || 
           host.toLowerCase().includes('bridge') ||
           host.toLowerCase().includes('api');
}

// Enviar vía bridge HTTP
async enviarViaBridgeHTTP(comandos, host, puerto) {
    const fetch = require('node-fetch');
    
    const bridgeURL = `http://${host}:${puerto}/print`;
    logger.info(`🌉 Enviando a bridge: ${bridgeURL}`);
    
    const response = await fetch(bridgeURL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'VPS-PrinterBridge/1.0'
        },
        body: JSON.stringify({
            comandos: comandos,
            origen: 'vps',
            timestamp: new Date().toISOString()
        }),
        timeout: 10000  // 10 segundos timeout
    });
    
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.json();
}

// =============================================
// NUEVOS MÉTODOS AUXILIARES - AMPLIADOS
// =============================================

// NUEVA: Dividir texto en dos líneas inteligentemente
dividirTextoEnDosLineas(texto, maxCaracteresPorLinea) {
    if (!texto) {
        return { linea1: '', linea2: '' };
    }
    
    texto = texto.trim();
    
    // Si el texto es muy corto, va todo en la primera línea
    if (texto.length <= maxCaracteresPorLinea) {
        return { linea1: texto, linea2: '' };
    }
    
    // Buscar el mejor punto de corte (espacio más cercano al límite)
    let puntoCorte = maxCaracteresPorLinea;
    
    // Buscar hacia atrás desde el límite hasta encontrar un espacio
    for (let i = maxCaracteresPorLinea; i >= Math.floor(maxCaracteresPorLinea * 0.7); i--) {
        if (texto[i] === ' ') {
            puntoCorte = i;
            break;
        }
    }
    
    // Si no encontramos espacio, cortar en el límite
    if (puntoCorte === maxCaracteresPorLinea && texto[maxCaracteresPorLinea] !== ' ') {
        // Verificar si hay espacio cerca hacia adelante
        let hayEspacioCerca = false;
        for (let i = maxCaracteresPorLinea + 1; i < Math.min(texto.length, maxCaracteresPorLinea + 10); i++) {
            if (texto[i] === ' ') {
                puntoCorte = i;
                hayEspacioCerca = true;
                break;
            }
        }
        
        // Si no hay espacio cerca, cortar forzadamente
        if (!hayEspacioCerca) {
            puntoCorte = maxCaracteresPorLinea - 1;
        }
    }
    
    // Dividir el texto
    let linea1 = texto.substring(0, puntoCorte).trim();
    let linea2 = texto.substring(puntoCorte).trim();
    
    // Truncar segunda línea si es muy larga
    if (linea2.length > maxCaracteresPorLinea) {
        linea2 = linea2.substring(0, maxCaracteresPorLinea - 3) + '...';
    }
    
    // Asegurar que la primera línea no esté vacía
    if (!linea1 && linea2) {
        linea1 = linea2;
        linea2 = '';
    }
    
    return { 
        linea1: linea1 || texto.substring(0, maxCaracteresPorLinea), 
        linea2: linea2 
    };
}
// Truncar texto manteniendo integridad
truncarTexto(texto, maxLength) {
    if (!texto) return '';
    return texto.length > maxLength ? texto.substring(0, maxLength - 3) + '...' : texto;
}

// Escapar caracteres especiales para ZPL
escapeZPL(texto) {
    if (!texto) return '';
    return String(texto)
        .replace(/\^/g, '\\^')   // Escapar ^
        .replace(/~/g, '\\~')    // Escapar ~
        .replace(/\n/g, '')      // Remover saltos de línea
        .replace(/\r/g, '')      // Remover retornos de carro
        .substring(0, 100);      // Límite de seguridad
}

// NUEVO: Calcular máximo de caracteres que caben en un ancho dado
calcularMaxCaracteres(anchoDisponible, tamañoFuente) {
    // Aproximación: cada carácter ocupa aprox. tamañoFuente * 0.6 dots de ancho
    const anchoPorCaracter = tamañoFuente * 0.6;
    const maxCaracteres = Math.floor(anchoDisponible / anchoPorCaracter);
    return Math.max(5, maxCaracteres); // Mínimo 5 caracteres
}



// Función auxiliar para generar hash numérico
hashCode(str) {
    let hash = 0;
    if (str.length === 0) return hash;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convertir a 32bit integer
    }
    return hash;
}



// NUEVO: Ajustar código de barras para Code 128 Automático - OPTIMIZADO PARA EAN-13
ajustarCodigoParaAncho(codigo, anchoDisponible) {
    if (!codigo) return '';
    
    // Verificar si puede ser EAN-13 (más eficiente)
    const soloDigitos = codigo.replace(/[^0-9]/g, '');
    if (soloDigitos.length === 13) {
        return soloDigitos; // Perfecto para EAN-13
    }
    
    // Si son 12 dígitos, podemos agregar un 0 al inicio para EAN-13
    if (soloDigitos.length === 12) {
        return '0' + soloDigitos; // Convertir a EAN-13
    }
    
    // Code 128 Automático es más eficiente que Code 39
    const margenesYControl = 50;
    
    // Para etiquetas muy pequeñas (menos de 350 dots)
    if (anchoDisponible < 350) {
        const maxCaracteres = Math.floor((anchoDisponible - margenesYControl) / 10);
        
        if (maxCaracteres < 4) {
            return soloDigitos.slice(-4).padStart(4, '0') || '1234';
        }
        
        // Si tenemos muchos números, intentar mantenerlos para eficiencia Code 128C
        if (soloDigitos.length >= maxCaracteres) {
            return soloDigitos.slice(0, maxCaracteres);
        }
        
        let codigoLimpio = codigo.replace(/[^a-zA-Z0-9]/g, '');
        if (codigoLimpio.length === 0) {
            codigoLimpio = soloDigitos.padStart(maxCaracteres, '0');
        }
        
        return codigoLimpio.slice(0, maxCaracteres);
    }
    
    // Para etiquetas medianas y grandes
    const maxCaracteres = Math.floor((anchoDisponible - margenesYControl) / 11);
    
    if (maxCaracteres >= codigo.length) {
        return codigo;
    }
    
    if (maxCaracteres < 4) {
        return soloDigitos.slice(-4).padStart(4, '0') || '1234';
    }
    
    // Para códigos largos, mantener balance entre inicio y final
    if (maxCaracteres >= 8) {
        const inicio = codigo.substring(0, Math.floor(maxCaracteres / 2));
        const final = codigo.substring(codigo.length - Math.floor(maxCaracteres / 2));
        return inicio + final;
    }
    
    return codigo.substring(0, maxCaracteres);
}

// Calcular total de etiquetas estándar
calcularTotalEtiquetasEstandar(mercaderias, opciones) {
    const copias = opciones.copias || opciones.cantidad_por_mercaderia || 1;
    return mercaderias.length * copias;
}

// Calcular total de etiquetas rollo
calcularTotalEtiquetasRollo(mercaderias, opciones) {
    const repeticiones = opciones.cantidad_por_mercaderia || 1;
    return mercaderias.length * repeticiones * 2; // 2 etiquetas por fila
}

// Registrar impresión en historial (opcional)
async registrarImpressionEnHistorial(datos) {
    try {
        // Aquí podrías guardar en la tabla de historial si existe
        logger.info('📊 Impresión registrada:', {
            timestamp: datos.timestamp,
            mercaderias: datos.mercaderias,
            formato: datos.formato,
            total_etiquetas: datos.total_etiquetas
        });
        
        // Ejemplo de inserción en base de datos (opcional):
        /*
        await db.query(`
            INSERT INTO historial_impresiones 
            (fecha, mercaderias_count, formato, total_etiquetas, impresora, opciones)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [
            datos.timestamp,
            datos.mercaderias,
            datos.formato,
            datos.total_etiquetas,
            datos.impresora,
            JSON.stringify(datos.opciones)
        ]);
        */
        
    } catch (error) {
        logger.warn('⚠️ No se pudo registrar en historial:', error.message);
    }
}

// =============================================
// MÉTODO vistaPrevia MEJORADO (reemplazar el existente)
// =============================================
async vistaPrevia(req, res) {
    try {
        const { mercaderias, opciones } = req.body;
        
        if (!mercaderias || mercaderias.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No se proporcionaron mercaderías para la vista previa'
            });
        }

        // Validar y completar datos de mercaderías
        const mercaderiasCompletas = await this.validarYCompletarMercaderias(mercaderias);
        if (mercaderiasCompletas.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No se encontraron mercaderías válidas para la vista previa'
            });
        }

        const formato = this.formatos[opciones.formato] || this.formatos['mediana'];
        const mercaderiaMuestra = mercaderiasCompletas[0]; // Usar la primera mercadería como muestra
        
        // Generar HTML de vista previa
        const htmlPreview = this.generarHTMLPreview(mercaderiaMuestra, opciones, formato);
        
        logger.info(`👁️ Vista previa generada para formato: ${opciones.formato}`);
        
        res.json({
            success: true,
            message: 'Vista previa generada correctamente',
            data: { 
                html: htmlPreview,
                formato: opciones.formato,
                mercaderias_total: mercaderiasCompletas.length,
                ejemplo_mercaderia: mercaderiaMuestra.nombre || mercaderiaMuestra.descripcion
            }
        });
        
    } catch (error) {
        logger.error('❌ Error generando vista previa:', error);
        res.status(500).json({
            success: false,
            message: 'Error generando vista previa'
        });
    }
}

// Generar HTML para vista previa EAN-13
generarHTMLPreview(mercaderia, opciones, formato) {
    const esRollo = formato.columnas === 2;
    
    let html = `
        <div class="etiqueta-preview border rounded p-3" style="
            width: ${esRollo ? formato.ancho_total : formato.ancho}mm; 
            height: ${formato.alto}mm; 
            font-family: Arial, sans-serif;
            background: white;
            position: relative;
            margin: 10px auto;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            transform: scale(2);
            transform-origin: center;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
        ">
    `;
    
    if (esRollo) {
        // Vista previa rollo dos columnas EAN-13
        html += `
            <div style="display: flex; height: 100%;">
                <div style="width: 50%; padding: 2px; border-right: 1px dashed #ccc; display: flex; flex-direction: column; justify-content: space-between;">
                    ${this.generarContenidoEtiquetaHTML(mercaderia, opciones, true)}
                </div>
                <div style="width: 50%; padding: 2px; display: flex; flex-direction: column; justify-content: space-between;">
                    ${this.generarContenidoEtiquetaHTML(mercaderia, opciones, true)}
                </div>
            </div>
        `;
    } else {
        // Vista previa estándar EAN-13
        html += this.generarContenidoEtiquetaHTML(mercaderia, opciones, false);
    }
    
    html += '</div>';
    return html;
}

// Generar contenido HTML para etiqueta - MEJORADO
generarContenidoEtiquetaHTML(mercaderia, opciones, esCompacto) {
    const fontSize = esCompacto ? '8px' : '12px';
    const titleSize = esCompacto ? '10px' : '14px';
    
    const nombre = mercaderia.nombre || mercaderia.descripcion || 'Sin nombre';
    const sku = mercaderia.sku || mercaderia.codigo_sku;
    
    const maxCaracteresNombre = esCompacto ? 18 : 30;
    const maxCaracteresSku = esCompacto ? 15 : 20;
    
    let contenido = `
        <div style="font-size: ${titleSize}; font-weight: bold; margin-bottom: 2px; line-height: 1.1;">
            ${this.truncarTexto(nombre, maxCaracteresNombre)}
        </div>
    `;
    
    if (sku) {
        contenido += `
            <div style="font-size: ${fontSize}; color: #666; margin-bottom: 2px;">
                SKU: ${this.truncarTexto(sku, maxCaracteresSku)}
            </div>
        `;
    }
    
    if (opciones.incluir_precio && mercaderia.precio_venta) {
        const precio = new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS',
            minimumFractionDigits: 0
        }).format(mercaderia.precio_venta);
        
        contenido += `
            <div style="font-size: ${esCompacto ? '14px' : '18px'}; font-weight: bold; color: #d73527; margin-bottom: 3px; line-height: 1.2;">
                ${precio}
            </div>
        `;
    }
    
    if (opciones.incluir_stock && mercaderia.stock !== undefined) {
        contenido += `
            <div style="font-size: ${fontSize}; color: #28a745; margin-bottom: 2px;">
                Stock: ${mercaderia.stock}
            </div>
        `;
    }
    
    if (opciones.incluir_codigo_barras) {
        const codigo = mercaderia.codigo_barras || sku || mercaderia.id;
        if (codigo) {
            // Usar CODE128 en vista previa
            const codigoCode128 = this.prepararCodigoCode128(codigo);
            const codigoMostrar = this.truncarTexto(codigoCode128, esCompacto ? 12 : 20);
                
            contenido += `
                <div style="margin-top: 5px; text-align: center; max-width: 100%; overflow: hidden;">
                    <div style="background: #000; height: ${esCompacto ? '15px' : '25px'}; 
                                width: 95%; margin: 0 auto 2px auto; 
                                background-image: repeating-linear-gradient(90deg, #000 0px, #000 1px, transparent 1px, transparent 2px);">
                    </div>
                    <div style="font-size: ${esCompacto ? '6px' : '8px'}; font-family: monospace; word-break: break-all;">
                        ${codigoMostrar}
                    </div>
                </div>
            `;
        }
    }
    
    return contenido;
}


    async getHistorial(req, res) {
        try {
            res.json({
                success: true,
                data: []
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Error obteniendo historial'
            });
        }
    }

    // Métodos estáticos para compatibilidad
    static async generarCodigoBarras(req, res) {
        try {
            res.json({ success: true, message: 'Código de barras generado' });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error generando código' });
        }
    }

    static async generarEtiqueta(req, res) {
        try {
            res.json({ success: true, message: 'Etiqueta generada' });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error generando etiqueta' });
        }
    }

    static async generarEtiquetasPDF(req, res) {
        try {
            res.json({ success: true, message: 'PDF generado' });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error generando PDF' });
        }
    }

    // =============================================
// AGREGAR AL FINAL DE EtiquetasController.js
// NUEVO ENDPOINT PARA QZ TRAY
// =============================================

// =============================================
// ENDPOINT: Generar comandos sin imprimir (para QZ Tray)
// =============================================
async generarComandosParaQZTray(req, res) {
    try {
        const { mercaderias: mercaderiaIds, opciones } = req.body;

        // Validaciones básicas
        if (!mercaderiaIds || !Array.isArray(mercaderiaIds) || mercaderiaIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Se requiere un array de IDs de mercaderías válido'
            });
        }

        // Opciones por defecto
        const opcionesCompletas = {
            formato: opciones?.formato || 'mediana',
            incluir_precio: opciones?.incluir_precio ?? true,
            incluir_codigo_barras: opciones?.incluir_codigo_barras ?? true,
            tipo_codigo: opciones?.tipo_codigo || 'auto',
            cantidad_por_mercaderia: opciones?.cantidad_por_mercaderia || 1,
            incluir_stock: opciones?.incluir_stock ?? false,
            copias: opciones?.copias || opciones?.cantidad_por_mercaderia || 1
        };

        logger.info(`🏷️ QZ Tray - Generando comandos para ${mercaderiaIds.length} mercaderías`);
        logger.info(`📋 Opciones: ${JSON.stringify(opcionesCompletas)}`);

        // 🔍 Validar y obtener mercaderías completas
        const mercaderiasCompletas = await this.validarYCompletarMercaderias(mercaderiaIds);
        if (mercaderiasCompletas.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No se encontraron mercaderías válidas con los IDs proporcionados'
            });
        }

        // 📏 Obtener formato de etiqueta
        const formato = this.formatos[opcionesCompletas.formato] || this.formatos['mediana'];
        
        logger.info(`📐 Formato seleccionado: ${opcionesCompletas.formato} - ${formato.descripcion}`);

        // 🖨️ Generar comandos según el formato
        let comandosImpresion;
        let totalEtiquetas = 0;
        let tipoComando = 'ZPL'; // Por defecto ZPL

        if (formato.columnas === 2) {
            // Formato rollo dos columnas
            comandosImpresion = await this.generarComandosRolloDobleColumna(
                mercaderiasCompletas, 
                opcionesCompletas, 
                formato
            );
            totalEtiquetas = this.calcularTotalEtiquetasRollo(mercaderiasCompletas, opcionesCompletas);
            tipoComando = 'ZPL';
        } else {
            // Formatos estándar (una columna)
            comandosImpresion = await this.generarComandosEtiquetasEstandar(
                mercaderiasCompletas, 
                opcionesCompletas, 
                formato
            );
            totalEtiquetas = this.calcularTotalEtiquetasEstandar(mercaderiasCompletas, opcionesCompletas);
            tipoComando = 'ZPL';
        }

        // Verificar que se generaron comandos
        if (!comandosImpresion || comandosImpresion.length === 0) {
            return res.status(500).json({
                success: false,
                message: 'Error interno: no se pudieron generar los comandos de impresión'
            });
        }

        // 📊 Estadísticas de generación
        const estadisticas = {
            mercaderias_procesadas: mercaderiasCompletas.length,
            total_etiquetas: totalEtiquetas,
            formato: opcionesCompletas.formato,
            tamano_comandos: comandosImpresion.length,
            tipo_comando: tipoComando
        };

        logger.info(`✅ QZ Tray - Comandos generados exitosamente:`, estadisticas);

        // 📤 Respuesta exitosa
        res.json({
            success: true,
            message: `Comandos generados exitosamente para ${mercaderiasCompletas.length} mercaderías`,
            data: {
                comandos: [comandosImpresion], // QZ Tray espera un array de strings
                tipo: tipoComando,
                estadisticas: estadisticas,
                configuracion: {
                    formato: formato,
                    opciones: opcionesCompletas
                }
            }
        });

    } catch (error) {
        logger.error('💥 Error generando comandos para QZ Tray:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno generando comandos de impresión',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

// =============================================
// MÉTODO AUXILIAR: Validar y completar mercaderías
// (Reutilizar el existente o crear uno específico)
// =============================================
async validarYCompletarMercaderias(mercaderiaIds) {
    try {
        if (!Array.isArray(mercaderiaIds)) return [];
        
        // Convertir IDs a números/strings según sea necesario
        const idsLimpios = mercaderiaIds.map(id => {
            return typeof id === 'string' ? parseInt(id) || id : id;
        }).filter(id => id != null);

        if (idsLimpios.length === 0) return [];

        // Crear placeholders para la consulta
        const placeholders = idsLimpios.map(() => '?').join(',');
        
        // Query mejorada con más campos
        const query = `
            SELECT  m.id, m.descripcion, 
                    m.codigo_sku, 
                    m.precio_venta, 
                    m.precio_costo, 
                    m.stock_minimo, 
                    m.unidad_medida, 
                    m.activo 
            FROM mercaderias m 
            WHERE m.id = ? GROUP BY m.id;

        `;

        const mercaderias = await db.query(query, idsLimpios);

        // Validar que se encontraron mercaderías
        if (!mercaderias || mercaderias.length === 0) {
            logger.warn(`⚠️ No se encontraron mercaderías para IDs: ${idsLimpios.join(', ')}`);
            return [];
        }

        // Completar datos faltantes
        const mercaderiasCompletas = mercaderias.map(mercaderia => ({
            ...mercaderia,
            // Asegurar código de barras
            codigo_barras: mercaderia.codigo_barras || 
                          mercaderia.codigo_sku || 
                          this.generarCodigoBarrasDefault(mercaderia.id),
            // Asegurar precio
            precio_venta: parseFloat(mercaderia.precio_venta) || 0,
            precio_costo: parseFloat(mercaderia.precio_costo) || 0,
            // Stock formateado
            stock_total: parseInt(mercaderia.stock_total) || 0
        }));

        logger.info(`✅ Mercaderías completadas: ${mercaderiasCompletas.length}/${idsLimpios.length}`);
        
        return mercaderiasCompletas;

    } catch (error) {
        logger.error('❌ Error validando mercaderías:', error);
        return [];
    }
}

// =============================================
// MÉTODO AUXILIAR: Generar código de barras por defecto
// =============================================
generarCodigoBarrasDefault(mercaderiaId) {
    // Generar un código simple basado en el ID
    const id = String(mercaderiaId).padStart(6, '0');
    return `799${id}${this.calcularDigitoControl(id)}`;
}

// =============================================
// MÉTODO AUXILIAR: Calcular dígito de control simple
// =============================================
calcularDigitoControl(codigo) {
    const suma = codigo.split('').reduce((acc, digit, index) => {
        return acc + parseInt(digit) * (index % 2 === 0 ? 1 : 3);
    }, 0);
    return (10 - (suma % 10)) % 10;
}
}



module.exports = EtiquetasController;