/**
 * Clientes Routes
 * Rutas para gestion de clientes (pasajeros) con programa de fidelizacion
 */

const express = require('express');
const router = express.Router();
const clientesController = require('../controllers/clientesController');
const { verifyToken, requirePermission } = require('../middleware/authMiddleware');

// GET /api/clientes/stats - Estadisticas globales (antes de /:id para evitar conflictos)
router.get('/stats',
  verifyToken,
  requirePermission('CLIENTES_LISTAR'),
  clientesController.stats
);

// GET /api/clientes/dni/:dni - Obtener cliente por DNI (antes de /:id para evitar conflictos)
router.get('/dni/:dni',
  verifyToken,
  requirePermission('CLIENTES_LISTAR'),
  clientesController.obtenerPorDni
);

// GET /api/clientes - Listar clientes con filtros
router.get('/',
  verifyToken,
  requirePermission('CLIENTES_LISTAR'),
  clientesController.listar
);

// GET /api/clientes/:id - Obtener detalle de cliente
router.get('/:id',
  verifyToken,
  requirePermission('CLIENTES_LISTAR'),
  clientesController.obtener
);

module.exports = router;
