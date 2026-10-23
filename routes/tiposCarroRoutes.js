/**
 * Tipos de Carro Routes
 * Rutas para gestión de tipos de vehículo
 */

const express = require('express');
const router = express.Router();
const tiposCarroController = require('../controllers/tiposCarroController');
const { verifyToken, requirePermission } = require('../middleware/authMiddleware');

// GET /api/tipos-carro - Listar todos los tipos de carro (también para elegir el tipo de un bus)
router.get('/',
  verifyToken,
  requirePermission(['RUTAS_LISTAR', 'RUTAS_CREAR', 'BUSES_CREAR', 'BUSES_EDITAR']),
  tiposCarroController.listar
);

// POST /api/tipos-carro - Crear tipo de carro
router.post('/',
  verifyToken,
  requirePermission('RUTAS_CREAR'),
  tiposCarroController.crear
);

// PUT /api/tipos-carro/:id - Actualizar tipo de carro
router.put('/:id',
  verifyToken,
  requirePermission('RUTAS_EDITAR'),
  tiposCarroController.actualizar
);

// DELETE /api/tipos-carro/:id - Eliminar tipo de carro
router.delete('/:id',
  verifyToken,
  requirePermission('RUTAS_ELIMINAR'),
  tiposCarroController.eliminar
);

module.exports = router;
