/**
 * Encomiendas Routes
 * Rutas para gestion de encomiendas
 */

const express = require('express');
const router = express.Router();
const encomiendasController = require('../controllers/encomiendasController');
const { verifyToken, requirePermission, requireOwnPoint } = require('../middleware/authMiddleware');

// GET /api/encomiendas - Listar encomiendas
router.get('/',
  verifyToken,
  requirePermission(['ENCOMIENDAS_LISTAR', 'ENCOMIENDAS_REGISTRAR']),
  encomiendasController.listar
);

// GET /api/encomiendas/tracking/:codigo - Obtener por tracking (incluye semi-publico)
router.get('/tracking/:codigo',
  encomiendasController.obtenerPorTracking
);

// GET /api/encomiendas/codigo/:codigo - Buscar por codigo (interno, autenticado)
router.get('/codigo/:codigo',
  verifyToken,
  requirePermission(['ENCOMIENDAS_ESCANEAR', 'ENCOMIENDAS_LISTAR']),
  encomiendasController.buscarPorCodigo
);

// GET /api/encomiendas/:id - Obtener encomienda por ID
router.get('/:id',
  verifyToken,
  requirePermission(['ENCOMIENDAS_LISTAR', 'ENCOMIENDAS_ESCANEAR']),
  encomiendasController.obtener
);

// GET /api/encomiendas/:id/imprimir - Vista imprimible
router.get('/:id/imprimir',
  verifyToken,
  requirePermission(['ENCOMIENDAS_REGISTRAR', 'ENCOMIENDAS_LISTAR']),
  encomiendasController.imprimir
);

// GET /api/encomiendas/:id/qr - Generar QR
router.get('/:id/qr',
  verifyToken,
  requirePermission(['ENCOMIENDAS_REGISTRAR', 'ENCOMIENDAS_LISTAR']),
  encomiendasController.generarQR
);

// POST /api/encomiendas - Registrar encomienda
router.post('/',
  verifyToken,
  requirePermission('ENCOMIENDAS_REGISTRAR'),
  requireOwnPoint,
  encomiendasController.registrar
);

// PATCH /api/encomiendas/:id/estado - Cambiar estado
router.patch('/:id/estado',
  verifyToken,
  requirePermission('ENCOMIENDAS_CAMBIAR_ESTADO'),
  requireOwnPoint,
  encomiendasController.cambiarEstado
);

// POST /api/encomiendas/:id/retirar - Registrar retiro con foto
router.post('/:id/retirar',
  verifyToken,
  requirePermission('ENCOMIENDAS_RETIRAR'),
  requireOwnPoint,
  encomiendasController.retirar
);


module.exports = router;
