// =============================================
// controllers/StockController.js - CONTROLADOR COMPLETO DE STOCK
// =============================================
const db = require('../config/database');
const logger = require('../config/logger');

class StockController {
    constructor() {
        // Bind de métodos para preservar contexto
        this.getStockGeneral = this.getStockGeneral.bind(this);
        this.getStockByDeposito = this.getStockByDeposito.bind(this);
        this.getStockByMercaderia = this.getStockByMercaderia.bind(this);
        this.registrarCompra = this.registrarCompra.bind(this);
        this.transferir = this.transferir.bind(this);
        this.ajustarStock = this.ajustarStock.bind(this);
        this.getAlertas = this.getAlertas.bind(this);
        this.getMovimientos = this.getMovimientos.bind(this);
        this.getEstadisticas = this.getEstadisticas.bind(this);
    }

    // =============================================
    // MÉTODO PRINCIPAL: Stock General
    // =============================================
    async getStockGeneral(req, res) {
        try {
            const { 
                categoria_id, 
                estado, 
                search, 
                page = 1, 
                limit = 50,
                incluir_sin_stock = 'true'
            } = req.query;

            let whereClause = 'WHERE m.activo = 1';
            let params = [];

            // Filtro por categoría
            if (categoria_id) {
                whereClause += ' AND m.id_categoria = ?';
                params.push(categoria_id);
            }

            // Filtro por búsqueda
            if (search) {
                whereClause += ' AND (m.descripcion LIKE ? OR m.codigo_sku LIKE ? OR m.codigo_ean13 LIKE ?)';
                const searchParam = `%${search}%`;
                params.push(searchParam, searchParam, searchParam);
            }

            const sql = `
                SELECT 
                    m.id,
                    m.descripcion,
                    m.codigo_sku,
                    m.codigo_ean13,
                    m.precio_venta,
                    m.precio_costo,
                    m.stock_minimo,
                    c.categoria as categoria,
                    m.id_categoria,
                    
                    -- Stock por tipo de depósito
                    COALESCE(stock_central.cantidad, 0) as stock_central,
                    COALESCE(stock_vendedores.cantidad, 0) as stock_vendedores,
                    COALESCE(stock_clientes.cantidad, 0) as stock_clientes,
                    
                    -- Stock total
                    (COALESCE(stock_central.cantidad, 0) + 
                     COALESCE(stock_vendedores.cantidad, 0) + 
                     COALESCE(stock_clientes.cantidad, 0)) as stock_total,
                    
                    -- Estado del stock
                    CASE 
                        WHEN (COALESCE(stock_central.cantidad, 0) + 
                              COALESCE(stock_vendedores.cantidad, 0) + 
                              COALESCE(stock_clientes.cantidad, 0)) = 0 THEN 'SIN_STOCK'
                        WHEN (COALESCE(stock_central.cantidad, 0) + 
                              COALESCE(stock_vendedores.cantidad, 0) + 
                              COALESCE(stock_clientes.cantidad, 0)) <= m.stock_minimo THEN 'STOCK_BAJO'
                        WHEN (COALESCE(stock_central.cantidad, 0) + 
                              COALESCE(stock_vendedores.cantidad, 0) + 
                              COALESCE(stock_clientes.cantidad, 0)) <= m.stock_minimo * 1.5 THEN 'STOCK_MEDIO'
                        ELSE 'STOCK_OK'
                    END as estado_stock,
                    
                    -- Valor del stock
                    ((COALESCE(stock_central.cantidad, 0) + 
                      COALESCE(stock_vendedores.cantidad, 0) + 
                      COALESCE(stock_clientes.cantidad, 0)) * m.precio_costo) as valor_stock

                FROM mercaderias m
                LEFT JOIN categorias c ON m.id_categoria = c.id
                
                -- Stock en depósito central
                LEFT JOIN (
                    SELECT sd.mercaderia_id, SUM(sd.cantidad) as cantidad
                    FROM stock_depositos sd
                    INNER JOIN depositos d ON sd.deposito_id = d.id
                    WHERE d.tipo = 'CENTRAL' AND d.activo = 1
                    GROUP BY sd.mercaderia_id
                ) stock_central ON m.id = stock_central.mercaderia_id
                
                -- Stock en depósitos de vendedores
                LEFT JOIN (
                    SELECT sd.mercaderia_id, SUM(sd.cantidad) as cantidad
                    FROM stock_depositos sd
                    INNER JOIN depositos d ON sd.deposito_id = d.id
                    WHERE d.tipo = 'VENDEDOR' AND d.activo = 1
                    GROUP BY sd.mercaderia_id
                ) stock_vendedores ON m.id = stock_vendedores.mercaderia_id
                
                -- Stock en depósitos de clientes
                LEFT JOIN (
                    SELECT sd.mercaderia_id, SUM(sd.cantidad) as cantidad
                    FROM stock_depositos sd
                    INNER JOIN depositos d ON sd.deposito_id = d.id
                    WHERE d.tipo = 'CLIENTE' AND d.activo = 1
                    GROUP BY sd.mercaderia_id
                ) stock_clientes ON m.id = stock_clientes.mercaderia_id

                ${whereClause}
                ${incluir_sin_stock === 'false' ? 
                    'HAVING stock_total > 0' : ''}
                
                ORDER BY 
                    CASE estado_stock
                        WHEN 'SIN_STOCK' THEN 1
                        WHEN 'STOCK_BAJO' THEN 2
                        WHEN 'STOCK_MEDIO' THEN 3
                        ELSE 4
                    END,
                    m.descripcion ASC
                
                LIMIT ? OFFSET ?
            `;

            params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));
            const stock = await db.query(sql, params);

