/**
 * Horarios Routes
 * Rutas para gestion de horarios (operaciones directas)
 */

const express = require('express');
const router = express.Router();
const horariosController = require('../controllers/horariosController');
const { verifyToken, requirePermission } = require('../middleware/authMiddleware');

// PUT /api/horarios/:id - Actualizar horario
router.put('/:id',
  verifyToken,
  requirePermission('HORARIOS_EDITAR'),
  horariosController.actualizar
);

// PATCH /api/horarios/:id/toggle - Habilitar/deshabilitar horario
router.patch('/:id/toggle',
  verifyToken,
  requirePermission('HORARIOS_HABILITAR'),
  horariosController.toggle
);

// DELETE /api/horarios/:id - Eliminar horario
router.delete('/:id',
  verifyToken,
  requirePermission('HORARIOS_EDITAR'),
  horariosController.eliminar
);

module.exports = router;
