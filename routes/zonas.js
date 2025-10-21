// =============================================
// routes/zonas.js - Rutas de Zonas
// =============================================
const express = require('express');
const router = express.Router();
const ZonasController = require('../controllers/ZonasController')

// =============================================
// RUTAS BÁSICAS CRUD
// =============================================

// GET /api/v1/zonas - Listar zonas
router.get('/', ZonasController.index);

// GET /api/v1/zonas/:id - Obtener zona específica
router.get('/:id', ZonasController.show);

// POST /api/v1/zonas - Crear nueva zona
router.post('/', ZonasController.create);

// PUT /api/v1/zonas/:id - Actualizar zona
router.put('/:id', ZonasController.update);

// DELETE /api/v1/zonas/:id - Eliminar zona
router.delete('/:id', ZonasController.destroy);

// =============================================
// RUTAS ESPECIALES
// =============================================

// GET /api/v1/zonas/:id/clientes - Obtener clientes de una zona
router.get('/:id/clientes', ZonasController.getClientes);

// GET /api/v1/zonas/:id/estadisticas - Obtener estadísticas de la zona
router.get('/:id/estadisticas', ZonasController.getEstadisticas);

// PUT /api/v1/zonas/:id/toggle-active - Alternar estado activo/inactivo
router.put('/:id/toggle-active', ZonasController.toggleActive);

// =============================================
// RUTAS ADICIONALES DE CONSULTA
// =============================================

// GET /api/v1/zonas/stats/resumen - Estadísticas generales de zonas
router.get('/stats/resumen', async (req, res) => {
    try {
        const db = require('../config/database');

        const stats = await db.query(`
            SELECT 
                COUNT(*) as total_zonas,
                COUNT(CASE WHEN activo = 1 THEN 1 END) as zonas_activas,
                COUNT(CASE WHEN activo = 0 THEN 1 END) as zonas_inactivas
            FROM zonas
        `);

        const clientesStats = await db.query(`
            SELECT 
                COUNT(DISTINCT c.zonaId) as zonas_con_clientes,
                COUNT(c.clienteId) as total_clientes_en_zonas
            FROM clientes c 
            INNER JOIN zonas z ON c.zonaId = z.zonaId 
            WHERE c.activo = 1 AND z.activo = 1
        `);

        const [estadisticas] = stats;
        const [clientesEstadisticas] = clientesStats;

        res.json({
            success: true,
            data: {
                ...estadisticas,
                ...clientesEstadisticas
            }
        });
    } catch (error) {
        console.error('Error obteniendo estadísticas de zonas:', error);
        res.status(500).json({
            success: false,
            message: 'Error obteniendo estadísticas de zonas',
            error: error.message
        });
    }
});

// GET /api/v1/zonas/activas - Obtener solo zonas activas (para selects)
router.get('/activas', async (req, res) => {
    try {
        const db = require('../config/database');

        const zonas = await db.query(`
            SELECT zonaId, zona, fecha_creacion
            FROM zonas 
            WHERE activo = 1 
            ORDER BY zona ASC
        `);

        res.json({
            success: true,
            data: zonas,
            count: zonas.length
        });
    } catch (error) {
        console.error('Error obteniendo zonas activas:', error);
        res.status(500).json({
            success: false,
            message: 'Error obteniendo zonas activas',
            error: error.message
        });
    }
});

module.exports = router;