/**
 * Dashboard Routes
 * Rutas para metricas del dashboard
 */

const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { verifyToken, requirePermission } = require('../middleware/authMiddleware');

// GET /api/dashboard/ventas-hoy - Ventas del dia
router.get('/ventas-hoy',
  verifyToken,
  requirePermission('DASHBOARD_VER'),
  dashboardController.ventasHoy
);

// GET /api/dashboard/encomiendas-hoy - Encomiendas registradas hoy
router.get('/encomiendas-hoy',
  verifyToken,
  requirePermission('DASHBOARD_VER'),
  dashboardController.encomiendasHoy
);

// GET /api/dashboard/encomiendas-entregadas - Encomiendas entregadas (rango)
router.get('/encomiendas-entregadas',
  verifyToken,
  requirePermission('DASHBOARD_VER'),
  dashboardController.encomiendasEntregadas
);

// GET /api/dashboard/rutas-mas-usadas - Ranking rutas
router.get('/rutas-mas-usadas',
  verifyToken,
  requirePermission('DASHBOARD_VER'),
  dashboardController.rutasMasUsadas
);

// GET /api/dashboard/puntos-origen - Top puntos por origen
router.get('/puntos-origen',
  verifyToken,
  requirePermission('DASHBOARD_VER'),
  dashboardController.puntosOrigen
);

// GET /api/dashboard/puntos-destino - Top puntos por destino
router.get('/puntos-destino',
  verifyToken,
  requirePermission('DASHBOARD_VER'),
  dashboardController.puntosDestino
);

// GET /api/dashboard/ingreso-dia - Ingreso total del dia (pasajes + encomiendas)
router.get('/ingreso-dia',
  verifyToken,
  requirePermission('DASHBOARD_VER'),
  dashboardController.ingresoDia
);

// GET /api/dashboard/ingreso-pasajes - Ingreso por pasajes con desglose por agencia
router.get('/ingreso-pasajes',
  verifyToken,
  requirePermission('DASHBOARD_VER'),
  dashboardController.ingresoPasajes
);

// GET /api/dashboard/ingreso-encomiendas - Ingreso por encomiendas con desglose por agencia
router.get('/ingreso-encomiendas',
  verifyToken,
  requirePermission('DASHBOARD_VER'),
  dashboardController.ingresoEncomiendas
);

module.exports = router;
