/**
 * Facturación Routes
 * Rutas para el módulo de facturación electrónica
 */

const express = require('express');
const router = express.Router();
const facturacionController = require('../controllers/facturacionController');
const { verifyToken, requirePermission } = require('../middleware/authMiddleware');

// Todas las rutas requieren autenticación
router.use(verifyToken);

// =============================================================================
// MÉTRICAS Y DASHBOARD
// =============================================================================

// GET /api/facturacion/metricas - Obtener métricas de facturación
router.get('/metricas', requirePermission('FACTURACION_VER'), facturacionController.obtenerMetricas);

// =============================================================================
// COMPROBANTES (FACTURAS Y BOLETAS)
// =============================================================================

// GET /api/facturacion/comprobantes - Listar comprobantes
router.get('/comprobantes', requirePermission('FACTURACION_VER'), facturacionController.listarComprobantes);

// GET /api/facturacion/comprobantes/:id - Obtener comprobante por ID
router.get('/comprobantes/:id', requirePermission('FACTURACION_VER'), facturacionController.obtenerComprobante);

// POST /api/facturacion/comprobantes - Emitir comprobante manual
router.post('/comprobantes', requirePermission('FACTURACION_EMITIR'), facturacionController.emitirComprobante);

// POST /api/facturacion/comprobantes/:id/anular - Anular comprobante
router.post('/comprobantes/:id/anular', requirePermission('FACTURACION_ANULAR'), facturacionController.anularComprobante);

// POST /api/facturacion/emitir/ticket/:ticketId - Emitir desde ticket
router.post('/emitir/ticket/:ticketId', requirePermission('FACTURACION_EMITIR'), facturacionController.emitirDesdeTicket);

// POST /api/facturacion/emitir/encomienda/:encomiendaId - Emitir desde encomienda
router.post('/emitir/encomienda/:encomiendaId', requirePermission('FACTURACION_EMITIR'), facturacionController.emitirDesdeEncomienda);

// =============================================================================
// GUÍAS DE REMISIÓN
// =============================================================================

// GET /api/facturacion/guias - Listar guías de remisión
router.get('/guias', requirePermission('FACTURACION_VER'), facturacionController.listarGuias);

// GET /api/facturacion/guias/:id - Obtener guía por ID
router.get('/guias/:id', requirePermission('FACTURACION_VER'), facturacionController.obtenerGuia);

// POST /api/facturacion/guias - Emitir guía de remisión manual
router.post('/guias', requirePermission('FACTURACION_EMITIR'), facturacionController.emitirGuia);

// POST /api/facturacion/guias/encomienda/:encomiendaId - Emitir guía desde encomienda
router.post('/guias/encomienda/:encomiendaId', requirePermission('FACTURACION_EMITIR'), facturacionController.emitirGuiaDesdeEncomienda);

// POST /api/facturacion/guias/:id/anular - Anular guía de remisión
router.post('/guias/:id/anular', requirePermission('FACTURACION_ANULAR'), facturacionController.anularGuia);

// =============================================================================
// CONFIGURACIÓN
// =============================================================================

// GET /api/facturacion/configuracion - Obtener configuración SUNAT
router.get('/configuracion', requirePermission('FACTURACION_VER'), facturacionController.obtenerConfiguracionSunat);

// PUT /api/facturacion/configuracion - Actualizar configuración SUNAT
router.put('/configuracion', requirePermission('FACTURACION_VER'), facturacionController.actualizarConfiguracionSunat);

// GET /api/facturacion/series - Obtener series disponibles
router.get('/series', requirePermission('FACTURACION_VER'), facturacionController.obtenerSeries);

module.exports = router;
