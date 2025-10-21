// =============================================
// utils/compras-helper.js - Funciones Auxiliares para Compras
// =============================================
const moment = require('moment');

class ComprasHelper {
    // Calcular fecha de vencimiento sugerida basada en tipo de producto
    static calcularFechaVencimientoSugerida(categoriaId, fechaRecepcion) {
        const diasVencimiento = {
            1: 365,    // Electrónicos - 1 año
            2: 730,    // Ropa - 2 años  
            3: 1095,   // Hogar - 3 años
            4: 365,    // Deportes - 1 año
            5: 1825,   // Libros - 5 años
            6: 30      // Alimentación - 30 días
        };

        const dias = diasVencimiento[categoriaId] || 365;
        return moment(fechaRecepcion).add(dias, 'days').format('YYYY-MM-DD');
    }

    // Validar código de lote
    static validarCodigoLote(codigoLote) {
        if (!codigoLote) return false;
        // Formato sugerido: PROV-YYYYMMDD-NNN
        const regex = /^[A-Z0-9]{2,10}-\d{8}-\d{1,4}$/;
        return regex.test(codigoLote);
    }

    // Generar código de lote automático
    static generarCodigoLote(proveedorId, fecha = new Date()) {
        const fechaStr = moment(fecha).format('YYYYMMDD');
        const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        return `P${proveedorId.toString().padStart(3, '0')}-${fechaStr}-${random}`;
    }

    // Calcular descuento
    static calcularDescuento(precio, porcentaje) {
        return precio * (porcentaje / 100);
    }

    // Calcular precio con descuento
    static calcularPrecioConDescuento(precio, porcentajeDescuento) {
        return precio * (1 - (porcentajeDescuento / 100));
    }

    // Validar fechas de orden de compra
    static validarFechasOrden(fechaOrden, fechaEntrega) {
        const hoy = moment().startOf('day');
        const orden = moment(fechaOrden);
        const entrega = moment(fechaEntrega);

        if (orden.isBefore(hoy.clone().subtract(30, 'days'))) {
            throw new Error('La fecha de orden no puede ser más de 30 días en el pasado');
        }

        if (fechaEntrega && entrega.isBefore(orden)) {
            throw new Error('La fecha de entrega no puede ser anterior a la fecha de orden');
        }

        return true;
    }

    // Calcular estado de urgencia de orden
    static calcularUrgenciaOrden(fechaEntrega) {
        if (!fechaEntrega) return 'NORMAL';
        
        const hoy = moment();
        const entrega = moment(fechaEntrega);
        const diasRestantes = entrega.diff(hoy, 'days');

        if (diasRestantes < 0) return 'VENCIDA';
        if (diasRestantes <= 1) return 'URGENTE';
        if (diasRestantes <= 3) return 'PROXIMA';
        return 'NORMAL';
    }

    // Validar consistencia de precios
    static validarConsistenciaPrecios(items) {
        const errores = [];

        items.forEach((item, index) => {
            if (item.precio_unitario <= 0) {
                errores.push(`Item ${index + 1}: El precio debe ser mayor a cero`);
            }

            if (item.descuento_porcentaje && (item.descuento_porcentaje < 0 || item.descuento_porcentaje > 100)) {
                errores.push(`Item ${index + 1}: El descuento debe estar entre 0% y 100%`);
            }

            if (item.cantidad_solicitada <= 0) {
                errores.push(`Item ${index + 1}: La cantidad debe ser mayor a cero`);
            }
        });

        if (errores.length > 0) {
            throw new Error(errores.join(', '));
        }

        return true;
    }

    // Formatear moneda
    static formatearMoneda(monto, moneda = 'ARS') {
        const formatters = {
            ARS: new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }),
            USD: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }),
            EUR: new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
        };

        return formatters[moneda] ? formatters[moneda].format(monto) : `${moneda} ${monto.toFixed(2)}`;
    }

    // Calcular estadísticas de proveedor
    static async calcularEstadisticasProveedor(proveedorId, db) {
        try {
            const sql = `
                SELECT 
                    COUNT(*) as total_ordenes,
                    SUM(total) as monto_total,
                    AVG(total) as promedio_orden,
                    MIN(fecha_orden) as primera_orden,
                    MAX(fecha_orden) as ultima_orden,
                    SUM(CASE WHEN estado = 'RECIBIDA' THEN 1 ELSE 0 END) as ordenes_completadas,
                    AVG(DATEDIFF(fecha_entrega_esperada, fecha_orden)) as tiempo_entrega_promedio
                FROM ordenes_compra 
                WHERE proveedor_id = ? AND fecha_orden >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
            `;

            const result = await db.query(sql, [proveedorId]);
            return result[0];
        } catch (error) {
            throw error;
        }
    }
}

module.exports = ComprasHelper;