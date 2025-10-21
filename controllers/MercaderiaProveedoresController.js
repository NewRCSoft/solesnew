// =============================================
// controllers/MercaderiaProveedoresController.js - VERSIÓN FINAL CORREGIDA
// =============================================
const db = require('../config/database');
const logger = require('../config/logger');

// =============================================
// HELPER PARA MANEJO SEGURO DE RESULTADOS DE BASE DE DATOS
// Agregar al inicio de tu controlador MercaderiaProveedoresController.js
// =============================================

/**
 * Extrae los datos de una consulta de manera segura
 * Maneja diferentes formatos de respuesta de drivers de MySQL
 * @param {any} result - Resultado de db.query()
 * @returns {Array} - Array con los datos
 */
function extraerDatosSeguro(result) {
    try {
        // Si ya es un array de datos, devolverlo
        if (Array.isArray(result) && (result.length === 0 || typeof result[0] === 'object')) {
            return result;
        }
        
        // Si es [rows, fields] formato común en mysql2
        if (Array.isArray(result) && result.length >= 1 && Array.isArray(result[0])) {
            return result[0];
        }
        
        // Si es [[rows], fields] formato en algunos casos
        if (Array.isArray(result) && result.length >= 1 && Array.isArray(result[0]) && Array.isArray(result[0][0])) {
            return result[0][0];
        }
        
        // Si es un objeto con propiedad rows o similar
        if (result && typeof result === 'object' && result.rows) {
            return Array.isArray(result.rows) ? result.rows : [result.rows];
        }
        
        // Si es un objeto simple, convertirlo a array
        if (result && typeof result === 'object' && !Array.isArray(result)) {
            return [result];
        }
        
        // Fallback: devolver array vacío
        console.warn('⚠️ Formato de resultado de DB no reconocido:', typeof result, result);
        return [];
        
    } catch (error) {
        console.error('❌ Error extrayendo datos de DB:', error);
        return [];
    }
}

/**
 * Ejecuta una consulta de manera segura con logging
 * @param {string} sql - Consulta SQL
 * @param {Array} params - Parámetros de la consulta
 * @param {string} operacion - Descripción de la operación para logging
 * @returns {Promise<Array>} - Datos extraídos
 */
async function consultaSegura(sql, params = [], operacion = 'consulta') {
    try {
        console.log(`🔍 Ejecutando ${operacion}:`, { sql: sql.substring(0, 100) + '...', params });
        
        const resultado = await db.query(sql, params);
        const datos = extraerDatosSeguro(resultado);
        
        console.log(`✅ ${operacion} completada:`, {
            filas: Array.isArray(datos) ? datos.length : 'N/A',
            tipo: typeof datos
        });
        
        return datos;
        
    } catch (error) {
        console.error(`❌ Error en ${operacion}:`, {
            error: error.message,
            sql: sql.substring(0, 100) + '...',
            params
        });
        throw error;
    }
}

/**
 * Verifica si existe un registro
 * @param {string} tabla - Nombre de la tabla
 * @param {string} campo - Campo a verificar
 * @param {any} valor - Valor a buscar
 * @returns {Promise<boolean>} - true si existe
 */
async function existeRegistro(tabla, campo, valor) {
    try {
        const datos = await consultaSegura(
            `SELECT ${campo} FROM ${tabla} WHERE ${campo} = ? LIMIT 1`,
            [valor],
            `verificar existencia en ${tabla}`
        );
        
        return Array.isArray(datos) && datos.length > 0;
        
    } catch (error) {
        console.error(`❌ Error verificando existencia en ${tabla}:`, error);
        return false;
    }
}

class MercaderiaProveedoresController {
    
