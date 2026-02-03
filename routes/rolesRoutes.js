/**
 * Roles Routes
 * Rutas para gestion de roles
 */

const express = require('express');
const router = express.Router();
const rolesController = require('../controllers/rolesController');
const { verifyToken } = require('../middleware/authMiddleware');

// GET /api/roles - Listar roles
router.get('/', verifyToken, rolesController.listar);

module.exports = router;
