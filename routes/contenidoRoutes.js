/**
 * Contenido Routes
 * Rutas admin para gestion de contenido publico (servicios, destinos, FAQ, promociones, contacto, paginas)
 */

const express = require('express');
const router = express.Router();
const destinosPublicosController = require('../controllers/destinosPublicosController');
const preguntasFrecuentesController = require('../controllers/preguntasFrecuentesController');
const promocionesController = require('../controllers/promocionesController');
const contactoController = require('../controllers/contactoController');
const paginasContenidoController = require('../controllers/paginasContenidoController');
const encomiendasInfoController = require('../controllers/encomiendasInfoController');
const { verifyToken, requirePermission } = require('../middleware/authMiddleware');
const { uploadBanner } = require('../middleware/bannerUpload');

// Todas las rutas requieren autenticacion
router.use(verifyToken);

// === DESTINOS PUBLICOS ===
router.get('/destinos',
  requirePermission('LANDING_VER'),
  destinosPublicosController.listar);

router.post('/destinos',
  requirePermission('LANDING_EDITAR'),
  uploadBanner.single('imagen'),
  destinosPublicosController.crear);

router.put('/destinos/:id',
  requirePermission('LANDING_EDITAR'),
  uploadBanner.single('imagen'),
  destinosPublicosController.actualizar);

router.delete('/destinos/:id',
  requirePermission('LANDING_EDITAR'),
  destinosPublicosController.eliminar);

router.patch('/destinos/:id/toggle',
  requirePermission('LANDING_EDITAR'),
  destinosPublicosController.toggleActivo);

// Festividades de destino
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

// === ENCOMIENDAS VENTAJAS ===
router.get('/encomiendas-ventajas',
  requirePermission('LANDING_VER'),
  encomiendasInfoController.listar);

router.post('/encomiendas-ventajas',
  requirePermission('LANDING_EDITAR'),
  uploadBanner.single('imagen'),
  encomiendasInfoController.crear);

router.put('/encomiendas-ventajas/:id',
  requirePermission('LANDING_EDITAR'),
  uploadBanner.single('imagen'),
  encomiendasInfoController.actualizar);

router.delete('/encomiendas-ventajas/:id',
  requirePermission('LANDING_EDITAR'),
  encomiendasInfoController.eliminar);

router.patch('/encomiendas-ventajas/:id/toggle',
  requirePermission('LANDING_EDITAR'),
  encomiendasInfoController.toggleActivo);

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

// === PAGINAS DE CONTENIDO ===
router.get('/paginas',
  requirePermission('LANDING_VER'),
  paginasContenidoController.listar);

router.post('/paginas',
  requirePermission('LANDING_EDITAR'),
  uploadBanner.single('imagen'),
  paginasContenidoController.crear);

router.put('/paginas/:id',
  requirePermission('LANDING_EDITAR'),
  uploadBanner.single('imagen'),
  paginasContenidoController.actualizar);

router.delete('/paginas/:id',
  requirePermission('LANDING_EDITAR'),
  paginasContenidoController.eliminar);

module.exports = router;
