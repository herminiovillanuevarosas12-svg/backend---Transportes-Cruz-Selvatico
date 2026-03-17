/**
 * Blog Routes
 * Rutas admin para gestion del blog (categorias y articulos)
 */

const express = require('express');
const router = express.Router();
const blogController = require('../controllers/blogController');
const { verifyToken, requirePermission } = require('../middleware/authMiddleware');
const { uploadBanner, handleMulterError } = require('../middleware/bannerUpload');

// ============================================
// CATEGORIAS
// ============================================

// GET /api/blog/categorias - Listar categorias
router.get('/categorias',
  verifyToken,
  requirePermission('BLOG_VER'),
  blogController.listarCategorias
);

// POST /api/blog/categorias - Crear categoria
router.post('/categorias',
  verifyToken,
  requirePermission('BLOG_CREAR'),
  blogController.crearCategoria
);

// PUT /api/blog/categorias/:id - Actualizar categoria
router.put('/categorias/:id',
  verifyToken,
  requirePermission('BLOG_EDITAR'),
  blogController.actualizarCategoria
);

// DELETE /api/blog/categorias/:id - Eliminar categoria
router.delete('/categorias/:id',
  verifyToken,
  requirePermission('BLOG_ELIMINAR'),
  blogController.eliminarCategoria
);

// ============================================
// ARTICULOS
// ============================================

// GET /api/blog/articulos - Listar articulos (admin)
router.get('/articulos',
  verifyToken,
  requirePermission('BLOG_VER'),
  blogController.listarArticulos
);

// GET /api/blog/articulos/:id - Obtener articulo por ID (admin)
router.get('/articulos/:id',
  verifyToken,
  requirePermission('BLOG_VER'),
  blogController.obtenerArticulo
);

// POST /api/blog/articulos - Crear articulo
router.post('/articulos',
  verifyToken,
  requirePermission('BLOG_CREAR'),
  uploadBanner.single('imagen'),
  handleMulterError,
  blogController.crearArticulo
);

// PUT /api/blog/articulos/:id - Actualizar articulo
router.put('/articulos/:id',
  verifyToken,
  requirePermission('BLOG_EDITAR'),
  uploadBanner.single('imagen'),
  handleMulterError,
  blogController.actualizarArticulo
);

// DELETE /api/blog/articulos/:id - Eliminar articulo
router.delete('/articulos/:id',
  verifyToken,
  requirePermission('BLOG_ELIMINAR'),
  blogController.eliminarArticulo
);

// PATCH /api/blog/articulos/:id/toggle-estado - Toggle publicado/borrador
router.patch('/articulos/:id/toggle-estado',
  verifyToken,
  requirePermission('BLOG_EDITAR'),
  blogController.toggleEstado
);

// PATCH /api/blog/articulos/:id/toggle-destacado - Toggle destacado
router.patch('/articulos/:id/toggle-destacado',
  verifyToken,
  requirePermission('BLOG_EDITAR'),
  blogController.toggleDestacado
);

// PATCH /api/blog/articulos/:id/toggle-recomendado - Toggle recomendado
router.patch('/articulos/:id/toggle-recomendado',
  verifyToken,
  requirePermission('BLOG_EDITAR'),
  blogController.toggleRecomendado
);

module.exports = router;
