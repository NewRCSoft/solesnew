// =============================================
// routes/movimientos.js - Rutas Actualizadas de Movimientos
// =============================================

const express = require('express');
const router = express.Router();
const MovimientosController = require('../controllers/MovimientosController');

// =============================================
// RUTAS BÁSICAS MEJORADAS
// =============================================

// GET / - Listar movimientos con filtros avanzados
router.get('/', MovimientosController.index);

// GET /:id - Obtener movimiento específico con detalles completos
router.get('/:id', MovimientosController.show);

// =============================================
// RUTAS DE FILTROS EXISTENTES - MEJORADAS
// =============================================

// GET /tipo/:tipo - Filtrar por tipo de movimiento (mantiene compatibilidad)
router.get('/tipo/:tipo', async (req, res) => {
    try {
        // Establecer el tipo en query parameters para que lo procese index()
        req.query.tipo = req.params.tipo;
        await MovimientosController.index(req, res);
    } catch (error) {
        logger.error('Error filtrando por tipo:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error filtrando por tipo',
            error: error.message 
        });
    }
});

// GET /deposito/:depositoId - Filtrar por depósito (mantiene compatibilidad)
router.get('/deposito/:depositoId', async (req, res) => {
    try {
        // Usar la función específica mejorada que ya existe
        await MovimientosController.getMovimientosByDeposito(req, res);
    } catch (error) {
        logger.error('Error filtrando por depósito:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error filtrando por depósito',
            error: error.message 
        });
    }
});

// =============================================
// RUTAS ESPECÍFICAS ADICIONALES
// =============================================

// GET /mercaderia/:mercaderiaId - Movimientos por mercadería específica
router.get('/mercaderia/:mercaderiaId', MovimientosController.getMovimientosByMercaderia);

// GET /usuario/:usuarioId - Movimientos por usuario específico
router.get('/usuario/:usuarioId', async (req, res) => {
    try {
        req.query.usuario_id = req.params.usuarioId;
        await MovimientosController.index(req, res);
    } catch (error) {
        logger.error('Error filtrando por usuario:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error filtrando por usuario',
            error: error.message 
        });
    }
});

// =============================================
// RUTAS DE OPERACIONES DE STOCK
// =============================================

// POST /ajuste - Registrar ajuste de stock (INCREMENTO/DECREMENTO)
router.post('/ajuste', MovimientosController.registrarAjuste);

// POST /devolucion - Registrar devolución de mercadería
router.post('/devolucion', MovimientosController.registrarDevolucion);

// =============================================
// RUTAS DE REPORTES Y ESTADÍSTICAS
// =============================================

// GET /reportes/resumen - Resumen de movimientos por período
router.get('/reportes/resumen', MovimientosController.getResumenMovimientos);

// GET /reportes/top-mercaderias - Top mercaderías con más movimientos
router.get('/reportes/top-mercaderias', MovimientosController.getTopMercaderiasMovimientos);

// GET /reportes/por-fecha - Movimientos agrupados por fecha
router.get('/reportes/por-fecha', async (req, res) => {
    try {
        const { fecha_desde, fecha_hasta, agrupar_por = 'dia' } = req.query;
        const db = require('../config/database');

        let groupBy, dateFormat;
        switch (agrupar_por) {
            case 'mes':
                groupBy = 'DATE_FORMAT(ms.fecha_movimiento, "%Y-%m")';
                dateFormat = '%Y-%m';
                break;
            case 'semana':
                groupBy = 'YEARWEEK(ms.fecha_movimiento)';
                dateFormat = 'Semana %u %Y';
                break;
            case 'dia':
            default:
                groupBy = 'DATE(ms.fecha_movimiento)';
                dateFormat = '%Y-%m-%d';
                break;
        }

        let whereConditions = ['1=1'];
        let queryParams = [];

        if (fecha_desde) {
            whereConditions.push('DATE(ms.fecha_movimiento) >= ?');
            queryParams.push(fecha_desde);
        }

        if (fecha_hasta) {
            whereConditions.push('DATE(ms.fecha_movimiento) <= ?');
            queryParams.push(fecha_hasta);
        }

        const whereClause = whereConditions.join(' AND ');

        const movimientos = await db.query(`
            SELECT 
                ${groupBy} as periodo,
                DATE_FORMAT(MIN(ms.fecha_movimiento), '${dateFormat}') as fecha_display,
                COUNT(*) as total_movimientos,
                SUM(ms.cantidad) as cantidad_total,
                COUNT(DISTINCT ms.tipo_movimiento) as tipos_distintos,
                COUNT(DISTINCT ms.mercaderia_id) as mercaderias_distintas,
                GROUP_CONCAT(DISTINCT ms.tipo_movimiento ORDER BY ms.tipo_movimiento) as tipos_movimiento
            FROM movimientos_stock ms
            WHERE ${whereClause}
            GROUP BY ${groupBy}
            ORDER BY periodo DESC
        `, queryParams);

        res.json({
            success: true,
            data: movimientos,
            parametros: { fecha_desde, fecha_hasta, agrupar_por }
        });

    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Error en reporte por fecha',
            error: error.message 
        });
    }
});

