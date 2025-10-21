// =============================================
// controllers/MovimientosController.js - Controlador de Movimientos
// =============================================
const MovimientoStock = require('../models/MovimientoStock');
const StockDeposito = require('../models/StockDeposito');
const db = require('../config/database');
const logger = require('../config/logger');

class MovimientosController {
    // Obtener movimientos con filtros
    async getMovimientos(req, res) {
        try {
            const {
                tipo_movimiento,
                fecha_desde,
                fecha_hasta,
                deposito_id,
                mercaderia_id,
                limite = 100,
                pagina = 1
            } = req.query;

            let whereClause = 'WHERE 1=1';
            let params = [];

            if (tipo_movimiento) {
                whereClause += ' AND ms.tipo_movimiento = ?';
                params.push(tipo_movimiento);
            }

            if (fecha_desde) {
                whereClause += ' AND DATE(ms.fecha_movimiento) >= ?';
                params.push(fecha_desde);
            }

            if (fecha_hasta) {
                whereClause += ' AND DATE(ms.fecha_movimiento) <= ?';
                params.push(fecha_hasta);
            }

            if (deposito_id) {
                whereClause += ' AND (ms.deposito_origen_id = ? OR ms.deposito_destino_id = ?)';
                params.push(deposito_id, deposito_id);
            }

            if (mercaderia_id) {
                whereClause += ' AND ms.mercaderia_id = ?';
                params.push(mercaderia_id);
            }

            const offset = (parseInt(pagina) - 1) * parseInt(limite);

            const sql = `
                SELECT 
                    ms.*,
                    m.descripcion as mercaderia_descripcion,
                    m.codigo_sku,
                    do.nombre as deposito_origen_nombre,
                    do.tipo as deposito_origen_tipo,
                    dd.nombre as deposito_destino_nombre,
                    dd.tipo as deposito_destino_tipo,
                    u.nombre as usuario_nombre
                FROM movimientos_stock ms
                JOIN mercaderias m ON ms.mercaderia_id = m.id
                LEFT JOIN depositos do ON ms.deposito_origen_id = do.id
                LEFT JOIN depositos dd ON ms.deposito_destino_id = dd.id
                LEFT JOIN usuarios u ON ms.usuario_id = u.id
                ${whereClause}
                ORDER BY ms.fecha_movimiento DESC
                LIMIT ? OFFSET ?
            `;

            params.push(parseInt(limite), offset);
            const movimientos = await db.query(sql, params);

            // Contar total
            const countSql = `
                SELECT COUNT(*) as total
                FROM movimientos_stock ms
                JOIN mercaderias m ON ms.mercaderia_id = m.id
                ${whereClause}
            `;
            const countParams = params.slice(0, -2);
            const totalResult = await db.query(countSql, countParams);
            const total = totalResult[0].total;

            res.json({
                success: true,
                data: movimientos,
                pagination: {
                    total,
                    pagina: parseInt(pagina),
                    limite: parseInt(limite),
                    total_paginas: Math.ceil(total / parseInt(limite))
                }
            });

        } catch (error) {
            logger.error('Error en getMovimientos:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener movimientos',
                error: error.message
            });
        }
    }

    // Registrar devolución
    async registrarDevolucion(req, res) {
        try {
            const {
                mercaderia_id,
                deposito_origen_id,
                deposito_destino_id,
                cantidad,
                motivo,
                numero_documento,
                observaciones
            } = req.body;

            // Validar stock disponible en origen
            const stockOrigen = await StockDeposito.findByMercaderiaDeposito(mercaderia_id, deposito_origen_id);
            if (!stockOrigen || stockOrigen.cantidad < cantidad) {
                return res.status(400).json({
                    success: false,
                    message: 'Stock insuficiente para la devolución'
                });
            }

            // Registrar movimiento
            const movimientoId = await MovimientoStock.registrarMovimiento({
                tipo_movimiento: 'DEVOLUCION',
                mercaderia_id,
                deposito_origen_id,
                deposito_destino_id,
                cantidad,
                motivo,
                numero_documento,
                observaciones,
                usuario_id: req.user.id
            });

            res.status(201).json({
                success: true,
                message: 'Devolución registrada exitosamente',
                movimiento_id: movimientoId
            });

        } catch (error) {
            logger.error('Error en registrarDevolucion:', error);
            res.status(500).json({
                success: false,
                message: 'Error al registrar devolución',
                error: error.message
            });
        }
    }

    // Registrar ajuste de stock (faltante o ajuste manual)
    async registrarAjuste(req, res) {
        try {
            const {
                mercaderia_id,
                deposito_id,
                cantidad,
                tipo_ajuste,
                motivo,
                observaciones
            } = req.body;

            // Para faltantes, la cantidad debe ser negativa
            let cantidadFinal = cantidad;
            if (tipo_ajuste === 'FALTANTE' && cantidad > 0) {
                cantidadFinal = -Math.abs(cantidad);
            }

            // Verificar que no se vaya a quedar en negativo
            if (cantidadFinal < 0) {
                const stockActual = await StockDeposito.findByMercaderiaDeposito(mercaderia_id, deposito_id);
                const stockDisponible = stockActual?.cantidad || 0;
                
                if (stockDisponible + cantidadFinal < 0) {
                    return res.status(400).json({
                        success: false,
                        message: `No se puede ajustar. Stock resultante sería negativo. Stock actual: ${stockDisponible}`
                    });
                }
            }

            // Determinar depósito origen/destino según si es suma o resta
            const depositoOrigenId = cantidadFinal < 0 ? deposito_id : null;
            const depositoDestinoId = cantidadFinal > 0 ? deposito_id : null;

            // Registrar movimiento
            const movimientoId = await MovimientoStock.registrarMovimiento({
                tipo_movimiento: tipo_ajuste,
                mercaderia_id,
                deposito_origen_id: depositoOrigenId,
                deposito_destino_id: depositoDestinoId,
                cantidad: Math.abs(cantidadFinal),
                motivo,
                observaciones,
                usuario_id: req.user.id
            });

            res.status(201).json({
                success: true,
                message: `${tipo_ajuste} registrado exitosamente`,
                movimiento_id: movimientoId
            });

        } catch (error) {
            logger.error('Error en registrarAjuste:', error);
            res.status(500).json({
                success: false,
                message: 'Error al registrar ajuste',
                error: error.message
            });
        }
    }

    // Obtener movimientos por depósito
    async getMovimientosByDeposito(req, res) {
        try {
            const { depositoId } = req.params;
            const { limite = 50 } = req.query;

            const movimientos = await MovimientoStock.getMovimientosByDeposito(depositoId, limite);

            res.json({
                success: true,
                data: movimientos,
                total: movimientos.length
            });

        } catch (error) {
            logger.error('Error en getMovimientosByDeposito:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener movimientos del depósito',
                error: error.message
            });
        }
    }

    // Obtener movimientos por mercadería
    async getMovimientosByMercaderia(req, res) {
        try {
            const { mercaderiaId } = req.params;
            const { limite = 50 } = req.query;

            const movimientos = await MovimientoStock.getMovimientosByMercaderia(mercaderiaId, limite);

            res.json({
                success: true,
                data: movimientos,
                total: movimientos.length
            });

        } catch (error) {
            logger.error('Error en getMovimientosByMercaderia:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener movimientos de la mercadería',
                error: error.message
            });
        }
    }

    // Obtener movimiento por ID
    async getMovimientoById(req, res) {
        try {
            const { id } = req.params;

            const sql = `
                SELECT 
                    ms.*,
                    m.descripcion as mercaderia_descripcion,
                    m.codigo_sku,
                    do.nombre as deposito_origen_nombre,
                    do.tipo as deposito_origen_tipo,
                    dd.nombre as deposito_destino_nombre,
                    dd.tipo as deposito_destino_tipo,
                    u.nombre as usuario_nombre
                FROM movimientos_stock ms
                JOIN mercaderias m ON ms.mercaderia_id = m.id
                LEFT JOIN depositos do ON ms.deposito_origen_id = do.id
                LEFT JOIN depositos dd ON ms.deposito_destino_id = dd.id
                LEFT JOIN usuarios u ON ms.usuario_id = u.id
                WHERE ms.id = ?
            `;

            const movimientos = await db.query(sql, [id]);
            const movimiento = movimientos[0];

            if (!movimiento) {
                return res.status(404).json({
                    success: false,
                    message: 'Movimiento no encontrado'
                });
            }

            res.json({
                success: true,
                data: movimiento
            });

        } catch (error) {
            logger.error('Error en getMovimientoById:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener movimiento',
                error: error.message
            });
        }
    }

    // Resumen de movimientos
    async getResumenMovimientos(req, res) {
        try {
            const { fecha_desde, fecha_hasta } = req.query;

            let whereClause = '';
            let params = [];

            if (fecha_desde && fecha_hasta) {
                whereClause = 'WHERE DATE(fecha_movimiento) BETWEEN ? AND ?';
                params = [fecha_desde, fecha_hasta];
            } else {
                // Por defecto, último mes
                whereClause = 'WHERE fecha_movimiento >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
            }

            const sql = `
                SELECT 
                    tipo_movimiento,
                    COUNT(*) as cantidad_movimientos,
                    SUM(cantidad) as cantidad_total,
                    SUM(cantidad * COALESCE(precio_unitario, 0)) as valor_total
                FROM movimientos_stock
                ${whereClause}
                GROUP BY tipo_movimiento
                ORDER BY cantidad_movimientos DESC
            `;

            const resumen = await db.query(sql, params);

            res.json({
                success: true,
                data: resumen
            });

        } catch (error) {
            logger.error('Error en getResumenMovimientos:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener resumen de movimientos',
                error: error.message
            });
        }
    }

// FUNCIÓN FALTANTE: getMovimientos (alias de index para compatibilidad)
// El método getMovimientos ya está definido arriba, así que no se debe redefinir aquí.

