/**
 * Config Tipos Paquete Routes
 * Rutas para gestión de configuraciones de tipos de paquete
 */

const express = require('express');
const router = express.Router();
const configTiposPaqueteController = require('../controllers/configTiposPaqueteController');
const { verifyToken, requirePermission } = require('../middleware/authMiddleware');

// GET /api/config-tipos-paquete/activos - Listar activos (para dropdown en registro)
router.get('/activos',
  verifyToken,
  requirePermission('ENCOMIENDAS_REGISTRAR'),
  configTiposPaqueteController.listarActivos
);

// GET /api/config-tipos-paquete - Listar todos (admin)
router.get('/',
  verifyToken,
  requirePermission('DASHBOARD_VER'),
  configTiposPaqueteController.listar
);

// GET /api/config-tipos-paquete/:id - Obtener por ID
router.get('/:id',
  verifyToken,
  requirePermission('DASHBOARD_VER'),
  configTiposPaqueteController.obtener
);

// POST /api/config-tipos-paquete - Crear
router.post('/',
  verifyToken,
  requirePermission('DASHBOARD_VER'),
  configTiposPaqueteController.crear
);

// PUT /api/config-tipos-paquete/:id - Actualizar
router.put('/:id',
  verifyToken,
  requirePermission('DASHBOARD_VER'),
  configTiposPaqueteController.actualizar
);

// DELETE /api/config-tipos-paquete/:id - Eliminar (soft delete)
router.delete('/:id',
  verifyToken,
  requirePermission('DASHBOARD_VER'),
  configTiposPaqueteController.eliminar
);

module.exports = router;
