/**
 * Contenido Routes
 * Rutas admin para gestion de contenido publico (servicios, destinos, FAQ, promociones, contacto)
 */

const express = require('express');
const router = express.Router();
const destinosPublicosController = require('../controllers/destinosPublicosController');
const preguntasFrecuentesController = require('../controllers/preguntasFrecuentesController');
const promocionesController = require('../controllers/promocionesController');
const contactoController = require('../controllers/contactoController');
const encomiendasInfoController = require('../controllers/encomiendasInfoController');
const infoViajeController = require('../controllers/infoViajeController');
const seccionesCardsController = require('../controllers/seccionesCardsController');
const { verifyToken, requirePermission, requireRole } = require('../middleware/authMiddleware');
const { ROLES } = require('../config/roles');
const { uploadBanner, handleMulterError } = require('../middleware/bannerUpload');

// Todas las rutas requieren autenticacion
router.use(verifyToken);

// === DESTINOS PUBLICOS ===
router.get('/destinos',
  requirePermission('LANDING_VER'),
  destinosPublicosController.listar);

router.post('/destinos',
  requirePermission('LANDING_EDITAR'),
  uploadBanner.fields([{ name: 'imagen', maxCount: 1 }, { name: 'imagenAtractivos', maxCount: 1 }]),
  destinosPublicosController.crear);

router.put('/destinos/:id',
  requirePermission('LANDING_EDITAR'),
  uploadBanner.fields([{ name: 'imagen', maxCount: 1 }, { name: 'imagenAtractivos', maxCount: 1 }]),
  destinosPublicosController.actualizar);

router.delete('/destinos/:id',
  requirePermission('LANDING_EDITAR'),
  destinosPublicosController.eliminar);

router.patch('/destinos/:id/toggle',
  requirePermission('LANDING_EDITAR'),
  destinosPublicosController.toggleActivo);

// Festividades de destino
router.get('/destinos/:idDestino/festividades',
  requirePermission('LANDING_VER'),
  destinosPublicosController.listarFestividadesDestino);

router.post('/destinos/:idDestino/festividades',
  requirePermission('LANDING_EDITAR'),
  destinosPublicosController.crearFestividadDestino);

router.put('/destinos/festividades/:id',
  requirePermission('LANDING_EDITAR'),
  destinosPublicosController.actualizarFestividadDestino);

router.delete('/destinos/festividades/:id',
  requirePermission('LANDING_EDITAR'),
  destinosPublicosController.eliminarFestividadDestino);

// === PREGUNTAS FRECUENTES ===
router.get('/preguntas-frecuentes',
  requirePermission('LANDING_VER'),
  preguntasFrecuentesController.listar);

router.post('/preguntas-frecuentes',
  requirePermission('LANDING_EDITAR'),
  preguntasFrecuentesController.crear);

router.put('/preguntas-frecuentes/reordenar',
  requirePermission('LANDING_EDITAR'),
  preguntasFrecuentesController.reordenar);

router.put('/preguntas-frecuentes/:id',
  requirePermission('LANDING_EDITAR'),
  preguntasFrecuentesController.actualizar);

router.delete('/preguntas-frecuentes/:id',
  requirePermission('LANDING_EDITAR'),
  preguntasFrecuentesController.eliminar);

router.patch('/preguntas-frecuentes/:id/toggle',
  requirePermission('LANDING_EDITAR'),
  preguntasFrecuentesController.toggleActivo);

// === PROMOCIONES ===
router.get('/promociones',
  requirePermission('BANNERS_VER'),
  promocionesController.listar);

router.post('/promociones',
  requirePermission('BANNERS_CREAR'),
  uploadBanner.single('imagen'),
  promocionesController.crear);

router.put('/promociones/:id',
  requirePermission('BANNERS_EDITAR'),
  uploadBanner.single('imagen'),
  promocionesController.actualizar);

router.delete('/promociones/:id',
  requirePermission('BANNERS_ELIMINAR'),
  promocionesController.eliminar);

router.patch('/promociones/:id/toggle',
  requirePermission('BANNERS_EDITAR'),
  promocionesController.toggleActivo);

// === CONTACTO MENSAJES ===
router.get('/contacto-mensajes',
  requirePermission('LANDING_VER'),
  contactoController.listarMensajes);

router.get('/contacto-mensajes/:id',
  requirePermission('LANDING_VER'),
  contactoController.getMensaje);

router.put('/contacto-mensajes/:id',
  requirePermission('LANDING_EDITAR'),
  contactoController.actualizarMensaje);

// === ENCOMIENDAS: SECCIONES DE CARDS (solo SUPER_ADMIN, edicion inline en /encomiendas-info) ===
const soloSuperAdmin = [requirePermission('LANDING_EDITAR'), requireRole(ROLES.SUPER_ADMIN)];