// FUNCIÓN FALTANTE: getMovimientoById (alias de show para compatibilidad)
// El método getMovimientoById ya está definido arriba, así que no se debe redefinir aquí.

// FUNCIÓN AUXILIAR: Validar movimiento antes de crearlo
async validarMovimiento(datos) {
    const errores = [];
    
    // Validar campos requeridos
    if (!datos.mercaderia_id) errores.push('mercaderia_id es requerido');
    if (!datos.cantidad || datos.cantidad <= 0) errores.push('cantidad debe ser mayor a 0');
    if (!datos.tipo_movimiento) errores.push('tipo_movimiento es requerido');
    
    // Validar que la mercadería existe
    if (datos.mercaderia_id) {
        const [mercaderia] = await db.query(
            'SELECT id FROM mercaderias WHERE id = ? AND activo = 1',
            [datos.mercaderia_id]
        );
        if (!mercaderia.length) {
            errores.push('La mercadería no existe o está inactiva');
        }
    }
    
    // Validar depósitos si se proporcionan
    if (datos.deposito_origen_id) {
        const [depositoOrigen] = await db.query(
            'SELECT id FROM depositos WHERE id = ? AND activo = 1',
            [datos.deposito_origen_id]
        );
        if (!depositoOrigen.length) {
            errores.push('El depósito origen no existe o está inactivo');
        }
    }
    
    if (datos.deposito_destino_id) {
        const [depositoDestino] = await db.query(
            'SELECT id FROM depositos WHERE id = ? AND activo = 1',
            [datos.deposito_destino_id]
        );
        if (!depositoDestino.length) {
            errores.push('El depósito destino no existe o está inactivo');
        }
    }
    
    // Validar coherencia del tipo de movimiento
    if (['COMPRA', 'INCREMENTO'].includes(datos.tipo_movimiento) && !datos.deposito_destino_id) {
        errores.push('Movimientos de ingreso requieren depósito destino');
    }
    
    if (['DECREMENTO'].includes(datos.tipo_movimiento) && !datos.deposito_origen_id) {
        errores.push('Movimientos de salida requieren depósito origen');
    }
    
    if (['TRANSFERENCIA'].includes(datos.tipo_movimiento)) {
        if (!datos.deposito_origen_id || !datos.deposito_destino_id) {
            errores.push('Transferencias requieren depósito origen y destino');
        }
        if (datos.deposito_origen_id === datos.deposito_destino_id) {
            errores.push('El depósito origen y destino no pueden ser el mismo');
        }
    }
    
    return errores;
}

// FUNCIÓN AUXILIAR: Obtener siguiente número de documento
async generarNumeroDocumento(tipoMovimiento) {
    const prefijo = {
        'COMPRA': 'COMP',
        'TRANSFERENCIA': 'TRF',
        'INCREMENTO': 'INC',
        'DECREMENTO': 'DEC',
        'DEVOLUCION': 'DEV',
        'AJUSTE': 'ADJ'
    }[tipoMovimiento] || 'MOV';
    
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    
    return `${prefijo}-${timestamp}-${random}`;
}

// FUNCIÓN AUXILIAR: Calcular stock después del movimiento
async calcularStockPostMovimiento(mercaderia_id, deposito_id, movimiento_id) {
    try {
        const [stock] = await db.query(`
            SELECT 
                SUM(CASE 
                    WHEN ms.deposito_destino_id = ? THEN ms.cantidad
                    WHEN ms.deposito_origen_id = ? THEN -ms.cantidad
                    ELSE 0
                END) as stock_calculado
            FROM movimientos_stock ms
            WHERE ms.mercaderia_id = ? 
            AND ms.id <= ?
            AND ms.fecha_movimiento <= (
                SELECT fecha_movimiento 
                FROM movimientos_stock 
                WHERE id = ?
            )
        `, [deposito_id, deposito_id, mercaderia_id, movimiento_id, movimiento_id]);
        
        return stock[0]?.stock_calculado || 0;
    } catch (error) {
        logger.error('Error calculando stock post-movimiento:', error);
        return 0;
    }
}

// FUNCIÓN AUXILIAR: Obtener estadísticas rápidas de movimientos
async getEstadisticasRapidas(filtros = {}) {
    try {
        let whereConditions = ['1=1'];
        let queryParams = [];
        
        if (filtros.fecha_desde) {
            whereConditions.push('DATE(ms.fecha_movimiento) >= ?');
            queryParams.push(filtros.fecha_desde);
        }
        
        if (filtros.fecha_hasta) {
            whereConditions.push('DATE(ms.fecha_movimiento) <= ?');
            queryParams.push(filtros.fecha_hasta);
        }
        
        const whereClause = whereConditions.join(' AND ');
        
        const [estadisticas] = await db.query(`
            SELECT 
                COUNT(*) as total_movimientos,
                COUNT(DISTINCT mercaderia_id) as mercaderias_afectadas,
                COUNT(DISTINCT COALESCE(deposito_origen_id, deposito_destino_id)) as depositos_involucrados,
                SUM(cantidad) as cantidad_total_movida,
                SUM(cantidad * COALESCE(precio_unitario, 0)) as valor_total_movido,
                AVG(cantidad) as cantidad_promedio,
                
                -- Por tipo de movimiento
                COUNT(CASE WHEN tipo_movimiento = 'COMPRA' THEN 1 END) as compras,
                COUNT(CASE WHEN tipo_movimiento = 'TRANSFERENCIA' THEN 1 END) as transferencias,
                COUNT(CASE WHEN tipo_movimiento = 'INCREMENTO' THEN 1 END) as incrementos,
                COUNT(CASE WHEN tipo_movimiento = 'DECREMENTO' THEN 1 END) as decrementos,
                COUNT(CASE WHEN tipo_movimiento = 'DEVOLUCION' THEN 1 END) as devoluciones,
                
                -- Fechas
                MIN(fecha_movimiento) as primer_movimiento,
                MAX(fecha_movimiento) as ultimo_movimiento
                
            FROM movimientos_stock ms
            WHERE ${whereClause}
        `, queryParams);
        
        return estadisticas[0];
    } catch (error) {
        logger.error('Error obteniendo estadísticas rápidas:', error);
        return null;
    }
}

// FUNCIÓN AUXILIAR: Detectar movimientos duplicados potenciales
async detectarMovimientosDuplicados(mercaderia_id, deposito_origen_id, deposito_destino_id, cantidad, tiempo_ventana_minutos = 5) {
    try {
        const [duplicados] = await db.query(`
            SELECT *
            FROM movimientos_stock
            WHERE mercaderia_id = ?
            AND deposito_origen_id = ?
            AND deposito_destino_id = ?
            AND cantidad = ?
            AND fecha_movimiento >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
            ORDER BY fecha_movimiento DESC
            LIMIT 5
        `, [mercaderia_id, deposito_origen_id, deposito_destino_id, cantidad, tiempo_ventana_minutos]);
        
        return duplicados;
    } catch (error) {
        logger.error('Error detectando duplicados:', error);
        return [];
    }
}

// FUNCIÓN AUXILIAR: Limpiar movimientos huérfanos (sin mercadería o depósito válido)
async limpiarMovimientosHuerfanos() {
    try {
        // Obtener movimientos con mercaderías inexistentes
        const [huerfanosMercaderia] = await db.query(`
            SELECT ms.id
            FROM movimientos_stock ms
            LEFT JOIN mercaderias m ON ms.mercaderia_id = m.id
            WHERE m.id IS NULL
        `);
        
        // Obtener movimientos con depósitos inexistentes
        const [huerfanosDeposito] = await db.query(`
            SELECT DISTINCT ms.id
            FROM movimientos_stock ms
            LEFT JOIN depositos do ON ms.deposito_origen_id = do.id
            LEFT JOIN depositos dd ON ms.deposito_destino_id = dd.id
            WHERE (ms.deposito_origen_id IS NOT NULL AND do.id IS NULL)
            OR (ms.deposito_destino_id IS NOT NULL AND dd.id IS NULL)
        `);
        
        const totalHuerfanos = huerfanosMercaderia.length + huerfanosDeposito.length;
        
        logger.warn(`Detectados ${totalHuerfanos} movimientos huérfanos`, {
            huerfanos_mercaderia: huerfanosMercaderia.length,
            huerfanos_deposito: huerfanosDeposito.length
        });
        
        return {
            huerfanos_mercaderia: huerfanosMercaderia,
            huerfanos_deposito: huerfanosDeposito,
            total: totalHuerfanos
        };
    } catch (error) {
        logger.error('Error limpiando movimientos huérfanos:', error);
        return null;
    }
}

