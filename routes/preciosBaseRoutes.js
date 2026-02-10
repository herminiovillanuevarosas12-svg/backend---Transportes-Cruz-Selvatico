/**
 * Precios Base Routes
 * Rutas CRUD para precios base de encomiendas
 */

const express = require('express');
const router = express.Router();
const preciosBaseController = require('../controllers/preciosBaseController');
const { verifyToken, requirePermission } = require('../middleware/authMiddleware');

// GET /api/precios-base-encomienda - Listar precios base activos
// Permitido para: admins (dashboard) y registrar encomiendas (vendedores)
router.get('/',
  verifyToken,
  requirePermission(['DASHBOARD_VER', 'ENCOMIENDAS_REGISTRAR']),
  preciosBaseController.listar
);

// POST /api/precios-base-encomienda - Crear precio base
router.post('/',
  verifyToken,
  requirePermission('DASHBOARD_VER'),
  preciosBaseController.crear
);

// PUT /api/precios-base-encomienda/:id - Actualizar precio base
router.put('/:id',
  verifyToken,
  requirePermission('DASHBOARD_VER'),
  preciosBaseController.actualizar
);

// DELETE /api/precios-base-encomienda/:id - Eliminar precio base
router.delete('/:id',
  verifyToken,
  requirePermission('DASHBOARD_VER'),
  preciosBaseController.eliminar
);

module.exports = router;
