/**
 * Consulta Documento Routes
 * Rutas para consultas de DNI y RUC via apiperu.dev
 * Solo requieren autenticacion (verifyToken), sin permisos especificos
 */

const express = require('express');
const router = express.Router();
const consultaDocController = require('../controllers/consultaDocController');
const { verifyToken } = require('../middleware/authMiddleware');

// GET /api/consulta-doc/dni/:dni - Consultar datos de persona por DNI
router.get('/dni/:dni',
  verifyToken,
  consultaDocController.consultarDni
);

// GET /api/consulta-doc/ruc/:ruc - Consultar datos de empresa por RUC
router.get('/ruc/:ruc',
  verifyToken,
  consultaDocController.consultarRuc
);

module.exports = router;