// =============================================
// RUTAS DE BÚSQUEDA AVANZADA
// =============================================

// GET /buscar - Búsqueda avanzada de movimientos
router.get('/buscar', async (req, res) => {
    try {
        const {
            q, // término de búsqueda general
            tipo_movimiento,
            mercaderia_codigo,
            deposito_nombre,
            usuario_nombre,
            numero_documento,
            fecha_desde,
            fecha_hasta,
            page = 1,
            limit = 20
        } = req.query;

        const db = require('../config/database');
        let whereConditions = ['1=1'];
        let queryParams = [];

        // Búsqueda general
        if (q) {
            whereConditions.push(`(
                m.descripcion LIKE ? OR 
                m.codigo_sku LIKE ? OR 
                ms.motivo LIKE ? OR 
                ms.numero_documento LIKE ? OR
                ms.observaciones LIKE ?
            )`);
            const searchTerm = `%${q}%`;
            queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
        }

        // Filtros específicos
        if (tipo_movimiento) {
            whereConditions.push('ms.tipo_movimiento = ?');
            queryParams.push(tipo_movimiento);
        }

        if (mercaderia_codigo) {
            whereConditions.push('(m.codigo_sku LIKE ? OR m.codigo_code128 LIKE ?)');
            queryParams.push(`%${mercaderia_codigo}%`, `%${mercaderia_codigo}%`);
        }

        if (deposito_nombre) {
            whereConditions.push('(do.nombre LIKE ? OR dd.nombre LIKE ?)');
            queryParams.push(`%${deposito_nombre}%`, `%${deposito_nombre}%`);
        }

        if (usuario_nombre) {
            whereConditions.push('u.nombre LIKE ?');
            queryParams.push(`%${usuario_nombre}%`);
        }

        if (numero_documento) {
            whereConditions.push('ms.numero_documento LIKE ?');
            queryParams.push(`%${numero_documento}%`);
        }

        if (fecha_desde) {
            whereConditions.push('DATE(ms.fecha_movimiento) >= ?');
            queryParams.push(fecha_desde);
        }

        if (fecha_hasta) {
            whereConditions.push('DATE(ms.fecha_movimiento) <= ?');
            queryParams.push(fecha_hasta);
        }

        const whereClause = whereConditions.join(' AND ');
        const offset = (page - 1) * limit;

        const sql = `
            SELECT 
                ms.*,
                m.descripcion as mercaderia_descripcion,
                m.codigo_sku,
                do.nombre as deposito_origen_nombre,
                dd.nombre as deposito_destino_nombre,
                u.nombre as usuario_nombre,
                -- Relevancia de búsqueda
                CASE 
                    WHEN m.descripcion LIKE ? THEN 5
                    WHEN m.codigo_sku LIKE ? THEN 4
                    WHEN ms.numero_documento LIKE ? THEN 3
                    WHEN ms.motivo LIKE ? THEN 2
                    ELSE 1
                END as relevancia
            FROM movimientos_stock ms
            INNER JOIN mercaderias m ON ms.mercaderia_id = m.id
            LEFT JOIN depositos do ON ms.deposito_origen_id = do.id
            LEFT JOIN depositos dd ON ms.deposito_destino_id = dd.id
            LEFT JOIN usuarios u ON ms.usuario_id = u.id
            WHERE ${whereClause}
            ORDER BY relevancia DESC, ms.fecha_movimiento DESC
            LIMIT ? OFFSET ?
        `;

        // Agregar parámetros de relevancia si hay búsqueda general
        if (q) {
            const searchTerm = `%${q}%`;
            queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
        } else {
            queryParams.push('', '', '', '');
        }

        queryParams.push(parseInt(limit), parseInt(offset));
        const movimientos = await db.query(sql, queryParams);

        res.json({
            success: true,
            data: movimientos,
            total: movimientos.length,
            pagination: {
                current_page: parseInt(page),
                per_page: parseInt(limit)
            },
            criterios_busqueda: {
                q, tipo_movimiento, mercaderia_codigo, deposito_nombre,
                usuario_nombre, numero_documento, fecha_desde, fecha_hasta
            }
        });

    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Error en búsqueda de movimientos',
            error: error.message 
        });
    }
});

// =============================================
// RUTAS DE EXPORTACIÓN Y UTILIDADES
// =============================================

