// =============================================
// models/OrdenCompra.js - Modelo de Órdenes de Compra
// =============================================
const BaseModel = require('./BaseModel');
const db = require('../config/database');

class OrdenCompra extends BaseModel {
    constructor() {
        super('ordenes_compra', 'id');
    }

    async generateNumeroOrden() {
        try {
            const fecha = new Date();
            const año = fecha.getFullYear();
            const mes = String(fecha.getMonth() + 1).padStart(2, '0');
            
            // Buscar el último número del mes
            const sql = `
                SELECT numero_orden 
                FROM ${this.tableName} 
                WHERE numero_orden LIKE ?
                ORDER BY numero_orden DESC 
                LIMIT 1
            `;
            const patron = `OC-${año}${mes}-%`;
            const result = await db.query(sql, [patron]);
            
            let siguiente = 1;
            if (result.length > 0) {
                const ultimoNumero = result[0].numero_orden;
                const secuencia = parseInt(ultimoNumero.split('-')[2]) + 1;
                siguiente = secuencia;
            }
            
            return `OC-${año}${mes}-${String(siguiente).padStart(4, '0')}`;
        } catch (error) {
            throw error;
        }
    }

    async crearOrdenCompleta(ordenData, items) {
        try {
            return await db.transaction(async (connection) => {
                // Generar número de orden
                const numeroOrden = await this.generateNumeroOrden();
                
                // Calcular totales
                let subtotal = 0;
                for (const item of items) {
                    const itemSubtotal = item.cantidad_solicitada * item.precio_unitario * (1 - (item.descuento_porcentaje || 0) / 100);
                    subtotal += itemSubtotal;
                }
                
                const impuestos = ordenData.impuestos || 0;
                const total = subtotal + impuestos;
                
                // Crear orden
                const [ordenResult] = await connection.execute(`
                    INSERT INTO ${this.tableName} 
                    (numero_orden, proveedor_id, fecha_orden, fecha_entrega_esperada, 
                     subtotal, impuestos, total, moneda, tipo_cambio, observaciones, usuario_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    numeroOrden,
                    ordenData.proveedor_id,
                    ordenData.fecha_orden,
                    ordenData.fecha_entrega_esperada || null,
                    subtotal,
                    impuestos,
                    total,
                    ordenData.moneda || 'ARS',
                    ordenData.tipo_cambio || 1,
                    ordenData.observaciones || null,
                    ordenData.usuario_id
                ]);
                
                const ordenId = ordenResult.insertId;
                
                // Crear detalles
                for (const item of items) {
                    const itemSubtotal = item.cantidad_solicitada * item.precio_unitario * (1 - (item.descuento_porcentaje || 0) / 100);
                    
                    await connection.execute(`
                        INSERT INTO detalle_ordenes_compra 
                        (orden_compra_id, mercaderia_id, cantidad_solicitada, precio_unitario, 
                         descuento_porcentaje, subtotal, fecha_vencimiento, numero_lote, observaciones)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        ordenId,
                        item.mercaderia_id,
                        item.cantidad_solicitada,
                        item.precio_unitario,
                        item.descuento_porcentaje || 0,
                        itemSubtotal,
                        item.fecha_vencimiento || null,
                        item.numero_lote || null,
                        item.observaciones || null
                    ]);
                }
                
                return ordenId;
            });
        } catch (error) {
            throw error;
        }
    }

    async getOrdenConDetalles(ordenId) {
        try {
            const sql = `
                SELECT 
                    oc.*,
                    p.razonSocial as proveedor_nombre,
                    p.telefono as proveedor_telefono,
                    p.email as proveedor_email,
                    u.nombre as usuario_nombre
                FROM ${this.tableName} oc
                LEFT JOIN proveedores p ON oc.proveedor_id = p.proveedorId
                LEFT JOIN usuarios u ON oc.usuario_id = u.id
                WHERE oc.id = ?
            `;
            
            const ordenes = await db.query(sql, [ordenId]);
            if (ordenes.length === 0) return null;
            
            const orden = ordenes[0];
            
            // Obtener detalles
            const detallesSql = `
                SELECT 
                    doc.*,
                    m.descripcion as mercaderia_descripcion,
                    m.codigo_sku,
                    m.unidad_medida,
                    c.descripcion as categoria_nombre
                FROM detalle_ordenes_compra doc
                JOIN mercaderias m ON doc.mercaderia_id = m.id
                LEFT JOIN categorias c ON m.id_categoria = c.id
                WHERE doc.orden_compra_id = ?
                ORDER BY m.descripcion
            `;
            
            const detalles = await db.query(detallesSql, [ordenId]);
            orden.detalles = detalles;
            
            return orden;
        } catch (error) {
            throw error;
        }
    }

    async getOrdenesPendientes(proveedorId = null) {
        try {
            let whereClause = "WHERE oc.estado IN ('PENDIENTE', 'PARCIAL')";
            let params = [];

            if (proveedorId) {
                whereClause += " AND oc.proveedor_id = ?";
                params.push(proveedorId);
            }

            const sql = `
                SELECT 
                    oc.*,
                    p.razonSocial as proveedor_nombre,
                    COUNT(doc.id) as total_items,
                    SUM(doc.cantidad_solicitada) as cantidad_total_solicitada,
                    SUM(doc.cantidad_recibida) as cantidad_total_recibida
                FROM ${this.tableName} oc
                LEFT JOIN proveedores p ON oc.proveedor_id = p.proveedorId
                LEFT JOIN detalle_ordenes_compra doc ON oc.id = doc.orden_compra_id
                ${whereClause}
                GROUP BY oc.id
                ORDER BY oc.fecha_orden DESC
            `;

            return await db.query(sql, params);
        } catch (error) {
            throw error;
        }
    }
}

module.exports = new OrdenCompra();