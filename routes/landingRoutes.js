/**
 * Landing Routes
 * Rutas para gestión de banners y configuración de landing page (admin)
 */

const express = require('express');
const router = express.Router();
const landingController = require('../controllers/landingController');
const { verifyToken, requirePermission } = require('../middleware/authMiddleware');
const { uploadBanner } = require('../middleware/bannerUpload');

// Todas las rutas requieren autenticación
router.use(verifyToken);

/**
 * BANNERS
 */

// GET /api/landing/banners - Listar todos los banners
router.get(
  '/banners',
  requirePermission('BANNERS_VER'),
  landingController.listarBanners
);

// POST /api/landing/banners - Crear banner
router.post(
  '/banners',
  requirePermission('BANNERS_CREAR'),
  uploadBanner.single('imagen'),
  landingController.crearBanner
);

// PUT /api/landing/banners/reorder - Reordenar banners
router.put(
  '/banners/reorder',
  requirePermission('BANNERS_EDITAR'),
  landingController.reordenarBanners
);

// PUT /api/landing/banners/:id - Actualizar banner
router.put(
  '/banners/:id',
  requirePermission('BANNERS_EDITAR'),
  uploadBanner.single('imagen'),
  landingController.actualizarBanner
);

// DELETE /api/landing/banners/:id - Eliminar banner
router.delete(
  '/banners/:id',
  requirePermission('BANNERS_ELIMINAR'),
  landingController.eliminarBanner
);

/**
 * CONFIGURACIÓN LANDING
 */

// GET /api/landing/config - Obtener configuración de landing (admin)
router.get(
  '/config',
  requirePermission('LANDING_VER'),
  landingController.getConfigLandingAdmin
);

// PUT /api/landing/config - Actualizar configuración de landing
router.put(
  '/config',
  requirePermission('LANDING_EDITAR'),
  landingController.actualizarConfigLanding
);

// PUT /api/landing/config/imagen-experiencia - Subir/actualizar imagen de experiencia
router.put(
  '/config/imagen-experiencia',
  requirePermission('LANDING_EDITAR'),
  uploadBanner.single('imagen'),
  landingController.subirImagenExperiencia
);

// DELETE /api/landing/config/imagen-experiencia - Eliminar imagen de experiencia
router.delete(
  '/config/imagen-experiencia',
  requirePermission('LANDING_EDITAR'),
  landingController.eliminarImagenExperiencia
);

module.exports = router;