// GET /exportar - Exportar movimientos (CSV básico)
router.get('/exportar', async (req, res) => {
    try {
        // Usar los mismos filtros que index pero sin paginación
        const filteredReq = { ...req };
        filteredReq.query.limit = 10000; // Límite alto para exportación
        filteredReq.query.page = 1;

        // Obtener los datos
        const tempRes = {
            json: (data) => {
                if (data.success) {
                    // Convertir a CSV básico
                    const movements = data.data;
                    if (movements.length === 0) {
                        return res.status(404).json({
                            success: false,
                            message: 'No hay movimientos para exportar con los filtros aplicados'
                        });
                    }

                    const csvHeader = 'ID,Fecha,Tipo,Mercaderia,Codigo SKU,Cantidad,Deposito Origen,Deposito Destino,Usuario,Motivo,Documento\n';
                    const csvRows = movements.map(m => 
                        `${m.id},"${m.fecha_movimiento}","${m.tipo_movimiento}","${m.mercaderia_descripcion || ''}","${m.codigo_sku || ''}",${m.cantidad},"${m.deposito_origen_nombre || ''}","${m.deposito_destino_nombre || ''}","${m.usuario_nombre || ''}","${m.motivo || ''}","${m.numero_documento || ''}"`
                    ).join('\n');

                    res.setHeader('Content-Type', 'text/csv');
                    res.setHeader('Content-Disposition', `attachment; filename="movimientos_${new Date().toISOString().split('T')[0]}.csv"`);
                    res.send(csvHeader + csvRows);
                } else {
                    res.status(500).json(data);
                }
            }
        };

        await MovimientosController.index(filteredReq, tempRes);

    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Error al exportar movimientos',
            error: error.message 
        });
    }
});

// GET /validar/:id - Validar consistencia de un movimiento
router.get('/validar/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const db = require('../config/database');

        // Obtener el movimiento
        const [movimiento] = await db.query(
            'SELECT * FROM movimientos_stock WHERE id = ?',
            [id]
        );

        if (!movimiento.length) {
            return res.status(404).json({
                success: false,
                message: 'Movimiento no encontrado'
            });
        }

        const mov = movimiento[0];
        const validaciones = {
            movimiento_valido: true,
            errores: [],
            advertencias: [],
            datos_movimiento: mov
        };

        // Validar mercadería existe
        const [mercaderia] = await db.query(
            'SELECT * FROM mercaderias WHERE id = ?',
            [mov.mercaderia_id]
        );

        if (!mercaderia.length) {
            validaciones.errores.push('La mercadería asociada no existe');
            validaciones.movimiento_valido = false;
        }

        // Validar depósitos existen
        if (mov.deposito_origen_id) {
            const [depositoOrigen] = await db.query(
                'SELECT * FROM depositos WHERE id = ?',
                [mov.deposito_origen_id]
            );
            if (!depositoOrigen.length) {
                validaciones.errores.push('El depósito origen no existe');
                validaciones.movimiento_valido = false;
            }
        }

        if (mov.deposito_destino_id) {
            const [depositoDestino] = await db.query(
                'SELECT * FROM depositos WHERE id = ?',
                [mov.deposito_destino_id]
            );
            if (!depositoDestino.length) {
                validaciones.errores.push('El depósito destino no existe');
                validaciones.movimiento_valido = false;
            }
        }

        // Validar coherencia del tipo de movimiento
        if (['COMPRA', 'INCREMENTO'].includes(mov.tipo_movimiento) && !mov.deposito_destino_id) {
            validaciones.errores.push('Movimiento de ingreso debe tener depósito destino');
            validaciones.movimiento_valido = false;
        }

        if (['DECREMENTO'].includes(mov.tipo_movimiento) && !mov.deposito_origen_id) {
            validaciones.errores.push('Movimiento de salida debe tener depósito origen');
            validaciones.movimiento_valido = false;
        }

        if (['TRANSFERENCIA'].includes(mov.tipo_movimiento) && (!mov.deposito_origen_id || !mov.deposito_destino_id)) {
            validaciones.errores.push('Transferencia debe tener ambos depósitos');
            validaciones.movimiento_valido = false;
        }

        // Advertencias
        if (mov.cantidad <= 0) {
            validaciones.advertencias.push('La cantidad es cero o negativa');
        }

        if (!mov.motivo) {
            validaciones.advertencias.push('No se especificó un motivo para el movimiento');
        }

        res.json({
            success: true,
            data: validaciones
        });

    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Error al validar movimiento',
            error: error.message 
        });
    }
});

// =============================================
// RUTAS LEGACY PARA COMPATIBILIDAD
// =============================================

// MANTENER: Alias para compatibilidad con código existente
router.get('/todos', MovimientosController.getMovimientos); // Alias de index
router.get('/detalle/:id', MovimientosController.getMovimientoById); // Alias de show

module.exports = router;