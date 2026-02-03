/**
 * Viajes Routes
 * Rutas para consulta de viajes
 */

const express = require('express');
const router = express.Router();
const viajesController = require('../controllers/viajesController');
const { verifyToken, requirePermission, requireOwnPoint } = require('../middleware/authMiddleware');

// GET /api/viajes - Listar viajes (filtros: fecha, ruta)
router.get('/',
  verifyToken,
  requirePermission(['PASAJES_VENDER', 'PASAJES_LISTAR']),
  viajesController.listar
);

// GET /api/viajes/disponibilidad - Obtener disponibilidad para venta
router.get('/disponibilidad',
  verifyToken,
  requirePermission('PASAJES_VENDER'),
  viajesController.disponibilidad
);

module.exports = router;