    // GET /api/v1/mercaderias/:id/proveedores - Obtener proveedores de una mercadería
    async getProveedoresMercaderia(req, res) {
    try {
        const { id } = req.params;
        
        // Validar que el ID sea un número válido
        if (!id || isNaN(parseInt(id))) {
            return res.status(400).json({
                success: false,
                message: 'ID de mercadería inválido',
                data: []
            });
        }
        
        // Verificar que la mercadería existe usando helper seguro
        const existeMercaderia = await existeRegistro('mercaderias', 'id', id);
        if (!existeMercaderia) {
            return res.status(404).json({
                success: false,
                message: 'Mercadería no encontrada',
                data: []
            });
        }
        
        // Obtener proveedores usando helper seguro
        const proveedores = await consultaSegura(`
            SELECT 
                mp.id as relacion_id,
                mp.mercaderia_id,
                mp.proveedor_id,
                COALESCE(mp.precio_compra, 0) as precio_compra,
                COALESCE(mp.moneda, 'ARS') as moneda,
                COALESCE(mp.es_proveedor_principal, 0) as es_proveedor_principal,
                COALESCE(mp.tiempo_entrega_dias, 7) as tiempo_entrega_dias,
                COALESCE(mp.codigo_producto_proveedor, '') as codigo_producto_proveedor,
                COALESCE(mp.cantidad_minima_pedido, 1) as cantidad_minima_pedido,
                COALESCE(mp.descuento_porcentaje, 0) as descuento_porcentaje,
                COALESCE(mp.condiciones_pago, '') as condiciones_pago,
                COALESCE(mp.observaciones, '') as observaciones,
                mp.fecha_ultimo_precio,
                mp.fecha_ultima_compra,
                COALESCE(mp.activo, 1) as activo,
                mp.created_at,
                mp.updated_at,
                -- Datos del proveedor
                COALESCE(p.razonSocial, '') as razonSocial,
                COALESCE(p.cuit, '') as cuit,
                COALESCE(p.telefono, '') as telefono,
                COALESCE(p.email, '') as email,
                COALESCE(p.domicilio, '') as domicilio,
                -- Datos de la mercadería
                COALESCE(m.descripcion, '') as mercaderia_descripcion,
                COALESCE(m.codigo_sku, '') as codigo_sku,
                COALESCE(m.precio_venta, 0) as precio_venta_mercaderia
            FROM mercaderia_proveedores mp
            INNER JOIN proveedores p ON mp.proveedor_id = p.proveedorId
            INNER JOIN mercaderias m ON mp.mercaderia_id = m.id
            WHERE mp.mercaderia_id = ? AND mp.activo = 1
            ORDER BY mp.es_proveedor_principal DESC, mp.precio_compra ASC
        `, [id], 'obtener proveedores de mercadería');
        
        // Respuesta exitosa
        res.json({
            success: true,
            data: proveedores,
            total: proveedores.length,
            message: proveedores.length > 0 
                ? `Se encontraron ${proveedores.length} proveedores`
                : 'Esta mercadería no tiene proveedores asignados'
        });
        
    } catch (error) {
        logger.error('Error general en getProveedoresMercaderia:', {
            error: error.message,
            stack: error.stack,
            mercaderiaId: req.params.id
        });
        
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor al obtener proveedores',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Error interno',
            data: []
        });
    }
}
    
    // GET /api/v1/proveedores/:id/mercaderias - Obtener mercaderías de un proveedor
    async getMercaderiasProveedor(req, res) {
        try {
            const { id } = req.params;
            
            // Validar que el ID sea válido
            if (!id || isNaN(parseInt(id))) {
                return res.status(400).json({
                    success: false,
                    message: 'ID de proveedor inválido',
                    data: []
                });
            }
            
            // Verificar que el proveedor existe
            let proveedorExiste;
            try {
                [proveedorExiste] = await db.query(
                    'SELECT proveedorId, razonSocial FROM proveedores WHERE proveedorId = ?',
                    [id]
                );
            } catch (dbError) {
                logger.error('Error consultando proveedor:', { error: dbError.message, proveedorId: id });
                return res.status(500).json({
                    success: false,
                    message: 'Error consultando la base de datos',
                    data: []
                });
            }
            
            if (!proveedorExiste || !Array.isArray(proveedorExiste) || proveedorExiste.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Proveedor no encontrado',
                    data: []
                });
            }
            
            let mercaderias = [];
            try {
                const result = await db.query(`
                    SELECT 
                        mp.id as relacion_id,
                        mp.mercaderia_id,
                        mp.proveedor_id,
                        COALESCE(mp.precio_compra, 0) as precio_compra,
                        COALESCE(mp.moneda, 'ARS') as moneda,
                        COALESCE(mp.es_proveedor_principal, 0) as es_proveedor_principal,
                        COALESCE(mp.tiempo_entrega_dias, 7) as tiempo_entrega_dias,
                        COALESCE(mp.codigo_producto_proveedor, '') as codigo_producto_proveedor,
                        COALESCE(mp.cantidad_minima_pedido, 1) as cantidad_minima_pedido,
                        COALESCE(mp.descuento_porcentaje, 0) as descuento_porcentaje,
                        COALESCE(mp.condiciones_pago, '') as condiciones_pago,
                        COALESCE(mp.observaciones, '') as observaciones,
                        mp.fecha_ultimo_precio,
                        mp.fecha_ultima_compra,
                        COALESCE(mp.activo, 1) as activo,
                        -- Datos de la mercadería
                        COALESCE(m.descripcion, '') as descripcion,
                        COALESCE(m.codigo_sku, '') as codigo_sku,
                        COALESCE(m.precio_venta, 0) as precio_venta,
                        COALESCE(m.precio_costo, 0) as precio_costo,
                        COALESCE(m.stock_minimo, 0) as stock_minimo,
                        COALESCE(m.unidad_medida, '') as unidad_medida,
                        -- Datos del proveedor
                        COALESCE(p.razonSocial, '') as razonSocial,
                        COALESCE(p.cuit, '') as cuit
                    FROM mercaderia_proveedores mp
                    INNER JOIN mercaderias m ON mp.mercaderia_id = m.id
                    INNER JOIN proveedores p ON mp.proveedor_id = p.proveedorId
                    WHERE mp.proveedor_id = ? AND mp.activo = 1
                    ORDER BY m.descripcion ASC
                `, [id]);
                
                // Manejo seguro del resultado
                if (result && Array.isArray(result) && result.length > 0) {
                    mercaderias = result[0] || [];
                } else if (result && Array.isArray(result[0])) {
                    mercaderias = result[0] || [];
                } else {
                    mercaderias = [];
                }
                
            } catch (dbError) {
                logger.error('Error consultando mercaderías del proveedor:', { 
                    error: dbError.message,
                    proveedorId: id 
                });
                mercaderias = [];
            }
            
            // Asegurar que sea array
            if (!Array.isArray(mercaderias)) {
                mercaderias = [];
            }

            res.json({
                success: true,
                data: mercaderias,
                total: mercaderias.length,
                message: mercaderias.length > 0 
                    ? `El proveedor tiene ${mercaderias.length} mercaderías`
                    : 'Este proveedor no tiene mercaderías asignadas',
                proveedor: {
                    id: proveedorExiste[0].proveedorId,
                    razonSocial: proveedorExiste[0].razonSocial
                }
            });
            
        } catch (error) {
            logger.error('Error general en getMercaderiasProveedor:', {
                error: error.message,
                stack: error.stack,
                proveedorId: req.params.id
            });
            
            res.status(500).json({
                success: false,
                message: 'Error interno del servidor al obtener mercaderías',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Error interno',
                data: []
            });
        }
    }
    
    // POST /api/v1/mercaderias/:id/proveedores - Asignar proveedor a mercadería
    async asignarProveedor(req, res) {
    try {
        const { id } = req.params; // mercaderia_id
        
        // ⚠️ CORRECCIÓN: Manejo seguro del body sin destructuring complejo
        const body = req.body || {};
        const proveedor_id = body.proveedor_id;
        const precio_compra = body.precio_compra;
        const es_proveedor_principal = body.es_proveedor_principal || false;
        const tiempo_entrega_dias = body.tiempo_entrega_dias || 7;
        const codigo_producto_proveedor = body.codigo_producto_proveedor || '';
        const cantidad_minima_pedido = body.cantidad_minima_pedido || 1;
        const descuento_porcentaje = body.descuento_porcentaje || 0;
        const condiciones_pago = body.condiciones_pago || '';
        const observaciones = body.observaciones || '';
        const moneda = body.moneda || 'ARS';
        
        console.log('📝 Datos recibidos:', {
            mercaderia_id: id,
            proveedor_id,
            precio_compra,
            es_proveedor_principal
        });
        
        // Validaciones básicas
        if (!id || isNaN(parseInt(id))) {
            return res.status(400).json({
                success: false,
                message: 'ID de mercadería inválido'
            });
        }
        
        if (!proveedor_id || isNaN(parseInt(proveedor_id))) {
            return res.status(400).json({
                success: false,
                message: 'ID del proveedor es requerido y debe ser válido'
            });
        }
        
        if (precio_compra === undefined || precio_compra === null || isNaN(parseFloat(precio_compra)) || parseFloat(precio_compra) < 0) {
            return res.status(400).json({
                success: false,
                message: 'El precio de compra es requerido y debe ser un número válido mayor o igual a 0'
            });
        }
        
        // Verificar que existe la mercadería
        console.log('🔍 Verificando existencia de mercadería...');
        let mercaderiaResult;
        try {
            mercaderiaResult = await db.query('SELECT id FROM mercaderias WHERE id = ?', [id]);
            
            // ⚠️ CORRECCIÓN: Manejo seguro del resultado sin destructuring
            let mercaderia;
            if (Array.isArray(mercaderiaResult)) {
                mercaderia = mercaderiaResult[0]; // Algunos drivers devuelven [rows, fields]
            } else if (mercaderiaResult && Array.isArray(mercaderiaResult[0])) {
                mercaderia = mercaderiaResult[0][0]; // Otros devuelven [[rows], fields]
            } else {
                mercaderia = mercaderiaResult; // Algunos devuelven directamente el resultado
            }
            
            if (!mercaderia || (Array.isArray(mercaderia) && mercaderia.length === 0)) {
                return res.status(404).json({
                    success: false,
                    message: 'Mercadería no encontrada'
                });
            }
            
        } catch (dbError) {
            logger.error('Error verificando mercadería:', { error: dbError.message, mercaderiaId: id });
            return res.status(500).json({
                success: false,
                message: 'Error verificando la mercadería en la base de datos'
            });
        }
        
        // Verificar que existe el proveedor
        console.log('🔍 Verificando existencia de proveedor...');
        let proveedorResult;
        try {
            proveedorResult = await db.query('SELECT proveedorId FROM proveedores WHERE proveedorId = ?', [proveedor_id]);
            
            // ⚠️ CORRECCIÓN: Manejo seguro del resultado sin destructuring
            let proveedor;
            if (Array.isArray(proveedorResult)) {
                proveedor = proveedorResult[0];
            } else if (proveedorResult && Array.isArray(proveedorResult[0])) {
                proveedor = proveedorResult[0][0];
            } else {
                proveedor = proveedorResult;
            }
            
            if (!proveedor || (Array.isArray(proveedor) && proveedor.length === 0)) {
                return res.status(404).json({
                    success: false,
                    message: 'Proveedor no encontrado'
                });
            }
            
        } catch (dbError) {
            logger.error('Error verificando proveedor:', { error: dbError.message, proveedorId: proveedor_id });
            return res.status(500).json({
                success: false,
                message: 'Error verificando el proveedor en la base de datos'
            });
        }
        
        // Si es proveedor principal, desmarcar otros
        if (es_proveedor_principal) {
            console.log('⭐ Desmarcando otros proveedores principales...');
            try {
                await db.query(`
                    UPDATE mercaderia_proveedores 
                    SET es_proveedor_principal = 0 
                    WHERE mercaderia_id = ? AND proveedor_id != ?
                `, [id, proveedor_id]);
            } catch (dbError) {
                logger.error('Error desmarcando proveedor principal:', { error: dbError.message });
                // No bloquear la operación por este error
            }
        }
        
        // Insertar o actualizar la relación
        console.log('💾 Guardando relación mercadería-proveedor...');
        let result;
        try {
            const insertResult = await db.query(`
                INSERT INTO mercaderia_proveedores 
                (mercaderia_id, proveedor_id, precio_compra, es_proveedor_principal, 
                 tiempo_entrega_dias, codigo_producto_proveedor, cantidad_minima_pedido,
                 descuento_porcentaje, condiciones_pago, observaciones, moneda, 
                 fecha_ultimo_precio)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
                ON DUPLICATE KEY UPDATE
                precio_compra = VALUES(precio_compra),
                es_proveedor_principal = VALUES(es_proveedor_principal),
                tiempo_entrega_dias = VALUES(tiempo_entrega_dias),
                codigo_producto_proveedor = VALUES(codigo_producto_proveedor),
                cantidad_minima_pedido = VALUES(cantidad_minima_pedido),
                descuento_porcentaje = VALUES(descuento_porcentaje),
                condiciones_pago = VALUES(condiciones_pago),
                observaciones = VALUES(observaciones),
                moneda = VALUES(moneda),
                fecha_ultimo_precio = NOW(),
                updated_at = CURRENT_TIMESTAMP,
                activo = 1
            `, [
                id, proveedor_id, precio_compra, es_proveedor_principal,
                tiempo_entrega_dias, codigo_producto_proveedor, cantidad_minima_pedido,
                descuento_porcentaje, condiciones_pago, observaciones, moneda
            ]);
            
            // ⚠️ CORRECCIÓN: Manejo seguro del resultado sin destructuring
            if (Array.isArray(insertResult)) {
                result = insertResult[0];
            } else if (insertResult && Array.isArray(insertResult[0])) {
                result = insertResult[0][0];
            } else {
                result = insertResult;
            }
            
        } catch (dbError) {
            logger.error('Error insertando/actualizando relación:', { 
                error: dbError.message,
                mercaderiaId: id,
                proveedorId: proveedor_id,
                precio: precio_compra
            });
            
            // Verificar si es error de duplicado
            if (dbError.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({
                    success: false,
                    message: 'Ya existe una relación entre esta mercadería y este proveedor'
                });
            }
            
            return res.status(500).json({
                success: false,
                message: 'Error al guardar la relación proveedor-mercadería'
            });
        }
        
        console.log('✅ Relación guardada exitosamente:', {
            insertId: result.insertId,
            affectedRows: result.affectedRows
        });
        
        res.json({
            success: true,
            message: 'Proveedor asignado exitosamente',
            data: {
                id: result.insertId || result.affectedRows,
                mercaderia_id: parseInt(id),
                proveedor_id: parseInt(proveedor_id),
                precio_compra: parseFloat(precio_compra),
                es_proveedor_principal: Boolean(es_proveedor_principal)
            }
        });
        
    } catch (error) {
        logger.error('Error general en asignarProveedor:', {
            error: error.message,
            stack: error.stack,
            body: req.body,
            params: req.params
        });
        
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor al asignar proveedor',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Error interno'
        });
    }
}
    
    // PUT /api/v1/mercaderias/:mercaderia_id/proveedores/:proveedor_id - Actualizar relación
    async actualizarRelacion(req, res) {
        try {
            const { mercaderia_id, proveedor_id } = req.params;
            const updateData = req.body;
            
            // Validaciones
            if (!mercaderia_id || isNaN(parseInt(mercaderia_id))) {
                return res.status(400).json({
                    success: false,
                    message: 'ID de mercadería inválido'
                });
            }
            
            if (!proveedor_id || isNaN(parseInt(proveedor_id))) {
                return res.status(400).json({
                    success: false,
                    message: 'ID de proveedor inválido'
                });
            }
            
            // Si se está marcando como principal, desmarcar otros
            if (updateData.es_proveedor_principal) {
                try {
                    await db.query(`
                        UPDATE mercaderia_proveedores 
                        SET es_proveedor_principal = 0 
                        WHERE mercaderia_id = ? AND proveedor_id != ?
                    `, [mercaderia_id, proveedor_id]);
                } catch (dbError) {
                    logger.error('Error desmarcando proveedor principal:', { error: dbError.message });
                    // No bloquear la operación
                }
            }
            
            // Construir query dinámico para actualización
            const allowedFields = [
                'precio_compra', 'es_proveedor_principal', 'tiempo_entrega_dias',
                'codigo_producto_proveedor', 'cantidad_minima_pedido', 'descuento_porcentaje',
                'condiciones_pago', 'observaciones', 'moneda', 'activo'
            ];
            
            const updates = [];
            const values = [];
            
            for (const [key, value] of Object.entries(updateData)) {
                if (allowedFields.includes(key)) {
                    updates.push(`${key} = ?`);
                    values.push(value);
                }
            }
            
            if (updates.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No hay campos válidos para actualizar'
                });
            }
            
            // Agregar fecha de actualización de precio si se actualiza el precio
            if (updateData.precio_compra !== undefined) {
                updates.push('fecha_ultimo_precio = NOW()');
            }
            
            updates.push('updated_at = CURRENT_TIMESTAMP');
            values.push(mercaderia_id, proveedor_id);
            
            let result;
            try {
                [result] = await db.query(`
                    UPDATE mercaderia_proveedores 
                    SET ${updates.join(', ')}
                    WHERE mercaderia_id = ? AND proveedor_id = ?
                `, values);
            } catch (dbError) {
                logger.error('Error actualizando relación:', { 
                    error: dbError.message,
                    mercaderiaId: mercaderia_id,
                    proveedorId: proveedor_id
                });
                return res.status(500).json({
                    success: false,
                    message: 'Error al actualizar la relación'
                });
            }
            
            if (!result || result.affectedRows === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Relación mercadería-proveedor no encontrada'
                });
            }
            
            res.json({
                success: true,
                message: 'Relación actualizada exitosamente'
            });
            
        } catch (error) {
            logger.error('Error general en actualizarRelacion:', {
                error: error.message,
                stack: error.stack,
                params: req.params,
                body: req.body
            });
            
            res.status(500).json({
                success: false,
                message: 'Error interno del servidor al actualizar la relación',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Error interno'
            });
        }
    }
    
    // DELETE /api/v1/mercaderias/:mercaderia_id/proveedores/:proveedor_id - Eliminar relación
    async eliminarRelacion(req, res) {
    try {
        const { mercaderia_id, proveedor_id } = req.params;
        
        // Validaciones
        if (!mercaderia_id || isNaN(parseInt(mercaderia_id))) {
            return res.status(400).json({
                success: false,
                message: 'ID de mercadería inválido'
            });
        }
        
        if (!proveedor_id || isNaN(parseInt(proveedor_id))) {
            return res.status(400).json({
                success: false,
                message: 'ID de proveedor inválido'
            });
        }
        
        // Ejecutar query sin destructuring problemático
        let result;
        try {
            const queryResult = await db.query(`
                UPDATE mercaderia_proveedores 
                SET activo = 0, updated_at = CURRENT_TIMESTAMP
                WHERE mercaderia_id = ? AND proveedor_id = ?
            `, [mercaderia_id, proveedor_id]);
            
            // Ajustar según tu librería de MySQL
            result = Array.isArray(queryResult) ? queryResult[0] : queryResult;
            
        } catch (dbError) {
            logger.error('Error eliminando relación:', { 
                error: dbError.message,
                mercaderiaId: mercaderia_id,
                proveedorId: proveedor_id
            });
            return res.status(500).json({
                success: false,
                message: 'Error al eliminar la relación'
            });
        }
        
        if (!result || result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Relación mercadería-proveedor no encontrada'
            });
        }
        
        res.json({
            success: true,
            message: 'Proveedor desvinculado exitosamente'
        });
        
    } catch (error) {
        logger.error('Error general en eliminarRelacion:', {
            error: error.message,
            stack: error.stack,
            params: req.params
        });
        
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor al eliminar la relación',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Error interno'
        });
    }
}
    
    // GET /api/v1/mercaderias/:id/proveedores/mejor-precio - Obtener mejor precio
    async getMejorPrecio(req, res) {
        try {
            const { id } = req.params;
            
            if (!id || isNaN(parseInt(id))) {
                return res.status(400).json({
                    success: false,
                    message: 'ID de mercadería inválido'
                });
            }
            
            let resultado = [];
            try {
                [resultado] = await db.query(`
                    SELECT 
                        COALESCE(mp.precio_compra, 0) as precio_compra,
                        COALESCE(mp.tiempo_entrega_dias, 7) as tiempo_entrega_dias,
                        COALESCE(p.razonSocial, '') as razonSocial,
                        p.proveedorId,
                        COALESCE(mp.codigo_producto_proveedor, '') as codigo_producto_proveedor
                    FROM mercaderia_proveedores mp
                    INNER JOIN proveedores p ON mp.proveedor_id = p.proveedorId
                    WHERE mp.mercaderia_id = ? AND mp.activo = 1
                    ORDER BY mp.precio_compra ASC, mp.tiempo_entrega_dias ASC
                    LIMIT 1
                `, [id]);
            } catch (dbError) {
                logger.error('Error obteniendo mejor precio:', { 
                    error: dbError.message,
                    mercaderiaId: id 
                });
                return res.status(500).json({
                    success: false,
                    message: 'Error consultando mejor precio'
                });
            }
            
            if (!resultado || !Array.isArray(resultado) || resultado.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'No se encontraron proveedores para esta mercadería',
                    data: null
                });
            }
            
            res.json({
                success: true,
                data: resultado[0],
                message: 'Mejor precio encontrado'
            });
            
        } catch (error) {
            logger.error('Error general en getMejorPrecio:', {
                error: error.message,
                stack: error.stack,
                mercaderiaId: req.params.id
            });
            
            res.status(500).json({
                success: false,
                message: 'Error interno del servidor al obtener el mejor precio',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Error interno'
            });
        }
    }
    
    // GET /api/v1/reportes/mercaderias-sin-proveedores - Reporte de mercaderías sin proveedores
    async getMercaderiasSinProveedores(req, res) {
        try {
            let mercaderias = [];
            try {
                [mercaderias] = await db.query(`
                    SELECT 
                        m.id,
                        COALESCE(m.descripcion, '') as descripcion,
                        COALESCE(m.codigo_sku, '') as codigo_sku,
                        COALESCE(m.precio_venta, 0) as precio_venta,
                        COALESCE(m.precio_costo, 0) as precio_costo,
                        COALESCE(c.categoria, 'Sin categoría') as categoria
                    FROM mercaderias m
                    LEFT JOIN categorias c ON m.id_categoria = c.id
                    LEFT JOIN mercaderia_proveedores mp ON m.id = mp.mercaderia_id AND mp.activo = 1
                    WHERE mp.mercaderia_id IS NULL AND m.activo = 1
                    ORDER BY m.descripcion ASC
                `);
            } catch (dbError) {
                logger.error('Error en reporte de mercaderías sin proveedores:', { error: dbError.message });
                mercaderias = [];
            }
            
            // Asegurar que sea array
            if (!Array.isArray(mercaderias)) {
                mercaderias = [];
            }
            
            res.json({
                success: true,
                data: mercaderias,
                total: mercaderias.length,
                message: mercaderias.length > 0 
                    ? `Se encontraron ${mercaderias.length} mercaderías sin proveedores`
                    : 'Todas las mercaderías tienen al menos un proveedor asignado'
            });
            
        } catch (error) {
            logger.error('Error general en getMercaderiasSinProveedores:', {
                error: error.message,
                stack: error.stack
            });
            
            res.status(500).json({
                success: false,
                message: 'Error interno del servidor al generar reporte',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Error interno',
                data: []
            });
        }
    }
}

module.exports = MercaderiaProveedoresController;