// =============================================
// INDEX - Listar movimientos con filtros avanzados
// =============================================
async index(req, res) {
        try {
            const {
                // Filtros básicos
                tipo_movimiento,
                tipo, // Alias para compatibilidad con ruta /tipo/:tipo
                fecha_desde,
                fecha_hasta,
                deposito_id,
                mercaderia_id,
                usuario_id,
                numero_documento,
                
                // Filtros de búsqueda
                search, // Búsqueda general
                codigo_mercaderia, // Buscar por código SKU o Code128
                descripcion_mercaderia, // Buscar por descripción
                
                // Filtros de estado y cantidad
                cantidad_min,
                cantidad_max,
                con_precio = null, // true/false - solo movimientos con precio
                
                // Paginación y ordenamiento
                page = 1,
                limit = 100,
                order_by = 'fecha_movimiento',
                order_dir = 'DESC',
                
                // Opciones de respuesta
                include_totals = true,
                include_stats = false,
                formato = 'json' // json, csv
            } = req.query;

            // Validar parámetros de entrada
            const pageNum = Math.max(1, parseInt(page) || 1);
            const limitNum = Math.min(1000, Math.max(1, parseInt(limit) || 100));
            const offset = (pageNum - 1) * limitNum;

            // Construir condiciones WHERE
            let whereConditions = ['1=1'];
            let queryParams = [];

            // Filtro por tipo de movimiento (soporta ambos nombres de parámetro)
            const tipoFiltro = tipo_movimiento || tipo;
            if (tipoFiltro) {
                if (Array.isArray(tipoFiltro)) {
                    // Múltiples tipos: ?tipo_movimiento=COMPRA&tipo_movimiento=TRANSFERENCIA
                    const placeholders = tipoFiltro.map(() => '?').join(',');
                    whereConditions.push(`ms.tipo_movimiento IN (${placeholders})`);
                    queryParams.push(...tipoFiltro);
                } else {
                    whereConditions.push('ms.tipo_movimiento = ?');
                    queryParams.push(tipoFiltro);
                }
            }

            // Filtros de fecha
            if (fecha_desde) {
                whereConditions.push('DATE(ms.fecha_movimiento) >= ?');
                queryParams.push(fecha_desde);
            }

            if (fecha_hasta) {
                whereConditions.push('DATE(ms.fecha_movimiento) <= ?');
                queryParams.push(fecha_hasta);
            }

            // Filtro por depósito (origen o destino)
            if (deposito_id) {
                whereConditions.push('(ms.deposito_origen_id = ? OR ms.deposito_destino_id = ?)');
                queryParams.push(deposito_id, deposito_id);
            }

            // Filtro por mercadería
            if (mercaderia_id) {
                if (Array.isArray(mercaderia_id)) {
                    const placeholders = mercaderia_id.map(() => '?').join(',');
                    whereConditions.push(`ms.mercaderia_id IN (${placeholders})`);
                    queryParams.push(...mercaderia_id);
                } else {
                    whereConditions.push('ms.mercaderia_id = ?');
                    queryParams.push(mercaderia_id);
                }
            }

            // Filtro por usuario
            if (usuario_id) {
                whereConditions.push('ms.usuario_id = ?');
                queryParams.push(usuario_id);
            }

            // Filtro por número de documento
            if (numero_documento) {
                whereConditions.push('ms.numero_documento LIKE ?');
                queryParams.push(`%${numero_documento}%`);
            }

            // Búsqueda general
            if (search) {
                whereConditions.push(`(
                    m.descripcion LIKE ? OR 
                    m.codigo_sku LIKE ? OR 
                    ms.motivo LIKE ? OR 
                    ms.numero_documento LIKE ? OR
                    ms.observaciones LIKE ? OR
                    do.nombre LIKE ? OR
                    dd.nombre LIKE ?
                )`);
                const searchTerm = `%${search}%`;
                queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
            }

            // Filtro por código de mercadería
            if (codigo_mercaderia) {
                whereConditions.push('(m.codigo_sku LIKE ? )');
                queryParams.push(`%${codigo_mercaderia}%`, `%${codigo_mercaderia}%`);
            }

            // Filtro por descripción de mercadería
            if (descripcion_mercaderia) {
                whereConditions.push('m.descripcion LIKE ?');
                queryParams.push(`%${descripcion_mercaderia}%`);
            }

            // Filtros de cantidad
            if (cantidad_min) {
                whereConditions.push('ms.cantidad >= ?');
                queryParams.push(parseFloat(cantidad_min));
            }

            if (cantidad_max) {
                whereConditions.push('ms.cantidad <= ?');
                queryParams.push(parseFloat(cantidad_max));
            }

            // Filtro por movimientos con precio
            if (con_precio === 'true') {
                whereConditions.push('ms.precio_unitario IS NOT NULL AND ms.precio_unitario > 0');
            } else if (con_precio === 'false') {
                whereConditions.push('(ms.precio_unitario IS NULL OR ms.precio_unitario = 0)');
            }

            const whereClause = whereConditions.join(' AND ');

            // Validar campo de ordenamiento
            const validOrderFields = [
                'fecha_movimiento', 'tipo_movimiento', 'cantidad', 'precio_unitario',
                'mercaderia_descripcion', 'numero_documento', 'motivo'
            ];
            const orderField = validOrderFields.includes(order_by) ? 
                (order_by === 'mercaderia_descripcion' ? 'm.descripcion' : `ms.${order_by}`) : 
                'ms.fecha_movimiento';
            const orderDirection = order_dir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

            // Query principal con todos los joins necesarios
            const sql = `
                SELECT 
                    ms.id,
                    ms.tipo_movimiento,
                    ms.mercaderia_id,
                    ms.deposito_origen_id,
                    ms.deposito_destino_id,
                    ms.cantidad,
                    ms.precio_unitario,
                    ms.motivo,
                    ms.numero_documento,
                    ms.observaciones,
                    ms.usuario_id,
                    ms.fecha_movimiento,
                    ms.created_at,
                    ms.updated_at,
                    
                    -- Información de mercadería
                    m.descripcion as mercaderia_descripcion,
                    m.codigo_sku,
                    m.precio_venta,
                    m.precio_costo,
                    c.categoria as categoria,
                    
                    -- Depósito origen con entidades
                    do.nombre as deposito_origen_nombre,
                    do.tipo as deposito_origen_tipo,
                    do.direccion as deposito_origen_direccion,
                    CASE 
                        WHEN do.tipo = 'VENDEDOR' THEN vo.razonSocial
                        WHEN do.tipo = 'CLIENTE' THEN co.razonSocial
                        ELSE do.nombre
                    END as entidad_origen_nombre,
                    
                    -- Depósito destino con entidades
                    dd.nombre as deposito_destino_nombre,
                    dd.tipo as deposito_destino_tipo,
                    dd.direccion as deposito_destino_direccion,
                    CASE 
                        WHEN dd.tipo = 'VENDEDOR' THEN vd.razonSocial
                        WHEN dd.tipo = 'CLIENTE' THEN cd.razonSocial
                        ELSE dd.nombre
                    END as entidad_destino_nombre,
                    
                    -- Usuario
                    u.nombre as usuario_nombre,
                    u.email as usuario_email,
                    
                    -- Cálculos adicionales
                    (ms.cantidad * COALESCE(ms.precio_unitario, m.precio_costo, 0)) as valor_total,
                    
                    -- Estado del movimiento (basado en tipo)
                    CASE 
                        WHEN ms.tipo_movimiento IN ('COMPRA', 'INCREMENTO', 'DEVOLUCION') THEN 'INGRESO'
                        WHEN ms.tipo_movimiento IN ('TRANSFERENCIA', 'DECREMENTO') THEN 'SALIDA'
                        ELSE 'AJUSTE'
                    END as categoria_movimiento,
                    
                    -- Indicadores útiles
                    CASE 
                        WHEN ms.precio_unitario IS NOT NULL AND ms.precio_unitario > 0 THEN 1
                        ELSE 0
                    END as tiene_precio,
                    
                    CASE 
                        WHEN ms.numero_documento IS NOT NULL AND ms.numero_documento != '' THEN 1
                        ELSE 0
                    END as tiene_documento,
                    
                    -- Días desde el movimiento
                    DATEDIFF(NOW(), ms.fecha_movimiento) as dias_desde_movimiento

                FROM movimientos_stock ms
                INNER JOIN mercaderias m ON ms.mercaderia_id = m.id
                LEFT JOIN categorias c ON m.id_categoria = c.id
                
                -- Depósito origen con entidades
                LEFT JOIN depositos do ON ms.deposito_origen_id = do.id
                LEFT JOIN vendedores vo ON do.tipo = 'VENDEDOR' AND do.entity_id = vo.vendedorId
                LEFT JOIN clientes co ON do.tipo = 'CLIENTE' AND do.entity_id = co.clienteId
                
                -- Depósito destino con entidades
                LEFT JOIN depositos dd ON ms.deposito_destino_id = dd.id
                LEFT JOIN vendedores vd ON dd.tipo = 'VENDEDOR' AND dd.entity_id = vd.vendedorId
                LEFT JOIN clientes cd ON dd.tipo = 'CLIENTE' AND dd.entity_id = cd.clienteId
                
                -- Usuario
                LEFT JOIN usuarios u ON ms.usuario_id = u.id
                
                WHERE ${whereClause}
                ORDER BY ${orderField} ${orderDirection}
                LIMIT ? OFFSET ?
            `;

            queryParams.push(limitNum, offset);

            // Ejecutar query principal
            const movimientos = await db.query(sql, queryParams);

            // Preparar respuesta base
            const response = {
                success: true,
                data: movimientos,
                pagination: {
                    current_page: pageNum,
                    per_page: limitNum,
                    total: 0,
                    total_pages: 0,
                    has_next_page: false,
                    has_prev_page: pageNum > 1
                },
                filtros_aplicados: {
                    tipo_movimiento: tipoFiltro,
                    fecha_desde,
                    fecha_hasta,
                    deposito_id,
                    mercaderia_id,
                    usuario_id,
                    numero_documento,
                    search,
                    codigo_mercaderia,
                    descripcion_mercaderia,
                    cantidad_min,
                    cantidad_max,
                    con_precio
                }
            };

            // Obtener conteo total si se solicita
            if (include_totals === 'true' || include_totals === true) {
                const countSql = `
                    SELECT COUNT(*) as total
                    FROM movimientos_stock ms
                    INNER JOIN mercaderias m ON ms.mercaderia_id = m.id
                    LEFT JOIN categorias c ON m.id_categoria = c.id
                    LEFT JOIN depositos do ON ms.deposito_origen_id = do.id
                    LEFT JOIN vendedores vo ON do.tipo = 'VENDEDOR' AND do.entity_id = vo.vendedorId
                    LEFT JOIN clientes co ON do.tipo = 'CLIENTE' AND do.entity_id = co.clienteId
                    LEFT JOIN depositos dd ON ms.deposito_destino_id = dd.id
                    LEFT JOIN vendedores vd ON dd.tipo = 'VENDEDOR' AND dd.entity_id = vd.vendedorId
                    LEFT JOIN clientes cd ON dd.tipo = 'CLIENTE' AND dd.entity_id = cd.clienteId
                    LEFT JOIN usuarios u ON ms.usuario_id = u.id
                    WHERE ${whereClause}
                `;
                
                const countParams = queryParams.slice(0, -2); // Remover limit y offset
                const countResult = await db.query(countSql, countParams);
                const totalRecords = countResult[0].total;

                response.pagination.total = totalRecords;
                response.pagination.total_pages = Math.ceil(totalRecords / limitNum);
                response.pagination.has_next_page = pageNum < response.pagination.total_pages;
            }

            // Agregar estadísticas del resultado si se solicita
            if (include_stats === 'true' || include_stats === true) {
                response.resumen = {
                    total_movimientos: movimientos.length,
                    ingresos: movimientos.filter(m => m.categoria_movimiento === 'INGRESO').length,
                    salidas: movimientos.filter(m => m.categoria_movimiento === 'SALIDA').length,
                    ajustes: movimientos.filter(m => m.categoria_movimiento === 'AJUSTE').length,
                    valor_total_movimientos: movimientos.reduce((sum, m) => sum + (m.valor_total || 0), 0),
                    cantidad_total_movida: movimientos.reduce((sum, m) => sum + (m.cantidad || 0), 0),
                    tipos_movimiento: [...new Set(movimientos.map(m => m.tipo_movimiento))],
                    mercaderias_afectadas: [...new Set(movimientos.map(m => m.mercaderia_id))].length,
                    depositos_involucrados: [
                        ...new Set([
                            ...movimientos.map(m => m.deposito_origen_id).filter(Boolean),
                            ...movimientos.map(m => m.deposito_destino_id).filter(Boolean)
                        ])
                    ].length,
                    usuarios_activos: [...new Set(movimientos.map(m => m.usuario_id).filter(Boolean))].length,
                    con_precio: movimientos.filter(m => m.tiene_precio === 1).length,
                    con_documento: movimientos.filter(m => m.tiene_documento === 1).length,
                    
                    // Estadísticas por período
                    por_dia: {},
                    por_tipo: {}
                };

                // Agrupar por día
                movimientos.forEach(m => {
                    const fecha = m.fecha_movimiento.toISOString().split('T')[0];
                    if (!response.resumen.por_dia[fecha]) {
                        response.resumen.por_dia[fecha] = { cantidad: 0, movimientos: 0, valor: 0 };
                    }
                    response.resumen.por_dia[fecha].cantidad += m.cantidad;
                    response.resumen.por_dia[fecha].movimientos += 1;
                    response.resumen.por_dia[fecha].valor += m.valor_total || 0;
                });

                // Agrupar por tipo
                movimientos.forEach(m => {
                    if (!response.resumen.por_tipo[m.tipo_movimiento]) {
                        response.resumen.por_tipo[m.tipo_movimiento] = { cantidad: 0, movimientos: 0, valor: 0 };
                    }
                    response.resumen.por_tipo[m.tipo_movimiento].cantidad += m.cantidad;
                    response.resumen.por_tipo[m.tipo_movimiento].movimientos += 1;
                    response.resumen.por_tipo[m.tipo_movimiento].valor += m.valor_total || 0;
                });
            }

            // Log de la consulta para debugging (solo en desarrollo)
            if (process.env.NODE_ENV === 'development') {
                logger.debug('Consulta de movimientos ejecutada', {
                    filtros: response.filtros_aplicados,
                    resultados: movimientos.length,
                    tiempo_respuesta: Date.now()
                });
            }

            // Devolver respuesta en formato solicitado
            if (formato === 'csv') {
                // Convertir a CSV y enviar como descarga
                const csvHeader = 'ID,Fecha,Tipo,Mercaderia,Codigo SKU,Cantidad,Valor Total,Deposito Origen,Deposito Destino,Usuario,Motivo,Documento\n';
                const csvRows = movimientos.map(m => 
                    `${m.id},"${m.fecha_movimiento}","${m.tipo_movimiento}","${m.mercaderia_descripcion || ''}","${m.codigo_sku || ''}",${m.cantidad},"${m.valor_total || 0}","${m.deposito_origen_nombre || ''}","${m.deposito_destino_nombre || ''}","${m.usuario_nombre || ''}","${m.motivo || ''}","${m.numero_documento || ''}"`
                ).join('\n');

                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename="movimientos_${new Date().toISOString().split('T')[0]}.csv"`);
                res.send(csvHeader + csvRows);
                return;
            }

            // Respuesta JSON (por defecto)
            res.json(response);

        } catch (error) {
            logger.error('Error en index movimientos:', {
                error: error.message,
                stack: error.stack,
                query_params: req.query,
                timestamp: new Date().toISOString()
            });

            res.status(500).json({
                success: false,
                message: 'Error al obtener movimientos',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Error interno del servidor',
                codigo_error: 'MOVIMIENTOS_INDEX_ERROR'
            });
        }
    }

    // =============================================
    // FUNCIÓN AUXILIAR: Validar parámetros de entrada
    // =============================================
    validateIndexParams(params) {
        const errors = [];
        const warnings = [];

        // Validar fechas
        if (params.fecha_desde && !this.isValidDate(params.fecha_desde)) {
            errors.push('fecha_desde debe tener formato YYYY-MM-DD');
        }

        if (params.fecha_hasta && !this.isValidDate(params.fecha_hasta)) {
            errors.push('fecha_hasta debe tener formato YYYY-MM-DD');
        }

        if (params.fecha_desde && params.fecha_hasta && params.fecha_desde > params.fecha_hasta) {
            errors.push('fecha_desde no puede ser mayor que fecha_hasta');
        }

        // Validar números
        if (params.page && (!Number.isInteger(+params.page) || +params.page < 1)) {
            errors.push('page debe ser un número entero mayor a 0');
        }

        if (params.limit && (!Number.isInteger(+params.limit) || +params.limit < 1 || +params.limit > 1000)) {
            errors.push('limit debe ser un número entero entre 1 y 1000');
        }

        // Validar IDs
        const idFields = ['deposito_id', 'mercaderia_id', 'usuario_id'];
        idFields.forEach(field => {
            if (params[field] && (!Number.isInteger(+params[field]) || +params[field] < 1)) {
                errors.push(`${field} debe ser un número entero mayor a 0`);
            }
        });

        // Validar orden
        const validOrderFields = ['fecha_movimiento', 'tipo_movimiento', 'cantidad', 'precio_unitario', 'mercaderia_descripcion', 'numero_documento', 'motivo'];
        if (params.order_by && !validOrderFields.includes(params.order_by)) {
            errors.push(`order_by debe ser uno de: ${validOrderFields.join(', ')}`);
        }

        if (params.order_dir && !['ASC', 'DESC'].includes(params.order_dir.toUpperCase())) {
            errors.push('order_dir debe ser ASC o DESC');
        }

        // Advertencias
        if (params.limit && +params.limit > 500) {
            warnings.push('Límite alto puede afectar el rendimiento. Considere usar paginación.');
        }

        if (!params.fecha_desde && !params.fecha_hasta && !params.deposito_id && !params.mercaderia_id) {
            warnings.push('Sin filtros específicos, la consulta puede ser lenta con muchos registros.');
        }

        return { errors, warnings };
    }

    // =============================================
    // FUNCIÓN AUXILIAR: Validar formato de fecha
    // =============================================
    isValidDate(dateString) {
        const regex = /^\d{4}-\d{2}-\d{2}$/;
        if (!regex.test(dateString)) return false;
        
        const date = new Date(dateString);
        const timestamp = date.getTime();
        
        if (typeof timestamp !== 'number' || Number.isNaN(timestamp)) return false;
        
        return dateString === date.toISOString().split('T')[0];
    }

    // =============================================
    // TOP MERCADERÍAS CON MÁS MOVIMIENTOS
    // =============================================
    async getTopMercaderiasMovimientos(req, res) {
        try {
            const {
                // Filtros básicos
                tipo_movimiento,
                fecha_desde,
                fecha_hasta,
                deposito_id,
                categoria_id,
                usuario_id,
                
                // Filtros específicos
                solo_activas = true,
                con_stock_actual = false,
                valor_minimo = null,
                
                // Configuración del top
                limit = 10,
                order_by = 'total_movimientos', // total_movimientos, cantidad_total_movida, valor_total_movido
                include_details = false,
                
                // Agrupación temporal
                agrupar_por_periodo = false, // Mostrar evolución temporal
                periodo = 'mes' // dia, semana, mes
            } = req.query;

            // Validar parámetros
            const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
            
            // Construir condiciones WHERE
            let whereConditions = ['1=1'];
            let queryParams = [];

            // Filtro por tipo de movimiento
            if (tipo_movimiento) {
                if (Array.isArray(tipo_movimiento)) {
                    const placeholders = tipo_movimiento.map(() => '?').join(',');
                    whereConditions.push(`ms.tipo_movimiento IN (${placeholders})`);
                    queryParams.push(...tipo_movimiento);
                } else {
                    whereConditions.push('ms.tipo_movimiento = ?');
                    queryParams.push(tipo_movimiento);
                }
            }

            // Filtros de fecha
            if (fecha_desde) {
                whereConditions.push('DATE(ms.fecha_movimiento) >= ?');
                queryParams.push(fecha_desde);
            }

            if (fecha_hasta) {
                whereConditions.push('DATE(ms.fecha_movimiento) <= ?');
                queryParams.push(fecha_hasta);
            }

            // Filtro por depósito
            if (deposito_id) {
                whereConditions.push('(ms.deposito_origen_id = ? OR ms.deposito_destino_id = ?)');
                queryParams.push(deposito_id, deposito_id);
            }

            // Filtro por categoría
            if (categoria_id) {
                whereConditions.push('c.id = ?');
                queryParams.push(categoria_id);
            }

            // Filtro por usuario
            if (usuario_id) {
                whereConditions.push('ms.usuario_id = ?');
                queryParams.push(usuario_id);
            }

            // Filtro solo mercaderías activas
            if (solo_activas === 'true' || solo_activas === true) {
                whereConditions.push('m.activo = 1');
            }

            const whereClause = whereConditions.join(' AND ');

            // Validar campo de ordenamiento
            const validOrderFields = {
                'total_movimientos': 'total_movimientos',
                'cantidad_total_movida': 'cantidad_total_movida',
                'valor_total_movido': 'valor_total_movido',
                'cantidad_promedio': 'cantidad_promedio_por_movimiento',
                'ultimo_movimiento': 'ultimo_movimiento',
                'frecuencia': 'frecuencia_movimientos'
            };
            
            const orderField = validOrderFields[order_by] || 'total_movimientos';

            // Query principal
            let sql = `
                SELECT 
                    m.id,
                    m.descripcion,
                    m.codigo_sku,
                    m.precio_venta,
                    m.precio_costo,
                    m.stock_minimo,
                    m.activo,
                    c.id as categoria_id,
                    c.categoria as categoria,
                    
                    -- Estadísticas de movimientos
                    COUNT(ms.id) as total_movimientos,
                    SUM(ms.cantidad) as cantidad_total_movida,
                    AVG(ms.cantidad) as cantidad_promedio_por_movimiento,
                    MIN(ms.cantidad) as cantidad_minima_movimiento,
                    MAX(ms.cantidad) as cantidad_maxima_movimiento,
                    
                    -- Valores monetarios
                    SUM(ms.cantidad * COALESCE(ms.precio_unitario, m.precio_costo, 0)) as valor_total_movido,
                    AVG(ms.cantidad * COALESCE(ms.precio_unitario, m.precio_costo, 0)) as valor_promedio_movimiento,
                    
                    -- Información temporal
                    MIN(ms.fecha_movimiento) as primer_movimiento,
                    MAX(ms.fecha_movimiento) as ultimo_movimiento,
                    DATEDIFF(MAX(ms.fecha_movimiento), MIN(ms.fecha_movimiento)) + 1 as dias_con_movimientos,
                    
                    -- Frecuencia (movimientos por día)
                    CASE 
                        WHEN DATEDIFF(MAX(ms.fecha_movimiento), MIN(ms.fecha_movimiento)) = 0 THEN COUNT(ms.id)
                        ELSE ROUND(COUNT(ms.id) / (DATEDIFF(MAX(ms.fecha_movimiento), MIN(ms.fecha_movimiento)) + 1), 2)
                    END as frecuencia_movimientos,
                    
                    -- Tipos de movimientos
                    GROUP_CONCAT(DISTINCT ms.tipo_movimiento ORDER BY ms.tipo_movimiento) as tipos_movimiento,
                    COUNT(DISTINCT ms.tipo_movimiento) as tipos_diferentes,
                    
                    -- Depósitos involucrados
                    COUNT(DISTINCT COALESCE(ms.deposito_origen_id, ms.deposito_destino_id)) as depositos_involucrados,
                    
                    -- Usuarios que movieron la mercadería
                    COUNT(DISTINCT ms.usuario_id) as usuarios_diferentes,
                    
                    -- Porcentajes por tipo de movimiento
                    ROUND(COUNT(CASE WHEN ms.tipo_movimiento = 'COMPRA' THEN 1 END) * 100.0 / COUNT(ms.id), 1) as porcentaje_compras,
                    ROUND(COUNT(CASE WHEN ms.tipo_movimiento = 'TRANSFERENCIA' THEN 1 END) * 100.0 / COUNT(ms.id), 1) as porcentaje_transferencias,
                    ROUND(COUNT(CASE WHEN ms.tipo_movimiento = 'INCREMENTO' THEN 1 END) * 100.0 / COUNT(ms.id), 1) as porcentaje_incrementos,
                    ROUND(COUNT(CASE WHEN ms.tipo_movimiento = 'DECREMENTO' THEN 1 END) * 100.0 / COUNT(ms.id), 1) as porcentaje_decrementos,
                    ROUND(COUNT(CASE WHEN ms.tipo_movimiento = 'DEVOLUCION' THEN 1 END) * 100.0 / COUNT(ms.id), 1) as porcentaje_devoluciones
                    
                FROM movimientos_stock ms
                INNER JOIN mercaderias m ON ms.mercaderia_id = m.id
                LEFT JOIN categorias c ON m.id_categoria = c.id
                WHERE ${whereClause}
                GROUP BY m.id, m.descripcion, m.codigo_sku,  m.precio_venta, 
                         m.precio_costo, m.stock_minimo, m.activo, c.id, c.categoria
            `;

            // Filtro por valor mínimo (después del GROUP BY)
            if (valor_minimo && parseFloat(valor_minimo) > 0) {
                sql += ` HAVING valor_total_movido >= ${parseFloat(valor_minimo)}`;
            }

            sql += ` ORDER BY ${orderField} DESC LIMIT ?`;
            queryParams.push(limitNum);

            const topMercaderias = await db.query(sql, queryParams);

            // Agregar stock actual si se solicita
            if (con_stock_actual === 'true' || con_stock_actual === true) {
                for (let mercaderia of topMercaderias) {
                    const stockActual = await db.query(`
                        SELECT 
                            SUM(CASE WHEN d.tipo = 'CENTRAL' THEN sd.cantidad ELSE 0 END) as stock_central,
                            SUM(CASE WHEN d.tipo = 'VENDEDOR' THEN sd.cantidad ELSE 0 END) as stock_vendedores,
                            SUM(CASE WHEN d.tipo = 'CLIENTE' THEN sd.cantidad ELSE 0 END) as stock_clientes,
                            SUM(sd.cantidad) as stock_total,
                            COUNT(DISTINCT sd.deposito_id) as depositos_con_stock
                        FROM stock_depositos sd
                        INNER JOIN depositos d ON sd.deposito_id = d.id
                        WHERE sd.mercaderia_id = ? AND sd.cantidad > 0 AND d.activo = 1
                    `, [mercaderia.id]);

                    if (stockActual.length > 0) {
                        mercaderia.stock_actual = stockActual[0];
                    } else {
                        mercaderia.stock_actual = {
                            stock_central: 0,
                            stock_vendedores: 0,
                            stock_clientes: 0,
                            stock_total: 0,
                            depositos_con_stock: 0
                        };
                    }
                }
            }

            // Agregar detalles adicionales si se solicita
            if (include_details === 'true' || include_details === true) {
                for (let mercaderia of topMercaderias) {
                    // Últimos 5 movimientos
                    const ultimosMovimientos = await db.query(`
                        SELECT 
                            ms.id,
                            ms.tipo_movimiento,
                            ms.cantidad,
                            ms.fecha_movimiento,
                            ms.motivo,
                            do.nombre as deposito_origen,
                            dd.nombre as deposito_destino,
                            u.nombre as usuario
                        FROM movimientos_stock ms
                        LEFT JOIN depositos do ON ms.deposito_origen_id = do.id
                        LEFT JOIN depositos dd ON ms.deposito_destino_id = dd.id
                        LEFT JOIN usuarios u ON ms.usuario_id = u.id
                        WHERE ms.mercaderia_id = ?
                        ORDER BY ms.fecha_movimiento DESC
                        LIMIT 5
                    `, [mercaderia.id]);

                    mercaderia.ultimos_movimientos = ultimosMovimientos;

                    // Depósitos más frecuentes
                    const depositosFrecuentes = await db.query(`
                        SELECT 
                            COALESCE(do.nombre, dd.nombre) as deposito_nombre,
                            COALESCE(do.tipo, dd.tipo) as deposito_tipo,
                            COUNT(*) as movimientos_count,
                            SUM(ms.cantidad) as cantidad_total
                        FROM movimientos_stock ms
                        LEFT JOIN depositos do ON ms.deposito_origen_id = do.id
                        LEFT JOIN depositos dd ON ms.deposito_destino_id = dd.id
                        WHERE ms.mercaderia_id = ?
                        AND (do.id IS NOT NULL OR dd.id IS NOT NULL)
                        GROUP BY COALESCE(do.id, dd.id), COALESCE(do.nombre, dd.nombre), COALESCE(do.tipo, dd.tipo)
                        ORDER BY movimientos_count DESC
                        LIMIT 3
                    `, [mercaderia.id]);

                    mercaderia.depositos_frecuentes = depositosFrecuentes;
                }
            }

            // Agregar evolución temporal si se solicita
            if (agrupar_por_periodo === 'true' || agrupar_por_periodo === true) {
                let groupByClause, dateFormat;
                switch (periodo) {
                    case 'dia':
                        groupByClause = 'DATE(ms.fecha_movimiento)';
                        dateFormat = '%Y-%m-%d';
                        break;
                    case 'semana':
                        groupByClause = 'YEARWEEK(ms.fecha_movimiento)';
                        dateFormat = 'Semana %u %Y';
                        break;
                    case 'mes':
                    default:
                        groupByClause = 'DATE_FORMAT(ms.fecha_movimiento, "%Y-%m")';
                        dateFormat = '%Y-%m';
                        break;
                }

                for (let mercaderia of topMercaderias) {
                    const evolucionTemporal = await db.query(`
                        SELECT 
                            ${groupByClause} as periodo,
                            DATE_FORMAT(MIN(ms.fecha_movimiento), '${dateFormat}') as fecha_display,
                            COUNT(*) as movimientos,
                            SUM(ms.cantidad) as cantidad_total,
                            GROUP_CONCAT(DISTINCT ms.tipo_movimiento) as tipos_movimiento
                        FROM movimientos_stock ms
                        WHERE ms.mercaderia_id = ?
                        ${whereClause.replace('1=1', 'ms.mercaderia_id = ?') !== whereClause ? 
                          `AND ${whereClause.replace('ms.mercaderia_id = m.id', '1=1')}` : ''}
                        GROUP BY ${groupByClause}
                        ORDER BY periodo DESC
                        LIMIT 12
                    `, [mercaderia.id, ...queryParams.slice(0, -1)]);

                    mercaderia.evolucion_temporal = evolucionTemporal.reverse(); // Orden cronológico
                }
            }

            // Calcular estadísticas generales del resultado
            const resumen = {
                total_mercaderias: topMercaderias.length,
                movimientos_total: topMercaderias.reduce((sum, m) => sum + m.total_movimientos, 0),
                cantidad_total_movida: topMercaderias.reduce((sum, m) => sum + (m.cantidad_total_movida || 0), 0),
                valor_total_movido: topMercaderias.reduce((sum, m) => sum + (m.valor_total_movido || 0), 0),
                promedio_movimientos_por_mercaderia: topMercaderias.length > 0 ? 
                    Math.round(topMercaderias.reduce((sum, m) => sum + m.total_movimientos, 0) / topMercaderias.length) : 0,
                categorias_representadas: [...new Set(topMercaderias.map(m => m.categoria).filter(Boolean))].length,
                tipos_movimiento_general: [...new Set(
                    topMercaderias.flatMap(m => m.tipos_movimiento ? m.tipos_movimiento.split(',') : [])
                )],
                rango_fechas: {
                    primer_movimiento: topMercaderias.reduce((min, m) => 
                        !min || m.primer_movimiento < min ? m.primer_movimiento : min, null),
                    ultimo_movimiento: topMercaderias.reduce((max, m) => 
                        !max || m.ultimo_movimiento > max ? m.ultimo_movimiento : max, null)
                }
            };

            // Log para auditoría
            logger.info('Consulta top mercaderías ejecutada', {
                filtros: { 
                    tipo_movimiento, fecha_desde, fecha_hasta, deposito_id, categoria_id,
                    limit: limitNum, order_by 
                },
                resultados: topMercaderias.length,
                usuario_id: req.user?.id,
                timestamp: new Date().toISOString()
            });

            res.json({
                success: true,
                data: topMercaderias,
                resumen,
                configuracion: {
                    limit: limitNum,
                    order_by,
                    con_stock_actual,
                    include_details,
                    agrupar_por_periodo,
                    periodo
                },
                filtros_aplicados: {
                    tipo_movimiento,
                    fecha_desde,
                    fecha_hasta,
                    deposito_id,
                    categoria_id,
                    usuario_id,
                    solo_activas,
                    valor_minimo
                }
            });

        } catch (error) {
            logger.error('Error en getTopMercaderiasMovimientos:', {
                error: error.message,
                stack: error.stack,
                query_params: req.query,
                timestamp: new Date().toISOString()
            });

            res.status(500).json({
                success: false,
                message: 'Error al obtener top mercaderías con movimientos',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Error interno del servidor',
                codigo_error: 'TOP_MERCADERIAS_ERROR'
            });
        }
    }

    // =============================================
    // FUNCIÓN AUXILIAR: Obtener ranking de mercaderías por período específico
    // =============================================
    async getRankingMercaderiasPorPeriodo(req, res) {
        try {
            const { 
                ano = new Date().getFullYear(),
                mes = null,
                trimestre = null,
                limit = 20
            } = req.query;

            let whereClause = 'WHERE YEAR(ms.fecha_movimiento) = ?';
            let queryParams = [ano];

            if (mes) {
                whereClause += ' AND MONTH(ms.fecha_movimiento) = ?';
                queryParams.push(mes);
            } else if (trimestre) {
                const mesesTrimestre = {
                    '1': [1, 2, 3],
                    '2': [4, 5, 6], 
                    '3': [7, 8, 9],
                    '4': [10, 11, 12]
                };
                if (mesesTrimestre[trimestre]) {
                    whereClause += ' AND MONTH(ms.fecha_movimiento) IN (?, ?, ?)';
                    queryParams.push(...mesesTrimestre[trimestre]);
                }
            }

            const sql = `
                SELECT 
                    m.id,
                    m.descripcion,
                    m.codigo_sku,
                    c.categoria as categoria,
                    COUNT(ms.id) as total_movimientos,
                    SUM(ms.cantidad) as cantidad_total,
                    AVG(ms.cantidad) as cantidad_promedio,
                    SUM(ms.cantidad * COALESCE(ms.precio_unitario, 0)) as valor_total,
                    
                    -- Ranking por diferentes métricas
                    RANK() OVER (ORDER BY COUNT(ms.id) DESC) as ranking_movimientos,
                    RANK() OVER (ORDER BY SUM(ms.cantidad) DESC) as ranking_cantidad,
                    RANK() OVER (ORDER BY SUM(ms.cantidad * COALESCE(ms.precio_unitario, 0)) DESC) as ranking_valor,
                    
                    -- Comparación con período anterior
                    LAG(COUNT(ms.id)) OVER (PARTITION BY m.id ORDER BY YEAR(ms.fecha_movimiento), MONTH(ms.fecha_movimiento)) as movimientos_periodo_anterior
                    
                FROM movimientos_stock ms
                INNER JOIN mercaderias m ON ms.mercaderia_id = m.id
                LEFT JOIN categorias c ON m.id_categoria = c.id
                ${whereClause}
                GROUP BY m.id, m.descripcion, m.codigo_sku, c.categoria
                ORDER BY total_movimientos DESC
                LIMIT ?
            `;

            queryParams.push(parseInt(limit));
            const ranking = await db.query(sql, queryParams);

            res.json({
                success: true,
                data: ranking,
                periodo: { ano, mes, trimestre },
                total: ranking.length
            });

        } catch (error) {
            logger.error('Error en getRankingMercaderiasPorPeriodo:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener ranking por período',
                error: error.message
            });
        }
    }

    // =============================================
    // SHOW - Obtener movimiento específico con detalles completos
    // =============================================
    async show(req, res) {
        try {
            const { id } = req.params;
            const {
                include_related = true,
                include_stock_impact = true,
                include_timeline = false,
                include_audit = false
            } = req.query;

            // Validar ID
            if (!id || !Number.isInteger(+id) || +id <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'ID de movimiento inválido',
                    codigo_error: 'INVALID_MOVEMENT_ID'
                });
            }

            // Query principal para obtener el movimiento completo
            const sql = `
                SELECT 
                    ms.id,
                    ms.tipo_movimiento,
                    ms.mercaderia_id,
                    ms.deposito_origen_id,
                    ms.deposito_destino_id,
                    ms.cantidad,
                    ms.precio_unitario,
                    ms.motivo,
                    ms.numero_documento,
                    ms.observaciones,
                    ms.usuario_id,
                    ms.fecha_movimiento,
                    ms.created_at,
                    ms.updated_at,
                    
                    -- Información completa de mercadería
                    m.descripcion as mercaderia_descripcion,
                    m.codigo_sku,
                    m.precio_venta,
                    m.precio_costo,
                    m.stock_minimo,
                    m.unidad_medida,
                    m.activo as mercaderia_activa,
                    c.id as categoria_id,
                    c.categoria as categoria,
                    
                    -- Depósito origen completo
                    do.nombre as deposito_origen_nombre,
                    do.tipo as deposito_origen_tipo,
                    do.direccion as deposito_origen_direccion,
                    do.activo as deposito_origen_activo,
                    
                    -- Entidad origen (vendedor/cliente)
                    CASE 
                        WHEN do.tipo = 'VENDEDOR' THEN vo.razonSocial
                        WHEN do.tipo = 'CLIENTE' THEN co.razonSocial
                        ELSE do.nombre
                    END as entidad_origen_nombre,
                    CASE 
                        WHEN do.tipo = 'VENDEDOR' THEN vo.domicilio
                        WHEN do.tipo = 'CLIENTE' THEN co.domicilio
                        ELSE do.direccion
                    END as entidad_origen_direccion,
                    CASE 
                        WHEN do.tipo = 'VENDEDOR' THEN vo.telefono
                        WHEN do.tipo = 'CLIENTE' THEN co.telefono
                        ELSE NULL
                    END as entidad_origen_telefono,
                    CASE 
                        WHEN do.tipo = 'VENDEDOR' THEN vo.email
                        WHEN do.tipo = 'CLIENTE' THEN co.email
                        ELSE NULL
                    END as entidad_origen_email,
                    
                    -- Depósito destino completo
                    dd.nombre as deposito_destino_nombre,
                    dd.tipo as deposito_destino_tipo,
                    dd.direccion as deposito_destino_direccion,
                    dd.activo as deposito_destino_activo,
                    
                    -- Entidad destino (vendedor/cliente)
                    CASE 
                        WHEN dd.tipo = 'VENDEDOR' THEN vd.razonSocial
                        WHEN dd.tipo = 'CLIENTE' THEN cd.razonSocial
                        ELSE dd.nombre
                    END as entidad_destino_nombre,
                    CASE 
                        WHEN dd.tipo = 'VENDEDOR' THEN vd.domicilio
                        WHEN dd.tipo = 'CLIENTE' THEN cd.domicilio
                        ELSE dd.direccion
                    END as entidad_destino_direccion,
                    CASE 
                        WHEN dd.tipo = 'VENDEDOR' THEN vd.telefono
                        WHEN dd.tipo = 'CLIENTE' THEN cd.telefono
                        ELSE NULL
                    END as entidad_destino_telefono,
                    CASE 
                        WHEN dd.tipo = 'VENDEDOR' THEN vd.email
                        WHEN dd.tipo = 'CLIENTE' THEN cd.email
                        ELSE NULL
                    END as entidad_destino_email,
                    
                    -- Usuario completo
                    u.nombre as usuario_nombre,
                    u.email as usuario_email,
                    u.rol as usuario_rol,
                    u.activo as usuario_activo,
                    
                    -- Cálculos
                    (ms.cantidad * COALESCE(ms.precio_unitario, m.precio_costo, 0)) as valor_total,
                    
                    -- Clasificación del movimiento
                    CASE 
                        WHEN ms.tipo_movimiento IN ('COMPRA', 'INCREMENTO', 'DEVOLUCION') THEN 'INGRESO'
                        WHEN ms.tipo_movimiento IN ('TRANSFERENCIA', 'DECREMENTO') THEN 'SALIDA'
                        ELSE 'AJUSTE'
                    END as categoria_movimiento,
                    
                    -- Indicadores
                    CASE 
                        WHEN ms.precio_unitario IS NOT NULL AND ms.precio_unitario > 0 THEN 1
                        ELSE 0
                    END as tiene_precio,
                    
                    CASE 
                        WHEN ms.numero_documento IS NOT NULL AND ms.numero_documento != '' THEN 1
                        ELSE 0
                    END as tiene_documento,
                    
                    -- Tiempo transcurrido
                    DATEDIFF(NOW(), ms.fecha_movimiento) as dias_desde_movimiento,
                    TIMESTAMPDIFF(HOUR, ms.fecha_movimiento, NOW()) as horas_desde_movimiento

                FROM movimientos_stock ms
                INNER JOIN mercaderias m ON ms.mercaderia_id = m.id
                LEFT JOIN categorias c ON m.id_categoria = c.id
                
                -- Depósito origen con entidades
                LEFT JOIN depositos do ON ms.deposito_origen_id = do.id
                LEFT JOIN vendedores vo ON do.tipo = 'VENDEDOR' AND do.entity_id = vo.vendedorId
                LEFT JOIN clientes co ON do.tipo = 'CLIENTE' AND do.entity_id = co.clienteId
                
                -- Depósito destino con entidades
                LEFT JOIN depositos dd ON ms.deposito_destino_id = dd.id
                LEFT JOIN vendedores vd ON dd.tipo = 'VENDEDOR' AND dd.entity_id = vd.vendedorId
                LEFT JOIN clientes cd ON dd.tipo = 'CLIENTE' AND dd.entity_id = cd.clienteId
                
                -- Usuario
                LEFT JOIN usuarios u ON ms.usuario_id = u.id
                
                WHERE ms.id = ?
            `;

            const [movimiento] = await db.query(sql, [id]);

            if (!movimiento) {
                return res.status(404).json({
                    success: false,
                    message: 'Movimiento no encontrado',
                    codigo_error: 'MOVEMENT_NOT_FOUND'
                });
            }

            const movimientoData = movimiento;

            movimientoData.categoria_movimiento = 
    ['COMPRA', 'INCREMENTO', 'DEVOLUCION'].includes(movimientoData.tipo_movimiento) ? 'INGRESO' :
    ['VENTA', 'TRANSFERENCIA', 'DECREMENTO'].includes(movimientoData.tipo_movimiento) ? 'SALIDA' :
    movimientoData.tipo_movimiento === 'AJUSTE' ? 'AJUSTE' : 'OTRO';

movimientoData.tiene_precio = (movimientoData.precio_unitario && movimientoData.precio_unitario > 0) ? 1 : 0;
movimientoData.tiene_documento = (movimientoData.numero_documento && movimientoData.numero_documento.trim() !== '') ? 1 : 0;

// Calcular días desde movimiento
const fechaMovimiento = new Date(movimientoData.fecha_movimiento);
const hoy = new Date();
movimientoData.dias_desde_movimiento = Math.floor((hoy - fechaMovimiento) / (1000 * 60 * 60 * 24));

// Valor total
movimientoData.valor_total = (movimientoData.cantidad || 0) * (movimientoData.precio_unitario || 0);

// Estados por defecto si no existen
movimientoData.mercaderia_activa = movimientoData.mercaderia_activa ?? 1;
movimientoData.deposito_origen_activo = movimientoData.deposito_origen_activo ?? 1;
movimientoData.deposito_destino_activo = movimientoData.deposito_destino_activo ?? 1;

            // Preparar respuesta base
            const response = {
                success: true,
                data: {
                    movimiento: movimientoData,
                    metadata: {
                        es_ingreso: movimientoData.categoria_movimiento === 'INGRESO',
                        es_salida: movimientoData.categoria_movimiento === 'SALIDA',
                        es_ajuste: movimientoData.categoria_movimiento === 'AJUSTE',
                        afecta_origen: movimientoData.deposito_origen_id !== null,
                        afecta_destino: movimientoData.deposito_destino_id !== null,
                        tiene_precio: movimientoData.tiene_precio === 1,
                        tiene_documento: movimientoData.tiene_documento === 1,
                        es_reciente: movimientoData.dias_desde_movimiento <= 7,
                        mercaderia_activa: movimientoData.mercaderia_activa === 1,
                        depositos_activos: {
                            origen: movimientoData.deposito_origen_activo === 1,
                            destino: movimientoData.deposito_destino_activo === 1
                        }
                    }
                }
            };

            // Incluir movimientos relacionados si se solicita
            if (include_related === 'true' || include_related === true) {
                // Movimientos del mismo documento
                let movimientosRelacionados = [];
                if (movimientoData.numero_documento) {
                    movimientosRelacionados = await db.query(`
                        SELECT 
                            ms.id,
                            ms.tipo_movimiento,
                            ms.cantidad,
                            ms.fecha_movimiento,
                            ms.motivo,
                            m.descripcion as mercaderia_descripcion,
                            m.codigo_sku,
                            do.nombre as deposito_origen_nombre,
                            dd.nombre as deposito_destino_nombre,
                            u.nombre as usuario_nombre
                        FROM movimientos_stock ms
                        INNER JOIN mercaderias m ON ms.mercaderia_id = m.id
                        LEFT JOIN depositos do ON ms.deposito_origen_id = do.id
                        LEFT JOIN depositos dd ON ms.deposito_destino_id = dd.id
                        LEFT JOIN usuarios u ON ms.usuario_id = u.id
                        WHERE ms.numero_documento = ? AND ms.id != ?
                        ORDER BY ms.fecha_movimiento DESC
                        LIMIT 10
                    `, [movimientoData.numero_documento, id]);
                }

                // Otros movimientos de la misma mercadería en fechas cercanas
                const movimientosSimilares = await db.query(`
                    SELECT 
                        ms.id,
                        ms.tipo_movimiento,
                        ms.cantidad,
                        ms.fecha_movimiento,
                        ms.motivo,
                        ms.numero_documento,
                        do.nombre as deposito_origen_nombre,
                        dd.nombre as deposito_destino_nombre,
                        u.nombre as usuario_nombre,
                        ABS(TIMESTAMPDIFF(HOUR, ms.fecha_movimiento, ?)) as horas_diferencia
                    FROM movimientos_stock ms
                    LEFT JOIN depositos do ON ms.deposito_origen_id = do.id
                    LEFT JOIN depositos dd ON ms.deposito_destino_id = dd.id
                    LEFT JOIN usuarios u ON ms.usuario_id = u.id
                    WHERE ms.mercaderia_id = ? 
                    AND ms.id != ?
                    AND ABS(TIMESTAMPDIFF(HOUR, ms.fecha_movimiento, ?)) <= 72
                    ORDER BY horas_diferencia ASC
                    LIMIT 5
                `, [movimientoData.fecha_movimiento, movimientoData.mercaderia_id, id, movimientoData.fecha_movimiento]);

                response.data.movimientos_relacionados = {
                    mismo_documento: movimientosRelacionados,
                    misma_mercaderia_fecha_cercana: movimientosSimilares
                };
            }

            // Incluir impacto en stock si se solicita
            if (include_stock_impact === 'true' || include_stock_impact === true) {
                // Stock actual por depósito
                const stockActual = await db.query(`
                    SELECT 
                        d.id as deposito_id,
                        d.nombre as deposito_nombre,
                        d.tipo as deposito_tipo,
                        COALESCE(sd.cantidad, 0) as stock_actual,
                        sd.stock_minimo
                    FROM depositos d
                    LEFT JOIN stock_depositos sd ON d.id = sd.deposito_id AND sd.mercaderia_id = ?
                    WHERE d.activo = 1 AND (sd.cantidad > 0 OR d.id IN (?, ?))
                    ORDER BY d.tipo, d.nombre
                `, [
                    movimientoData.mercaderia_id, 
                    movimientoData.deposito_origen_id || 0, 
                    movimientoData.deposito_destino_id || 0
                ]);

                // Calcular stock antes del movimiento (aproximado)
                let stockAntes = {};
                if (movimientoData.deposito_origen_id || movimientoData.deposito_destino_id) {
                    const depositosAfectados = [movimientoData.deposito_origen_id, movimientoData.deposito_destino_id].filter(Boolean);
                    
                    for (const depositoId of depositosAfectados) {
                        const [stockAnterior] = await db.query(`
                            SELECT 
                                COALESCE(SUM(
                                    CASE 
                                        WHEN ms.deposito_destino_id = ? THEN ms.cantidad
                                        WHEN ms.deposito_origen_id = ? THEN -ms.cantidad
                                        ELSE 0
                                    END
                                ), 0) as stock_calculado
                            FROM movimientos_stock ms
                            WHERE ms.mercaderia_id = ? 
                            AND ms.id <= ?
                            AND ms.fecha_movimiento <= ?
                        `, [depositoId, depositoId, movimientoData.mercaderia_id, id, movimientoData.fecha_movimiento]);

                        stockAntes[depositoId] = stockAnterior[0]?.stock_calculado || 0;
                    }
                }

                response.data.impacto_stock = {
                    stock_actual: stockActual,
                    stock_antes_movimiento: stockAntes,
                    cambio_estimado: {
                        origen: movimientoData.deposito_origen_id ? 
                            `${stockAntes[movimientoData.deposito_origen_id] || 0} → ${(stockAntes[movimientoData.deposito_origen_id] || 0) - movimientoData.cantidad}` : null,
                        destino: movimientoData.deposito_destino_id ? 
                            `${stockAntes[movimientoData.deposito_destino_id] || 0} → ${(stockAntes[movimientoData.deposito_destino_id] || 0) + movimientoData.cantidad}` : null
                    }
                };
            }

            // Incluir timeline de movimientos si se solicita
            if (include_timeline === 'true' || include_timeline === true) {
                const timelineMovimientos = await db.query(`
                    SELECT 
                        ms.id,
                        ms.tipo_movimiento,
                        ms.cantidad,
                        ms.fecha_movimiento,
                        ms.motivo,
                        ms.numero_documento,
                        do.nombre as deposito_origen_nombre,
                        dd.nombre as deposito_destino_nombre,
                        u.nombre as usuario_nombre,
                        CASE 
                            WHEN ms.fecha_movimiento < ? THEN 'ANTERIOR'
                            WHEN ms.id = ? THEN 'ACTUAL'
                            ELSE 'POSTERIOR'
                        END as posicion_temporal
                    FROM movimientos_stock ms
                    LEFT JOIN depositos do ON ms.deposito_origen_id = do.id
                    LEFT JOIN depositos dd ON ms.deposito_destino_id = dd.id
                    LEFT JOIN usuarios u ON ms.usuario_id = u.id
                    WHERE ms.mercaderia_id = ?
                    AND ABS(TIMESTAMPDIFF(DAY, ms.fecha_movimiento, ?)) <= 30
                    ORDER BY ms.fecha_movimiento ASC
                    LIMIT 20
                `, [movimientoData.fecha_movimiento, id, movimientoData.mercaderia_id, movimientoData.fecha_movimiento]);

                response.data.timeline = timelineMovimientos;
            }

            // Incluir información de auditoría si se solicita
            if (include_audit === 'true' || include_audit === true) {
                // Validaciones del movimiento
                const validaciones = await this.validarConsistenciaMovimiento(movimientoData);
                
                // Historial de cambios (si existe tabla de auditoría)
                let historialCambios = null;
                try {
                    historialCambios = await db.query(`
                        SELECT 
                            ac.accion,
                            ac.valores_anteriores,
                            ac.valores_nuevos,
                            ac.fecha_cambio,
                            ac.usuario_id,
                            u.nombre as usuario_nombre
                        FROM auditoria_cambios ac
                        LEFT JOIN usuarios u ON ac.usuario_id = u.id
                        WHERE ac.tabla = 'movimientos_stock' AND ac.registro_id = ?
                        ORDER BY ac.fecha_cambio DESC
                        LIMIT 10
                    `, [id]);
                } catch (error) {
                    // Tabla de auditoría no existe
                    historialCambios = [];
                }

                response.data.auditoria = {
                    validaciones,
                    historial_cambios: historialCambios,
                    integridad_datos: {
                        mercaderia_existe: movimientoData.mercaderia_activa === 1,
                        deposito_origen_existe: !movimientoData.deposito_origen_id || movimientoData.deposito_origen_activo === 1,
                        deposito_destino_existe: !movimientoData.deposito_destino_id || movimientoData.deposito_destino_activo === 1,
                        usuario_existe: !movimientoData.usuario_id || movimientoData.usuario_activo === 1
                    }
                };
            }

            // Log de acceso para auditoría
            logger.info('Movimiento consultado', {
                movimiento_id: id,
                usuario_consulta: req.user?.id,
                ip: req.ip,
                incluye_relacionados: include_related,
                incluye_stock: include_stock_impact,
                incluye_timeline: include_timeline,
                incluye_auditoria: include_audit,
                timestamp: new Date().toISOString()
            });

            res.json(response);

        } catch (error) {
            logger.error('Error en show movimiento:', {
                error: error.message,
                stack: error.stack,
                movimiento_id: req.params.id,
                query_params: req.query,
                timestamp: new Date().toISOString()
            });

            res.status(500).json({
                success: false,
                message: 'Error al obtener detalles del movimiento',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Error interno del servidor',
                codigo_error: 'MOVEMENT_SHOW_ERROR'
            });
        }
    }

    // =============================================
    // FUNCIÓN AUXILIAR: Validar consistencia del movimiento
    // =============================================
    async validarConsistenciaMovimiento(movimiento) {
        const validaciones = {
            es_valido: true,
            errores: [],
            advertencias: [],
            verificaciones: {
                mercaderia_existe: false,
                deposito_origen_valido: false,
                deposito_destino_valido: false,
                usuario_existe: false,
                logica_movimiento_correcta: false,
                cantidad_positiva: false,
                fechas_coherentes: false
            }
        };

        try {
            // Verificar mercadería
            const [mercaderia] = await db.query(
                'SELECT activo FROM mercaderias WHERE id = ?',
                [movimiento.mercaderia_id]
            );
            validaciones.verificaciones.mercaderia_existe = mercaderia.length > 0;
            if (!mercaderia.length) {
                validaciones.errores.push('La mercadería asociada no existe');
                validaciones.es_valido = false;
            } else if (mercaderia[0].activo === 0) {
                validaciones.advertencias.push('La mercadería está marcada como inactiva');
            }

            // Verificar depósitos
            if (movimiento.deposito_origen_id) {
                const [depositoOrigen] = await db.query(
                    'SELECT activo FROM depositos WHERE id = ?',
                    [movimiento.deposito_origen_id]
                );
                validaciones.verificaciones.deposito_origen_valido = depositoOrigen.length > 0;
                if (!depositoOrigen.length) {
                    validaciones.errores.push('El depósito origen no existe');
                    validaciones.es_valido = false;
                } else if (depositoOrigen[0].activo === 0) {
                    validaciones.advertencias.push('El depósito origen está inactivo');
                }
            } else {
                validaciones.verificaciones.deposito_origen_valido = true; // No es requerido para todos los tipos
            }

            if (movimiento.deposito_destino_id) {
                const [depositoDestino] = await db.query(
                    'SELECT activo FROM depositos WHERE id = ?',
                    [movimiento.deposito_destino_id]
                );
                validaciones.verificaciones.deposito_destino_valido = depositoDestino.length > 0;
                if (!depositoDestino.length) {
                    validaciones.errores.push('El depósito destino no existe');
                    validaciones.es_valido = false;
                } else if (depositoDestino[0].activo === 0) {
                    validaciones.advertencias.push('El depósito destino está inactivo');
                }
            } else {
                validaciones.verificaciones.deposito_destino_valido = true; // No es requerido para todos los tipos
            }

            // Verificar usuario
            if (movimiento.usuario_id) {
                const [usuario] = await db.query(
                    'SELECT activo FROM usuarios WHERE id = ?',
                    [movimiento.usuario_id]
                );
                validaciones.verificaciones.usuario_existe = usuario.length > 0;
                if (!usuario.length) {
                    validaciones.advertencias.push('El usuario asociado no existe');
                } else if (usuario[0].activo === 0) {
                    validaciones.advertencias.push('El usuario está inactivo');
                }
            } else {
                validaciones.verificaciones.usuario_existe = true; // Puede ser null en algunos casos
            }

            // Verificar lógica del movimiento
            validaciones.verificaciones.logica_movimiento_correcta = true;
            if (['COMPRA', 'INCREMENTO'].includes(movimiento.tipo_movimiento) && !movimiento.deposito_destino_id) {
                validaciones.errores.push('Movimiento de ingreso debe tener depósito destino');
                validaciones.verificaciones.logica_movimiento_correcta = false;
                validaciones.es_valido = false;
            }

            if (['DECREMENTO'].includes(movimiento.tipo_movimiento) && !movimiento.deposito_origen_id) {
                validaciones.errores.push('Movimiento de salida debe tener depósito origen');
                validaciones.verificaciones.logica_movimiento_correcta = false;
                validaciones.es_valido = false;
            }

            if (['TRANSFERENCIA'].includes(movimiento.tipo_movimiento)) {
                if (!movimiento.deposito_origen_id || !movimiento.deposito_destino_id) {
                    validaciones.errores.push('Transferencia debe tener ambos depósitos');
                    validaciones.verificaciones.logica_movimiento_correcta = false;
                    validaciones.es_valido = false;
                }
                if (movimiento.deposito_origen_id === movimiento.deposito_destino_id) {
                    validaciones.errores.push('El depósito origen y destino no pueden ser el mismo');
                    validaciones.verificaciones.logica_movimiento_correcta = false;
                    validaciones.es_valido = false;
                }
            }

            // Verificar cantidad
            validaciones.verificaciones.cantidad_positiva = movimiento.cantidad > 0;
            if (movimiento.cantidad <= 0) {
                validaciones.errores.push('La cantidad debe ser mayor a cero');
                validaciones.es_valido = false;
            }

            // Verificar fechas
            validaciones.verificaciones.fechas_coherentes = true;
            if (movimiento.fecha_movimiento > new Date()) {
                validaciones.advertencias.push('La fecha del movimiento es futura');
            }

            if (movimiento.created_at && movimiento.fecha_movimiento > movimiento.created_at) {
                const diffHours = Math.abs(new Date(movimiento.fecha_movimiento) - new Date(movimiento.created_at)) / (1000 * 60 * 60);
                if (diffHours > 24) {
                    validaciones.advertencias.push('Gran diferencia entre fecha de movimiento y fecha de creación');
                }
            }

            // Verificaciones adicionales
            if (!movimiento.motivo || movimiento.motivo.trim() === '') {
                validaciones.advertencias.push('No se especificó un motivo para el movimiento');
            }

            if (!movimiento.numero_documento || movimiento.numero_documento.trim() === '') {
                validaciones.advertencias.push('No se asoció un número de documento');
            }

        } catch (error) {
            logger.error('Error validando consistencia del movimiento:', error);
            validaciones.errores.push('Error al validar la consistencia del movimiento');
            validaciones.es_valido = false;
        }

        return validaciones;
    }
}


module.exports = new MovimientosController();