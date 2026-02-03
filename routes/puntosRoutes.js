/**
 * Puntos Routes
 * Rutas para gestion de puntos (agencias/terminales)
 */

const express = require('express');
const router = express.Router();
const puntosController = require('../controllers/puntosController');
const { verifyToken, requirePermission } = require('../middleware/authMiddleware');

// GET /api/puntos - Listar todos los puntos
// Permitido para: gestionar puntos, registrar encomiendas, vender pasajes
router.get('/',
  verifyToken,
  requirePermission(['PUNTOS_LISTAR', 'ENCOMIENDAS_REGISTRAR', 'PASAJES_VENDER']),
  puntosController.listar
);

// GET /api/puntos/:id - Obtener punto por ID
router.get('/:id',
  verifyToken,
  requirePermission('PUNTOS_LISTAR'),
  puntosController.obtener
);

// POST /api/puntos - Crear punto
router.post('/',
  verifyToken,
  requirePermission('PUNTOS_CREAR'),
  puntosController.crear
);

// PUT /api/puntos/:id - Actualizar punto
router.put('/:id',
  verifyToken,
  requirePermission('PUNTOS_EDITAR'),
  puntosController.actualizar
);

// DELETE /api/puntos/:id - Eliminar/desactivar punto
router.delete('/:id',
  verifyToken,
  requirePermission('PUNTOS_ELIMINAR'),
  puntosController.eliminar
);

module.exports = router;
