/**
 * Landing Routes
 * Rutas para gestión de banners y configuración de landing page (admin)
 */

const express = require('express');
const router = express.Router();
const landingController = require('../controllers/landingController');
const festividadesController = require('../controllers/festividadesController');
const festividadesImagenesController = require('../controllers/festividadesImagenesController');
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

/**
 * SERVICIOS LANDING
 */

// GET /api/landing/servicios - Listar servicios (admin)
router.get(
  '/servicios',
  requirePermission('LANDING_VER'),
  landingController.getServiciosAdmin
);

// PUT /api/landing/servicios/:id - Actualizar servicio
router.put(
  '/servicios/:id',
  requirePermission('LANDING_EDITAR'),
  landingController.actualizarServicio
);

/**
 * FESTIVIDADES - IMÁGENES (rutas específicas primero para evitar conflicto con :id)
 */

// DELETE /api/landing/festividades/imagenes/:imgId - Eliminar imagen
router.delete(
  '/festividades/imagenes/:imgId',
  requirePermission('LANDING_EDITAR'),
  festividadesImagenesController.eliminar
);

/**
 * FESTIVIDADES
 */

// GET /api/landing/festividades - Listar festividades (admin)
router.get(
  '/festividades',
  requirePermission('LANDING_VER'),
  festividadesController.listar
);

// POST /api/landing/festividades - Crear festividad
router.post(
  '/festividades',
  requirePermission('LANDING_EDITAR'),
  festividadesController.crear
);

// PUT /api/landing/festividades/:id - Actualizar festividad
router.put(
  '/festividades/:id',
  requirePermission('LANDING_EDITAR'),
  festividadesController.actualizar
);

// DELETE /api/landing/festividades/:id - Eliminar festividad
router.delete(
  '/festividades/:id',
  requirePermission('LANDING_EDITAR'),
  festividadesController.eliminar
);

// PATCH /api/landing/festividades/:id/toggle - Toggle activo
router.patch(
  '/festividades/:id/toggle',
  requirePermission('LANDING_EDITAR'),
  festividadesController.toggleActivo
);

// GET /api/landing/festividades/:id/imagenes - Listar imágenes
router.get(
  '/festividades/:id/imagenes',
  requirePermission('LANDING_VER'),
  festividadesImagenesController.listar
);

// POST /api/landing/festividades/:id/imagenes - Agregar imagen
router.post(
  '/festividades/:id/imagenes',
  requirePermission('LANDING_EDITAR'),
  uploadBanner.single('imagen'),
  festividadesImagenesController.agregar
);

// PUT /api/landing/festividades/:id/imagenes/orden - Reordenar imágenes
router.put(
  '/festividades/:id/imagenes/orden',
  requirePermission('LANDING_EDITAR'),
  festividadesImagenesController.reordenar
);

module.exports = router;
