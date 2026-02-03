/**
 * Tickets Routes
 * Rutas para venta y gestion de tickets/pasajes
 */

const express = require('express');
const router = express.Router();
const ticketsController = require('../controllers/ticketsController');
const { verifyToken, requirePermission, requireOwnPoint } = require('../middleware/authMiddleware');

// GET /api/tickets - Listar tickets
router.get('/',
  verifyToken,
  requirePermission(['PASAJES_LISTAR', 'PASAJES_VENDER']),
  ticketsController.listar
);

// GET /api/tickets/codigo/:codigo - Obtener por codigo interno (antes de /:id para evitar conflictos)
router.get('/codigo/:codigo',
  verifyToken,
  requirePermission(['PASAJES_LISTAR', 'PASAJES_VENDER']),
  ticketsController.obtenerPorCodigo
);

// GET /api/tickets/:id - Obtener ticket por ID
router.get('/:id',
  verifyToken,
  requirePermission(['PASAJES_LISTAR', 'PASAJES_VENDER']),
  ticketsController.obtener
);

// GET /api/tickets/:id/imprimir - Vista imprimible
router.get('/:id/imprimir',
  verifyToken,
  requirePermission(['PASAJES_REIMPRIMIR', 'PASAJES_VENDER']),
  ticketsController.imprimir
);

// POST /api/tickets - Vender pasaje
router.post('/',
  verifyToken,
  requirePermission('PASAJES_VENDER'),
  requireOwnPoint,
  ticketsController.vender
);

// POST /api/tickets/instantanea - Venta instantanea (sin horario predefinido)
router.post('/instantanea',
  verifyToken,
  requirePermission('PASAJES_VENDER'),
  requireOwnPoint,
  ticketsController.venderInstantaneo
);

// POST /api/tickets/:id/anular - Anular ticket
router.post('/:id/anular',
  verifyToken,
  requirePermission('PASAJES_ANULAR'),
  ticketsController.anular
);

module.exports = router;
