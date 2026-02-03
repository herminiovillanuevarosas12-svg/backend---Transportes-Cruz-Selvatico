/**
 * Configuracion Routes
 * Rutas para configuracion del sistema
 */

const express = require('express');
const router = express.Router();
const configuracionController = require('../controllers/configuracionController');
const { verifyToken, requirePermission } = require('../middleware/authMiddleware');

// GET /api/configuracion - Obtener configuracion general del sistema
// Permitido para: admins (dashboard) y vendedores (necesitan config de puntos para ventas)
router.get('/',
  verifyToken,
  requirePermission(['DASHBOARD_VER', 'PASAJES_VENDER']),
  configuracionController.obtenerConfiguracionSistema
);

// PUT /api/configuracion - Actualizar configuracion general del sistema
router.put('/',
  verifyToken,
  requirePermission('DASHBOARD_VER'),
  configuracionController.actualizarConfiguracionSistema
);

// GET /api/configuracion/precios-encomienda - Obtener config precios
// Permitido para: dashboard (admins) y registrar encomiendas (vendedores)
router.get('/precios-encomienda',
  verifyToken,
  requirePermission(['DASHBOARD_VER', 'ENCOMIENDAS_REGISTRAR']),
  configuracionController.obtenerPreciosEncomienda
);

// PUT /api/configuracion/precios-encomienda - Actualizar config precios
router.put('/precios-encomienda',
  verifyToken,
  requirePermission('DASHBOARD_VER'),
  configuracionController.actualizarPreciosEncomienda
);

module.exports = router;