            // Calcular estadísticas/resumen
            const resumenSql = `
                SELECT 
                    COUNT(*) as total_mercaderias,
                    COUNT(CASE WHEN stock_total = 0 THEN 1 END) as sin_stock,
                    COUNT(CASE WHEN stock_total > 0 AND stock_total <= m.stock_minimo THEN 1 END) as stock_bajo,
                    COUNT(CASE WHEN stock_total > m.stock_minimo THEN 1 END) as stock_ok,
                    SUM(stock_total * m.precio_costo) as valor_total,
                    SUM(stock_total) as unidades_totales
                FROM (
                    SELECT 
                        m.id,
                        m.stock_minimo,
                        m.precio_costo,
                        (COALESCE(sc.cantidad, 0) + COALESCE(sv.cantidad, 0) + COALESCE(scl.cantidad, 0)) as stock_total
                    FROM mercaderias m
                    LEFT JOIN (SELECT sd.mercaderia_id, SUM(sd.cantidad) as cantidad FROM stock_depositos sd INNER JOIN depositos d ON sd.deposito_id = d.id WHERE d.tipo = 'CENTRAL' AND d.activo = 1 GROUP BY sd.mercaderia_id) sc ON m.id = sc.mercaderia_id
                    LEFT JOIN (SELECT sd.mercaderia_id, SUM(sd.cantidad) as cantidad FROM stock_depositos sd INNER JOIN depositos d ON sd.deposito_id = d.id WHERE d.tipo = 'VENDEDOR' AND d.activo = 1 GROUP BY sd.mercaderia_id) sv ON m.id = sv.mercaderia_id
                    LEFT JOIN (SELECT sd.mercaderia_id, SUM(sd.cantidad) as cantidad FROM stock_depositos sd INNER JOIN depositos d ON sd.deposito_id = d.id WHERE d.tipo = 'CLIENTE' AND d.activo = 1 GROUP BY sd.mercaderia_id) scl ON m.id = scl.mercaderia_id
                    WHERE m.activo = 1
                ) m
            `;

            const [resumen] = await db.query(resumenSql);

