/**
 * Usuarios Routes
 * Rutas para gestion de usuarios
 */

const express = require('express');
const router = express.Router();
const usuariosController = require('../controllers/usuariosController');
const { verifyToken, requirePermission } = require('../middleware/authMiddleware');

// GET /api/usuarios - Listar usuarios
router.get('/',
  verifyToken,
  requirePermission('USUARIOS_LISTAR'),
  usuariosController.listar
);

// GET /api/usuarios/:id - Obtener usuario
router.get('/:id',
  verifyToken,
  requirePermission('USUARIOS_LISTAR'),
  usuariosController.obtener
);

// POST /api/usuarios - Crear usuario
router.post('/',
  verifyToken,
  requirePermission('USUARIOS_CREAR'),
  usuariosController.crear
);

// PUT /api/usuarios/:id - Actualizar usuario
router.put('/:id',
  verifyToken,
  requirePermission('USUARIOS_EDITAR'),
  usuariosController.actualizar
);

// PATCH /api/usuarios/:id/toggle - Activar/desactivar
router.patch('/:id/toggle',
  verifyToken,
  requirePermission('USUARIOS_EDITAR'),
  usuariosController.toggle
);

module.exports = router;
