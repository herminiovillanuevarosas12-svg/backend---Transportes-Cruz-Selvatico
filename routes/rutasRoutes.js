/**
 * Rutas Routes
 * Rutas para gestion de rutas de transporte
 */

const express = require('express');
const router = express.Router();
const rutasController = require('../controllers/rutasController');
const horariosController = require('../controllers/horariosController');
const { verifyToken, requirePermission } = require('../middleware/authMiddleware');

// GET /api/rutas - Listar todas las rutas
router.get('/',
  verifyToken,
  requirePermission(['RUTAS_LISTAR', 'HORARIOS_LISTAR']),
  rutasController.listar
);

// GET /api/rutas/:id - Obtener ruta por ID
router.get('/:id',
  verifyToken,
  requirePermission(['RUTAS_LISTAR', 'HORARIOS_LISTAR']),
  rutasController.obtener
);

// POST /api/rutas - Crear ruta
router.post('/',
  verifyToken,
  requirePermission('RUTAS_CREAR'),
  rutasController.crear
);

// PUT /api/rutas/:id - Actualizar ruta (precio, capacidad)
router.put('/:id',
  verifyToken,
  requirePermission('RUTAS_EDITAR'),
  rutasController.actualizar
);

// DELETE /api/rutas/:id - Eliminar/desactivar ruta
router.delete('/:id',
  verifyToken,
  requirePermission('RUTAS_ELIMINAR'),
  rutasController.eliminar
);

// =============================================================================
// HORARIOS (anidados bajo rutas)
// =============================================================================

// GET /api/rutas/:id_ruta/horarios - Listar horarios de ruta
router.get('/:id_ruta/horarios',
  verifyToken,
  requirePermission(['HORARIOS_LISTAR', 'PASAJES_VENDER']),
  horariosController.listarPorRuta
);

// POST /api/rutas/:id_ruta/horarios - Crear horario
router.post('/:id_ruta/horarios',
  verifyToken,
  requirePermission('HORARIOS_CREAR'),
  horariosController.crear
);

module.exports = router;