            res.json({
                success: true,
                data: stock,
                total: stock.length,
                resumen: resumen || {},
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total_pages: Math.ceil((resumen?.total_mercaderias || 0) / parseInt(limit))
                }
            });

        } catch (error) {
            logger.error('Error en getStockGeneral:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener stock general',
                error: error.message
            });
        }
    }

    // =============================================
    // Stock por depósito específico
    // =============================================
    async getStockByDeposito(req, res) {
        try {
            const { depositoId } = req.params;
            const { incluir_sin_stock = 'false' } = req.query;

            // Verificar que el depósito existe
            const [deposito] = await db.query(`
                SELECT id, nombre, tipo FROM depositos WHERE id = ? AND activo = 1
            `, [depositoId]);

            if (!deposito) {
                return res.status(404).json({
                    success: false,
                    message: 'Depósito no encontrado'
                });
            }

            const sql = `
                SELECT 
                    m.id,
                    m.descripcion,
                    m.codigo_sku,
                    m.codigo_ean13,
                    m.precio_venta,
                    m.precio_costo,
                    COALESCE(sd.cantidad, 0) as cantidad,
                    COALESCE(sd.stock_minimo, m.stock_minimo) as stock_minimo,
                    (COALESCE(sd.cantidad, 0) * m.precio_venta) as valor_total,
                    c.categoria as categoria,
                    
                    CASE 
                        WHEN COALESCE(sd.cantidad, 0) = 0 THEN 'SIN_STOCK'
                        WHEN COALESCE(sd.cantidad, 0) <= COALESCE(sd.stock_minimo, m.stock_minimo) THEN 'STOCK_BAJO'
                        ELSE 'STOCK_OK'
                    END as estado_stock

                FROM mercaderias m
                LEFT JOIN stock_depositos sd ON m.id = sd.mercaderia_id AND sd.deposito_id = ?
                LEFT JOIN categorias c ON m.id_categoria = c.id
                WHERE m.activo = 1
                ${incluir_sin_stock === 'false' ? 'AND COALESCE(sd.cantidad, 0) > 0' : ''}
                ORDER BY m.descripcion ASC
            `;

            const stock = await db.query(sql, [depositoId]);

            res.json({
                success: true,
                data: stock,
                deposito: deposito,
                total: stock.length
            });

        } catch (error) {
            logger.error('Error en getStockByDeposito:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener stock del depósito',
                error: error.message
            });
        }
    }

    // =============================================
    // Stock por mercadería específica
    // =============================================
    async getStockByMercaderia(req, res) {
        try {
            const { mercaderiaId } = req.params;

            // Verificar que la mercadería existe
            const [mercaderia] = await db.query(`
                SELECT id, descripcion, codigo_sku FROM mercaderias WHERE id = ? AND activo = 1
            `, [mercaderiaId]);

            if (!mercaderia) {
                return res.status(404).json({
                    success: false,
                    message: 'Mercadería no encontrada'
                });
            }

            const sql = `
                SELECT 
                    d.id as deposito_id,
                    d.nombre as deposito_nombre,
                    d.tipo as deposito_tipo,
                    COALESCE(sd.cantidad, 0) as cantidad,
                    COALESCE(sd.stock_minimo, 0) as stock_minimo,
                    
                    -- Información de la entidad si aplica
                    CASE 
                        WHEN d.tipo = 'VENDEDOR' THEN v.razonSocial
                        WHEN d.tipo = 'CLIENTE' THEN c.razonSocial
                        ELSE 'N/A'
                    END as entidad_nombre,
                    
                    CASE 
                        WHEN COALESCE(sd.cantidad, 0) = 0 THEN 'SIN_STOCK'
                        WHEN COALESCE(sd.cantidad, 0) <= COALESCE(sd.stock_minimo, 0) THEN 'STOCK_BAJO'
                        ELSE 'STOCK_OK'
                    END as estado_stock

                FROM depositos d
                LEFT JOIN stock_depositos sd ON d.id = sd.deposito_id AND sd.mercaderia_id = ?
                LEFT JOIN vendedores v ON d.entity_id = v.vendedorId AND d.tipo = 'VENDEDOR'
                LEFT JOIN clientes c ON d.entity_id = c.clienteId AND d.tipo = 'CLIENTE'
                
                WHERE d.activo = 1
                ORDER BY 
                    CASE d.tipo 
                        WHEN 'CENTRAL' THEN 1
                        WHEN 'VENDEDOR' THEN 2
                        ELSE 3
                    END,
                    d.nombre ASC
            `;

            const stock = await db.query(sql, [mercaderiaId]);

            // Calcular totales
            const totales = {
                total_depositos: stock.length,
                total_cantidad: stock.reduce((sum, s) => sum + s.cantidad, 0),
                depositos_con_stock: stock.filter(s => s.cantidad > 0).length
            };

            res.json({
                success: true,
                data: stock,
                mercaderia: mercaderia,
                totales: totales
            });

        } catch (error) {
            logger.error('Error en getStockByMercaderia:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener stock por mercadería',
                error: error.message
            });
        }
    }

    // =============================================
    // OPERACIONES DE STOCK
    // =============================================

    // Registrar compra
    async registrarCompra(req, res) {
        const connection = await db.getConnection();
        
        try {
            await connection.beginTransaction();

            const {
                mercaderia_id,
                deposito_destino_id,
                cantidad,
                precio_unitario,
                numero_documento,
                proveedor,
                observaciones
            } = req.body;

            // Validaciones
            if (!mercaderia_id || !cantidad || cantidad <= 0) {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Mercadería y cantidad son obligatorios'
                });
            }

            // Verificar mercadería
            const [mercaderia] = await connection.query(
                'SELECT * FROM mercaderias WHERE id = ? AND activo = 1',
                [mercaderia_id]
            );

            if (!mercaderia.length) {
                await connection.rollback();
                return res.status(404).json({
                    success: false,
                    message: 'Mercadería no encontrada'
                });
            }

            // Obtener depósito destino (central por defecto)
            let depositoDestino;
            if (deposito_destino_id) {
                const [deposito] = await connection.query(
                    'SELECT * FROM depositos WHERE id = ? AND activo = 1',
                    [deposito_destino_id]
                );
                if (!deposito.length) {
                    await connection.rollback();
                    return res.status(404).json({
                        success: false,
                        message: 'Depósito destino no encontrado'
                    });
                }
                depositoDestino = deposito[0];
            } else {
                const [depositoCentral] = await connection.query(
                    'SELECT * FROM depositos WHERE tipo = "CENTRAL" AND activo = 1 LIMIT 1'
                );
                if (!depositoCentral.length) {
                    await connection.rollback();
                    return res.status(400).json({
                        success: false,
                        message: 'No se encontró depósito central configurado'
                    });
                }
                depositoDestino = depositoCentral[0];
            }

            // Registrar movimiento de stock
            const [resultMovimiento] = await connection.query(`
                INSERT INTO movimientos_stock 
                (tipo_movimiento, mercaderia_id, deposito_destino_id, cantidad, precio_unitario, 
                 motivo, numero_documento, observaciones, usuario_id)
                VALUES ('COMPRA', ?, ?, ?, ?, 'Compra de mercadería', ?, ?, ?)
            `, [
                mercaderia_id, 
                depositoDestino.id, 
                cantidad, 
                precio_unitario || 0, 
                numero_documento || `COMP-${Date.now()}`,
                observaciones,
                req.user?.id || 1
            ]);

            // Actualizar stock en el depósito
            await connection.query(`
                INSERT INTO stock_depositos (mercaderia_id, deposito_id, cantidad)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                cantidad = cantidad + VALUES(cantidad)
            `, [mercaderia_id, depositoDestino.id, cantidad]);

            // Actualizar precio de costo si se proporcionó
            if (precio_unitario && precio_unitario > 0) {
                await connection.query(`
                    UPDATE mercaderias 
                    SET precio_costo = ?, ultima_modificacion = NOW()
                    WHERE id = ?
                `, [precio_unitario, mercaderia_id]);
            }

            await connection.commit();

            res.json({
                success: true,
                message: 'Compra registrada exitosamente',
                movimiento_id: resultMovimiento.insertId,
                deposito_destino: depositoDestino.nombre
            });

        } catch (error) {
            await connection.rollback();
            logger.error('Error en registrarCompra:', error);
            res.status(500).json({
                success: false,
                message: 'Error al registrar la compra',
                error: error.message
            });
        } finally {
            connection.release();
        }
    }

    // Transferir stock entre depósitos
    async transferir(req, res) {
        const connection = await db.getConnection();
        
        try {
            await connection.beginTransaction();

            const {
                mercaderia_id,
                deposito_origen_id,
                deposito_destino_id,
                cantidad,
                motivo,
                numero_documento,
                observaciones
            } = req.body;

            // Validaciones básicas
            if (!mercaderia_id || !deposito_origen_id || !deposito_destino_id || !cantidad || cantidad <= 0) {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Todos los campos son obligatorios'
                });
            }

            if (deposito_origen_id === deposito_destino_id) {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'El depósito origen no puede ser igual al destino'
                });
            }

            // Verificar mercadería
            const [mercaderia] = await connection.query(
                'SELECT * FROM mercaderias WHERE id = ? AND activo = 1',
                [mercaderia_id]
            );

            if (!mercaderia.length) {
                await connection.rollback();
                return res.status(404).json({
                    success: false,
                    message: 'Mercadería no encontrada'
                });
            }

            // Verificar depósitos
            const [depositos] = await connection.query(
                'SELECT * FROM depositos WHERE id IN (?, ?) AND activo = 1',
                [deposito_origen_id, deposito_destino_id]
            );

            if (depositos.length !== 2) {
                await connection.rollback();
                return res.status(404).json({
                    success: false,
                    message: 'Uno o ambos depósitos no existen o están inactivos'
                });
            }

            const depositoOrigen = depositos.find(d => d.id == deposito_origen_id);
            const depositoDestino = depositos.find(d => d.id == deposito_destino_id);

            // Verificar stock disponible en origen
            const [stockOrigen] = await connection.query(
                'SELECT cantidad FROM stock_depositos WHERE mercaderia_id = ? AND deposito_id = ?',
                [mercaderia_id, deposito_origen_id]
            );

            if (!stockOrigen.length || stockOrigen[0].cantidad < cantidad) {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Stock insuficiente en depósito origen',
                    stock_disponible: stockOrigen.length ? stockOrigen[0].cantidad : 0,
                    cantidad_solicitada: cantidad
                });
            }

            // Registrar movimiento
            const [resultMovimiento] = await connection.query(`
                INSERT INTO movimientos_stock 
                (tipo_movimiento, mercaderia_id, deposito_origen_id, deposito_destino_id, 
                 cantidad, precio_unitario, motivo, numero_documento, observaciones, usuario_id)
                VALUES ('TRANSFERENCIA', ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                mercaderia_id, 
                deposito_origen_id, 
                deposito_destino_id, 
                cantidad, 
                mercaderia[0].precio_costo || 0,
                motivo || 'Transferencia de stock',
                numero_documento || `TRF-${Date.now()}`,
                observaciones,
                req.user?.id || 1
            ]);

            // Actualizar stock en origen (restar)
            await connection.query(`
                UPDATE stock_depositos 
                SET cantidad = cantidad - ?
                WHERE mercaderia_id = ? AND deposito_id = ?
            `, [cantidad, mercaderia_id, deposito_origen_id]);

            // Actualizar stock en destino (sumar)
            await connection.query(`
                INSERT INTO stock_depositos (mercaderia_id, deposito_id, cantidad)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                cantidad = cantidad + VALUES(cantidad)
            `, [mercaderia_id, deposito_destino_id, cantidad]);

            await connection.commit();

            res.json({
                success: true,
                message: 'Transferencia realizada exitosamente',
                movimiento_id: resultMovimiento.insertId,
                origen: depositoOrigen.nombre,
                destino: depositoDestino.nombre
            });

        } catch (error) {
            await connection.rollback();
            logger.error('Error en transferir:', error);
            res.status(500).json({
                success: false,
                message: 'Error al realizar transferencia',
                error: error.message
            });
        } finally {
            connection.release();
        }
    }

    // Ajustar stock
    async ajustarStock(req, res) {
        const connection = await db.getConnection();
        
        try {
            await connection.beginTransaction();

            const {
                mercaderia_id,
                deposito_id,
                tipo_ajuste, // INCREMENTO, DECREMENTO, CORRECCION
                cantidad,
                motivo,
                observaciones
            } = req.body;

            // Validaciones
            if (!mercaderia_id || !deposito_id || !tipo_ajuste || cantidad === undefined) {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Todos los campos son obligatorios'
                });
            }

            // Verificar mercadería y depósito
            const [mercaderia] = await connection.query(
                'SELECT * FROM mercaderias WHERE id = ? AND activo = 1',
                [mercaderia_id]
            );

            const [deposito] = await connection.query(
                'SELECT * FROM depositos WHERE id = ? AND activo = 1',
                [deposito_id]
            );

            if (!mercaderia.length || !deposito.length) {
                await connection.rollback();
                return res.status(404).json({
                    success: false,
                    message: 'Mercadería o depósito no encontrado'
                });
            }

            // Obtener stock actual
            const [stockActual] = await connection.query(
                'SELECT cantidad FROM stock_depositos WHERE mercaderia_id = ? AND deposito_id = ?',
                [mercaderia_id, deposito_id]
            );

            const cantidadActual = stockActual.length ? stockActual[0].cantidad : 0;
            let nuevaCantidad;
            let cantidadMovimiento;

            // Calcular nueva cantidad según tipo de ajuste
            switch (tipo_ajuste) {
                case 'INCREMENTO':
                    nuevaCantidad = cantidadActual + cantidad;
                    cantidadMovimiento = cantidad;
                    break;
                case 'DECREMENTO':
                    nuevaCantidad = Math.max(0, cantidadActual - cantidad);
                    cantidadMovimiento = -Math.min(cantidad, cantidadActual);
                    break;
                case 'CORRECCION':
                    nuevaCantidad = cantidad;
                    cantidadMovimiento = cantidad - cantidadActual;
                    break;
                default:
                    await connection.rollback();
                    return res.status(400).json({
                        success: false,
                        message: 'Tipo de ajuste no válido'
                    });
            }

            // Registrar movimiento de ajuste
            const tipoMovimiento = cantidadMovimiento >= 0 ? 'AJUSTE_POSITIVO' : 'AJUSTE_NEGATIVO';
            
            const [resultMovimiento] = await connection.query(`
                INSERT INTO movimientos_stock 
                (tipo_movimiento, mercaderia_id, deposito_origen_id, deposito_destino_id, 
                 cantidad, motivo, observaciones, usuario_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                tipoMovimiento,
                mercaderia_id, 
                cantidadMovimiento < 0 ? deposito_id : null,
                cantidadMovimiento >= 0 ? deposito_id : null,
                Math.abs(cantidadMovimiento), 
                motivo || `Ajuste de stock: ${tipo_ajuste}`,
                observaciones,
                req.user?.id || 1
            ]);

            // Actualizar stock en el depósito
            await connection.query(`
                INSERT INTO stock_depositos (mercaderia_id, deposito_id, cantidad)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                cantidad = VALUES(cantidad)
            `, [mercaderia_id, deposito_id, nuevaCantidad]);

            await connection.commit();

            res.json({
                success: true,
                message: 'Ajuste de stock realizado exitosamente',
                movimiento_id: resultMovimiento.insertId,
                cantidad_anterior: cantidadActual,
                cantidad_nueva: nuevaCantidad,
                diferencia: cantidadMovimiento
            });

        } catch (error) {
            await connection.rollback();
            logger.error('Error en ajustarStock:', error);
            res.status(500).json({
                success: false,
                message: 'Error al ajustar stock',
                error: error.message
            });
        } finally {
            connection.release();
        }
    }

    // =============================================
    // CONSULTAS Y REPORTES
    // =============================================

    // Obtener alertas de stock bajo
    async getAlertas(req, res) {
        try {
            const { tipo_deposito, urgencia } = req.query;

            let whereClause = 'WHERE m.activo = 1 AND m.stock_minimo > 0';
            let params = [];

            if (tipo_deposito) {
                whereClause += ' AND d.tipo = ?';
                params.push(tipo_deposito);
            }

            const sql = `
                SELECT 
                    m.id,
                    m.descripcion,
                    m.codigo_sku,
                    m.stock_minimo,
                    d.id as deposito_id,
                    d.nombre as deposito_nombre,
                    d.tipo as deposito_tipo,
                    COALESCE(sd.cantidad, 0) as stock_actual,
                    (m.stock_minimo - COALESCE(sd.cantidad, 0)) as cantidad_faltante,
                    
                    CASE 
                        WHEN COALESCE(sd.cantidad, 0) = 0 THEN 'CRITICO'
                        WHEN COALESCE(sd.cantidad, 0) <= m.stock_minimo * 0.5 THEN 'ALTO'
                        WHEN COALESCE(sd.cantidad, 0) <= m.stock_minimo THEN 'MEDIO'
                        ELSE 'BAJO'
                    END as nivel_urgencia

                FROM mercaderias m
                CROSS JOIN depositos d
                LEFT JOIN stock_depositos sd ON m.id = sd.mercaderia_id AND d.id = sd.deposito_id
                
                ${whereClause}
                AND d.activo = 1
                AND COALESCE(sd.cantidad, 0) <= m.stock_minimo
                
                ORDER BY 
                    CASE nivel_urgencia
                        WHEN 'CRITICO' THEN 1
                        WHEN 'ALTO' THEN 2
                        WHEN 'MEDIO' THEN 3
                        ELSE 4
                    END,
                    COALESCE(sd.cantidad, 0) ASC,
                    m.descripcion ASC
            `;

            const alertas = await db.query(sql, params);

            res.json({
                success: true,
                data: alertas,
                total: alertas.length,
                resumen: {
                    criticas: alertas.filter(a => a.nivel_urgencia === 'CRITICO').length,
                    altas: alertas.filter(a => a.nivel_urgencia === 'ALTO').length,
                    medias: alertas.filter(a => a.nivel_urgencia === 'MEDIO').length
                }
            });

        } catch (error) {
            logger.error('Error en getAlertas:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener alertas',
                error: error.message
            });
        }
    }

    // Obtener movimientos de stock
    async getMovimientos(req, res) {
        try {
            const { 
                tipo_movimiento,
                mercaderia_id,
                deposito_id,
                fecha_desde,
                fecha_hasta,
                limit = 50,
                page = 1
            } = req.query;

            let whereClause = 'WHERE 1=1';
            let params = [];

            if (tipo_movimiento) {
                whereClause += ' AND ms.tipo_movimiento = ?';
                params.push(tipo_movimiento);
            }

            if (mercaderia_id) {
                whereClause += ' AND ms.mercaderia_id = ?';
                params.push(mercaderia_id);
            }

            if (deposito_id) {
                whereClause += ' AND (ms.deposito_origen_id = ? OR ms.deposito_destino_id = ?)';
                params.push(deposito_id, deposito_id);
            }

            if (fecha_desde) {
                whereClause += ' AND DATE(ms.fecha_movimiento) >= ?';
                params.push(fecha_desde);
            }

            if (fecha_hasta) {
                whereClause += ' AND DATE(ms.fecha_movimiento) <= ?';
                params.push(fecha_hasta);
            }

            const sql = `
                SELECT 
                    ms.id,
                    ms.tipo_movimiento,
                    ms.fecha_movimiento,
                    ms.cantidad,
                    ms.precio_unitario,
                    ms.numero_documento,
                    ms.motivo,
                    ms.observaciones,
                    
                    m.descripcion as mercaderia,
                    m.codigo_sku,
                    
                    do.nombre as deposito_origen,
                    dd.nombre as deposito_destino,
                    
                    (ms.cantidad * ms.precio_unitario) as valor_total

                FROM movimientos_stock ms
                LEFT JOIN mercaderias m ON ms.mercaderia_id = m.id
                LEFT JOIN depositos do ON ms.deposito_origen_id = do.id
                LEFT JOIN depositos dd ON ms.deposito_destino_id = dd.id
                
                ${whereClause}
                
                ORDER BY ms.fecha_movimiento DESC, ms.id DESC
                LIMIT ? OFFSET ?
            `;

            params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));
            const movimientos = await db.query(sql, params);

            res.json({
                success: true,
                data: movimientos,
                total: movimientos.length,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit)
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

    // Obtener estadísticas generales
    async getEstadisticas(req, res) {
        try {
            const estadisticas = await db.query(`
                SELECT 
                    COUNT(DISTINCT m.id) as total_productos,
                    COUNT(DISTINCT d.id) as total_depositos,
                    SUM(CASE WHEN sd.cantidad > 0 THEN 1 ELSE 0 END) as items_con_stock,
                    SUM(sd.cantidad) as unidades_totales,
                    SUM(sd.cantidad * m.precio_costo) as valor_total_costo,
                    SUM(sd.cantidad * m.precio_venta) as valor_total_venta,
                    
                    -- Por tipo de depósito
                    SUM(CASE WHEN d.tipo = 'CENTRAL' THEN sd.cantidad ELSE 0 END) as stock_central,
                    SUM(CASE WHEN d.tipo = 'VENDEDOR' THEN sd.cantidad ELSE 0 END) as stock_vendedores,
                    SUM(CASE WHEN d.tipo = 'CLIENTE' THEN sd.cantidad ELSE 0 END) as stock_clientes,
                    
                    -- Alertas
                    COUNT(CASE WHEN sd.cantidad = 0 THEN 1 END) as sin_stock,
                    COUNT(CASE WHEN sd.cantidad > 0 AND sd.cantidad <= m.stock_minimo THEN 1 END) as stock_bajo

                FROM mercaderias m
                CROSS JOIN depositos d
                LEFT JOIN stock_depositos sd ON m.id = sd.mercaderia_id AND d.id = sd.deposito_id
                WHERE m.activo = 1 AND d.activo = 1
            `);

            res.json({
                success: true,
                data: estadisticas[0] || {}
            });

        } catch (error) {
            logger.error('Error en getEstadisticas:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener estadísticas',
                error: error.message
            });
        }
    }
}

module.exports = new StockController();