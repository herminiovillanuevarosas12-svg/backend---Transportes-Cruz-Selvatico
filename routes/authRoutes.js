/**
 * Auth Routes
 * Rutas de autenticacion
 */

const express = require('express');
const router = express.Router();
const { login, logout, me } = require('../controllers/authController');
const { verifyToken } = require('../middleware/authMiddleware');

// POST /api/auth/login - Iniciar sesion (publico)
router.post('/login', login);

// POST /api/auth/logout - Cerrar sesion (autenticado)
router.post('/logout', verifyToken, logout);

// GET /api/auth/me - Obtener usuario actual (autenticado)
router.get('/me', verifyToken, me);

module.exports = router;