router.get('/encomiendas-secciones-cards',
  soloSuperAdmin,
  seccionesCardsController.listarAdmin);

router.post('/encomiendas-secciones-cards',
  soloSuperAdmin,
  seccionesCardsController.crearSeccion);

// /orden antes de /:id
router.put('/encomiendas-secciones-cards/orden',
  soloSuperAdmin,
  seccionesCardsController.reordenarSecciones);

router.put('/encomiendas-secciones-cards/:id',
  soloSuperAdmin,
  seccionesCardsController.renombrarSeccion);

router.patch('/encomiendas-secciones-cards/:id/toggle',
  soloSuperAdmin,
  seccionesCardsController.toggleSeccion);

router.delete('/encomiendas-secciones-cards/:id',
  soloSuperAdmin,
  seccionesCardsController.eliminarSeccion);

// Cards de cada seccion
router.post('/encomiendas-ventajas',
  soloSuperAdmin,
  uploadBanner.single('imagen'),
  seccionesCardsController.crearCard);

// /orden antes de /:id
router.put('/encomiendas-ventajas/orden',
  soloSuperAdmin,
  seccionesCardsController.reordenarCards);

router.put('/encomiendas-ventajas/:id',
  soloSuperAdmin,
  uploadBanner.single('imagen'),
  seccionesCardsController.actualizarCard);

router.patch('/encomiendas-ventajas/:id/toggle',
  soloSuperAdmin,
  seccionesCardsController.toggleCard);

router.delete('/encomiendas-ventajas/:id',
  soloSuperAdmin,
  seccionesCardsController.eliminarCard);

// === ENCOMIENDAS SECCIONES (Servicios/Flota) ===
router.get('/encomiendas-secciones',
  requirePermission('LANDING_VER'),
  encomiendasInfoController.listarSecciones);

router.post('/encomiendas-secciones',
  requirePermission('LANDING_EDITAR'),
  uploadBanner.single('imagen'),
  encomiendasInfoController.crearSeccion);

router.put('/encomiendas-secciones/:id',
  requirePermission('LANDING_EDITAR'),
  uploadBanner.single('imagen'),
  encomiendasInfoController.actualizarSeccion);

router.delete('/encomiendas-secciones/:id',
  requirePermission('LANDING_EDITAR'),
  encomiendasInfoController.eliminarSeccion);

router.patch('/encomiendas-secciones/:id/toggle',
  requirePermission('LANDING_EDITAR'),
  encomiendasInfoController.toggleSeccion);

// === NOSOTROS ===
const nosotrosController = require('../controllers/nosotrosController');

router.put('/nosotros/config',
  requirePermission('LANDING_EDITAR'),
  nosotrosController.actualizarConfigNosotros);

router.put('/nosotros/hero',
  requirePermission('LANDING_EDITAR'),
  uploadBanner.single('imagen'),
  nosotrosController.subirHeroNosotros);

router.delete('/nosotros/hero',
  requirePermission('LANDING_EDITAR'),
  nosotrosController.eliminarHeroNosotros);

router.get('/nosotros/valores',
  requirePermission('LANDING_VER'),
  nosotrosController.listarValores);

router.post('/nosotros/valores',
  requirePermission('LANDING_EDITAR'),
  uploadBanner.single('imagen'),
  nosotrosController.crearValor);

router.put('/nosotros/valores/:id',
  requirePermission('LANDING_EDITAR'),
  uploadBanner.single('imagen'),
  nosotrosController.actualizarValor);

router.delete('/nosotros/valores/:id',
  requirePermission('LANDING_EDITAR'),
  nosotrosController.eliminarValor);

router.patch('/nosotros/valores/:id/toggle',
  requirePermission('LANDING_EDITAR'),
  nosotrosController.toggleValor);

// === INFO VIAJE ITEMS ===
router.get('/info-viaje-items',
  requirePermission('LANDING_VER'),
  infoViajeController.listar);

router.post('/info-viaje-items',
  requirePermission('LANDING_EDITAR'),
  uploadBanner.single('imagen'),
  infoViajeController.crear);

router.put('/info-viaje-items/:id',
  requirePermission('LANDING_EDITAR'),
  uploadBanner.single('imagen'),
  infoViajeController.actualizar);

router.delete('/info-viaje-items/:id',
  requirePermission('LANDING_EDITAR'),
  infoViajeController.eliminar);

router.patch('/info-viaje-items/:id/toggle',
  requirePermission('LANDING_EDITAR'),
  infoViajeController.toggleActivo);

// Manejo global de errores de multer
router.use(handleMulterError);

module.exports = router;
