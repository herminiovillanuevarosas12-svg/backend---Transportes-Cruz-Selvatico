/**
 * Blog Controller
 * CRUD para categorias y articulos del blog
 */

const prisma = require('../config/prisma');
const { registrarAuditoria } = require('../services/auditoriaService');
const { procesarBannerFile, eliminarArchivoBanner } = require('../middleware/bannerUpload');

// ============================================
// HELPERS
// ============================================

/**
 * Genera un slug a partir de un texto
 */
const generarSlug = (texto) => {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
};

// ============================================
// CATEGORIAS - CRUD
// ============================================

/**
 * Listar categorias activas
 * GET /api/blog/categorias
 */
const listarCategorias = async (req, res) => {
  try {
    const categorias = await prisma.$queryRaw`
      SELECT id, nombre, slug, color_badge as "colorBadge", color_footer as "colorFooter",
             orden, activo, date_time_registration as "fechaCreacion"
      FROM tbl_blog_categorias
      WHERE activo = true
      ORDER BY orden ASC, nombre ASC
    `;
    res.json({ categorias });
  } catch (error) {
    console.error('Error listando categorias del blog:', error);
    res.status(500).json({ error: 'Error al listar categorias' });
  }
};

/**
 * Crear categoria
 * POST /api/blog/categorias
 */
const crearCategoria = async (req, res) => {
  try {
    const { nombre, colorBadge, colorFooter, orden } = req.body;

    if (!nombre || nombre.trim() === '') {
      return res.status(400).json({ error: 'El nombre es requerido' });
    }

    const slug = generarSlug(nombre);

    const existe = await prisma.$queryRaw`
      SELECT id FROM tbl_blog_categorias WHERE slug = ${slug}
    `;
    if (existe.length > 0) {
      return res.status(400).json({ error: 'Ya existe una categoria con ese nombre' });
    }

    const result = await prisma.$queryRaw`
      INSERT INTO tbl_blog_categorias (nombre, slug, color_badge, color_footer, orden, activo, user_id_registration, date_time_registration)
      VALUES (${nombre.trim()}, ${slug}, ${colorBadge || '#2563EB'}, ${colorFooter || '#2563EB'}, ${parseInt(orden) || 0}, true, ${req.user.id}, NOW())
      RETURNING id, nombre, slug, color_badge as "colorBadge", color_footer as "colorFooter", orden, activo
    `;

    await registrarAuditoria(req.user.id, 'BLOG_CATEGORIA_CREADA', 'BLOG_CATEGORIAS', result[0].id, result[0]);

    res.status(201).json({ mensaje: 'Categoria creada exitosamente', categoria: result[0] });
  } catch (error) {
    console.error('Error creando categoria del blog:', error);
    res.status(500).json({ error: 'Error al crear categoria' });
  }
};

/**
 * Actualizar categoria
 * PUT /api/blog/categorias/:id
 */
const actualizarCategoria = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, colorBadge, colorFooter, orden } = req.body;

    if (!nombre || nombre.trim() === '') {
      return res.status(400).json({ error: 'El nombre es requerido' });
    }

    const existe = await prisma.$queryRaw`
      SELECT id FROM tbl_blog_categorias WHERE id = ${parseInt(id)} AND activo = true
    `;
    if (!existe || existe.length === 0) {
      return res.status(404).json({ error: 'Categoria no encontrada' });
    }

    const slug = generarSlug(nombre);

    const duplicado = await prisma.$queryRaw`
      SELECT id FROM tbl_blog_categorias WHERE slug = ${slug} AND id != ${parseInt(id)}
    `;
    if (duplicado.length > 0) {
      return res.status(400).json({ error: 'Ya existe otra categoria con ese nombre' });
    }

    const result = await prisma.$queryRaw`
      UPDATE tbl_blog_categorias
      SET nombre = ${nombre.trim()}, slug = ${slug},
          color_badge = ${colorBadge || '#2563EB'}, color_footer = ${colorFooter || '#2563EB'},
          orden = ${parseInt(orden) || 0},
          user_id_modification = ${req.user.id}, date_time_modification = NOW()
      WHERE id = ${parseInt(id)}
      RETURNING id, nombre, slug, color_badge as "colorBadge", color_footer as "colorFooter", orden, activo
    `;

    await registrarAuditoria(req.user.id, 'BLOG_CATEGORIA_ACTUALIZADA', 'BLOG_CATEGORIAS', result[0].id, result[0]);

    res.json({ mensaje: 'Categoria actualizada exitosamente', categoria: result[0] });
  } catch (error) {
    console.error('Error actualizando categoria del blog:', error);
    res.status(500).json({ error: 'Error al actualizar categoria' });
  }
};

/**
 * Eliminar categoria (soft delete)
 * DELETE /api/blog/categorias/:id
 */
const eliminarCategoria = async (req, res) => {
  try {
    const { id } = req.params;

    const enUso = await prisma.$queryRaw`
      SELECT COUNT(*)::int as total FROM tbl_blog_articulos WHERE id_categoria = ${parseInt(id)} AND activo = true
    `;
    if (enUso[0].total > 0) {
      return res.status(400).json({ error: `No se puede eliminar: esta categoria tiene ${enUso[0].total} articulo(s) asociado(s)` });
    }

    await prisma.$queryRaw`
      UPDATE tbl_blog_categorias SET activo = false, user_id_modification = ${req.user.id}, date_time_modification = NOW()
      WHERE id = ${parseInt(id)}
    `;

    await registrarAuditoria(req.user.id, 'BLOG_CATEGORIA_ELIMINADA', 'BLOG_CATEGORIAS', parseInt(id), { id: parseInt(id) });

    res.json({ mensaje: 'Categoria eliminada exitosamente' });
  } catch (error) {
    console.error('Error eliminando categoria del blog:', error);
    res.status(500).json({ error: 'Error al eliminar categoria' });
  }
};

// ============================================
// ARTICULOS - CRUD ADMIN
// ============================================

/**
 * Listar articulos (admin) - todos los estados
 * GET /api/blog/articulos
 */
const listarArticulos = async (req, res) => {
  try {
    const articulos = await prisma.$queryRaw`
      SELECT a.id, a.titulo, a.slug, a.extracto, a.imagen_path as "imagenPath",
             a.id_categoria as "idCategoria", a.autor, a.destacado, a.recomendado,
             a.vistas, a.estado, a.fecha_publicacion as "fechaPublicacion",
             a.tags, a.activo, a.date_time_registration as "fechaCreacion",
             c.nombre as "categoriaNombre", c.color_badge as "categoriaColor"
      FROM tbl_blog_articulos a
      LEFT JOIN tbl_blog_categorias c ON a.id_categoria = c.id
      WHERE a.activo = true
      ORDER BY a.date_time_registration DESC
    `;
    res.json({ articulos });
  } catch (error) {
    console.error('Error listando articulos del blog:', error);
    res.status(500).json({ error: 'Error al listar articulos' });
  }
};

/**
 * Obtener articulo por ID (admin)
 * GET /api/blog/articulos/:id
 */
const obtenerArticulo = async (req, res) => {
  try {
    const { id } = req.params;
    const articulos = await prisma.$queryRaw`
      SELECT a.id, a.titulo, a.slug, a.extracto, a.contenido, a.imagen_path as "imagenPath",
             a.id_categoria as "idCategoria", a.autor, a.destacado, a.recomendado,
             a.vistas, a.estado, a.fecha_publicacion as "fechaPublicacion",
             a.tags, a.meta_description as "metaDescription", a.activo,
             c.nombre as "categoriaNombre", c.color_badge as "categoriaColor"
      FROM tbl_blog_articulos a
      LEFT JOIN tbl_blog_categorias c ON a.id_categoria = c.id
      WHERE a.id = ${parseInt(id)} AND a.activo = true
    `;

    if (!articulos || articulos.length === 0) {
      return res.status(404).json({ error: 'Articulo no encontrado' });
    }

    res.json({ articulo: articulos[0] });
  } catch (error) {
    console.error('Error obteniendo articulo del blog:', error);
    res.status(500).json({ error: 'Error al obtener articulo' });
  }
};

/**
 * Crear articulo
 * POST /api/blog/articulos
 */
const crearArticulo = async (req, res) => {
  try {
    const { titulo, extracto, contenido, idCategoria, autor, destacado, recomendado, estado, tags, metaDescription } = req.body;

    if (!titulo || titulo.trim() === '') {
      return res.status(400).json({ error: 'El titulo es requerido' });
    }

    let slug = generarSlug(titulo);

    // Asegurar slug unico
    const existeSlug = await prisma.$queryRaw`
      SELECT id FROM tbl_blog_articulos WHERE slug = ${slug}
    `;
    if (existeSlug.length > 0) {
      slug = `${slug}-${Date.now()}`;
    }

    // Procesar imagen si viene en el request
    let imagenPath = null;
    if (req.file) {
      imagenPath = await procesarBannerFile(req.file, 'blog');
    }

    const fechaPublicacion = estado === 'PUBLICADO' ? new Date() : null;

    const result = await prisma.$queryRaw`
      INSERT INTO tbl_blog_articulos (
        titulo, slug, extracto, contenido, imagen_path, id_categoria, autor,
        destacado, recomendado, estado, fecha_publicacion, tags, meta_description,
        activo, user_id_registration, date_time_registration
      ) VALUES (
        ${titulo.trim()}, ${slug}, ${extracto || null}, ${contenido || null},
        ${imagenPath}, ${idCategoria ? parseInt(idCategoria) : null}, ${autor || null},
        ${destacado === 'true' || destacado === true}, ${recomendado === 'true' || recomendado === true},
        ${estado || 'BORRADOR'}, ${fechaPublicacion}, ${tags || null}, ${metaDescription || null},
        true, ${req.user.id}, NOW()
      )
      RETURNING id, titulo, slug, estado, imagen_path as "imagenPath"
    `;

    await registrarAuditoria(req.user.id, 'BLOG_ARTICULO_CREADO', 'BLOG_ARTICULOS', result[0].id, { titulo, estado });

    res.status(201).json({ mensaje: 'Articulo creado exitosamente', articulo: result[0] });
  } catch (error) {
    console.error('Error creando articulo del blog:', error);
    res.status(500).json({ error: 'Error al crear articulo' });
  }
};

/**
 * Actualizar articulo
 * PUT /api/blog/articulos/:id
 */
const actualizarArticulo = async (req, res) => {
  try {
    const { id } = req.params;
    const { titulo, extracto, contenido, idCategoria, autor, destacado, recomendado, estado, tags, metaDescription } = req.body;

    if (!titulo || titulo.trim() === '') {
      return res.status(400).json({ error: 'El titulo es requerido' });
    }

    // Verificar que existe
    const existente = await prisma.$queryRaw`
      SELECT id, imagen_path as "imagenPath", estado, fecha_publicacion as "fechaPublicacion"
      FROM tbl_blog_articulos WHERE id = ${parseInt(id)} AND activo = true
    `;
    if (!existente || existente.length === 0) {
      return res.status(404).json({ error: 'Articulo no encontrado' });
    }

    // Procesar nueva imagen si viene
    let imagenPath = existente[0].imagenPath;
    if (req.file) {
      // Eliminar imagen anterior
      if (existente[0].imagenPath) {
        await eliminarArchivoBanner(existente[0].imagenPath);
      }
      imagenPath = await procesarBannerFile(req.file, 'blog');
    }

    // Si cambia a PUBLICADO y no tenia fecha, asignar
    let fechaPublicacion = existente[0].fechaPublicacion;
    if (estado === 'PUBLICADO' && existente[0].estado !== 'PUBLICADO') {
      fechaPublicacion = new Date();
    }

    const result = await prisma.$queryRaw`
      UPDATE tbl_blog_articulos
      SET titulo = ${titulo.trim()}, extracto = ${extracto || null}, contenido = ${contenido || null},
          imagen_path = ${imagenPath}, id_categoria = ${idCategoria ? parseInt(idCategoria) : null},
          autor = ${autor || null}, destacado = ${destacado === 'true' || destacado === true},
          recomendado = ${recomendado === 'true' || recomendado === true},
          estado = ${estado || 'BORRADOR'}, fecha_publicacion = ${fechaPublicacion},
          tags = ${tags || null}, meta_description = ${metaDescription || null},
          user_id_modification = ${req.user.id}, date_time_modification = NOW()
      WHERE id = ${parseInt(id)}
      RETURNING id, titulo, slug, estado, imagen_path as "imagenPath"
    `;

    await registrarAuditoria(req.user.id, 'BLOG_ARTICULO_ACTUALIZADO', 'BLOG_ARTICULOS', result[0].id, { titulo, estado });

    res.json({ mensaje: 'Articulo actualizado exitosamente', articulo: result[0] });
  } catch (error) {
    console.error('Error actualizando articulo del blog:', error);
    res.status(500).json({ error: 'Error al actualizar articulo' });
  }
};

/**
 * Eliminar articulo (soft delete)
 * DELETE /api/blog/articulos/:id
 */
const eliminarArticulo = async (req, res) => {
  try {
    const { id } = req.params;

    const existente = await prisma.$queryRaw`
      SELECT id, imagen_path as "imagenPath" FROM tbl_blog_articulos WHERE id = ${parseInt(id)} AND activo = true
    `;
    if (!existente || existente.length === 0) {
      return res.status(404).json({ error: 'Articulo no encontrado' });
    }

    await prisma.$queryRaw`
      UPDATE tbl_blog_articulos SET activo = false, user_id_modification = ${req.user.id}, date_time_modification = NOW()
      WHERE id = ${parseInt(id)}
    `;

    await registrarAuditoria(req.user.id, 'BLOG_ARTICULO_ELIMINADO', 'BLOG_ARTICULOS', parseInt(id), { id: parseInt(id) });

    res.json({ mensaje: 'Articulo eliminado exitosamente' });
  } catch (error) {
    console.error('Error eliminando articulo del blog:', error);
    res.status(500).json({ error: 'Error al eliminar articulo' });
  }
};

/**
 * Toggle estado (BORRADOR <-> PUBLICADO)
 * PATCH /api/blog/articulos/:id/toggle-estado
 */
const toggleEstado = async (req, res) => {
  try {
    const { id } = req.params;

    const existente = await prisma.$queryRaw`
      SELECT id, estado, fecha_publicacion FROM tbl_blog_articulos WHERE id = ${parseInt(id)} AND activo = true
    `;
    if (!existente || existente.length === 0) {
      return res.status(404).json({ error: 'Articulo no encontrado' });
    }

    const nuevoEstado = existente[0].estado === 'PUBLICADO' ? 'BORRADOR' : 'PUBLICADO';
    const fechaPub = nuevoEstado === 'PUBLICADO' && !existente[0].fecha_publicacion ? new Date() : existente[0].fecha_publicacion;

    const result = await prisma.$queryRaw`
      UPDATE tbl_blog_articulos
      SET estado = ${nuevoEstado}, fecha_publicacion = ${fechaPub},
          user_id_modification = ${req.user.id}, date_time_modification = NOW()
      WHERE id = ${parseInt(id)}
      RETURNING id, titulo, estado
    `;

    await registrarAuditoria(req.user.id, 'BLOG_ARTICULO_ESTADO_CAMBIADO', 'BLOG_ARTICULOS', parseInt(id), { nuevoEstado });

    res.json({ mensaje: `Articulo ${nuevoEstado === 'PUBLICADO' ? 'publicado' : 'despublicado'} exitosamente`, articulo: result[0] });
  } catch (error) {
    console.error('Error cambiando estado del articulo:', error);
    res.status(500).json({ error: 'Error al cambiar estado' });
  }
};

/**
 * Toggle destacado
 * PATCH /api/blog/articulos/:id/toggle-destacado
 */
const toggleDestacado = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await prisma.$queryRaw`
      UPDATE tbl_blog_articulos
      SET destacado = NOT destacado,
          user_id_modification = ${req.user.id}, date_time_modification = NOW()
      WHERE id = ${parseInt(id)} AND activo = true
      RETURNING id, titulo, destacado
    `;

    if (!result || result.length === 0) {
      return res.status(404).json({ error: 'Articulo no encontrado' });
    }

    res.json({ mensaje: 'Destacado actualizado', articulo: result[0] });
  } catch (error) {
    console.error('Error toggle destacado:', error);
    res.status(500).json({ error: 'Error al actualizar destacado' });
  }
};

/**
 * Toggle recomendado
 * PATCH /api/blog/articulos/:id/toggle-recomendado
 */
const toggleRecomendado = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await prisma.$queryRaw`
      UPDATE tbl_blog_articulos
      SET recomendado = NOT recomendado,
          user_id_modification = ${req.user.id}, date_time_modification = NOW()
      WHERE id = ${parseInt(id)} AND activo = true
      RETURNING id, titulo, recomendado
    `;

    if (!result || result.length === 0) {
      return res.status(404).json({ error: 'Articulo no encontrado' });
    }

    res.json({ mensaje: 'Recomendado actualizado', articulo: result[0] });
  } catch (error) {
    console.error('Error toggle recomendado:', error);
    res.status(500).json({ error: 'Error al actualizar recomendado' });
  }
};

// ============================================
// ENDPOINTS PUBLICOS
// ============================================

/**
 * Listar articulos publicados con paginacion y filtros
 * GET /api/public/blog
 */
const getArticulosPublicos = async (req, res) => {
  try {
    const { page = 1, limit = 6, categoria, busqueda } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClause = `WHERE a.activo = true AND a.estado = 'PUBLICADO'`;
    const params = [];

    if (categoria) {
      whereClause += ` AND c.slug = '${categoria.replace(/'/g, "''")}'`;
    }

    if (busqueda) {
      const term = busqueda.replace(/'/g, "''");
      whereClause += ` AND (a.titulo ILIKE '%${term}%' OR a.extracto ILIKE '%${term}%' OR a.tags ILIKE '%${term}%')`;
    }

    // Total count
    const countResult = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*)::int as total
      FROM tbl_blog_articulos a
      LEFT JOIN tbl_blog_categorias c ON a.id_categoria = c.id
      ${whereClause}
    `);

    // Articulos paginados
    const articulos = await prisma.$queryRawUnsafe(`
      SELECT a.id, a.titulo, a.slug, a.extracto, a.imagen_path as "imagenPath",
             a.autor, a.vistas, a.fecha_publicacion as "fechaPublicacion", a.tags,
             c.nombre as "categoriaNombre", c.slug as "categoriaSlug",
             c.color_badge as "categoriaColorBadge", c.color_footer as "categoriaColorFooter"
      FROM tbl_blog_articulos a
      LEFT JOIN tbl_blog_categorias c ON a.id_categoria = c.id
      ${whereClause}
      ORDER BY a.fecha_publicacion DESC, a.id DESC
      LIMIT ${parseInt(limit)} OFFSET ${offset}
    `);

    const total = countResult[0].total;

    res.json({
      articulos,
      paginacion: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error obteniendo articulos publicos:', error);
    res.status(500).json({ error: 'Error al obtener articulos' });
  }
};

/**
 * Obtener articulo por slug (publico)
 * GET /api/public/blog/:slug
 */
const getArticuloPorSlug = async (req, res) => {
  try {
    const { slug } = req.params;

    const articulos = await prisma.$queryRaw`
      SELECT a.id, a.titulo, a.slug, a.extracto, a.contenido, a.imagen_path as "imagenPath",
             a.autor, a.vistas, a.fecha_publicacion as "fechaPublicacion", a.tags,
             a.meta_description as "metaDescription",
             c.nombre as "categoriaNombre", c.slug as "categoriaSlug",
             c.color_badge as "categoriaColorBadge", c.color_footer as "categoriaColorFooter"
      FROM tbl_blog_articulos a
      LEFT JOIN tbl_blog_categorias c ON a.id_categoria = c.id
      WHERE a.slug = ${slug} AND a.activo = true AND a.estado = 'PUBLICADO'
    `;

    if (!articulos || articulos.length === 0) {
      return res.status(404).json({ error: 'Articulo no encontrado' });
    }

    // Incrementar vistas
    await prisma.$executeRaw`
      UPDATE tbl_blog_articulos SET vistas = vistas + 1 WHERE id = ${articulos[0].id}
    `;

    res.json({ articulo: articulos[0] });
  } catch (error) {
    console.error('Error obteniendo articulo por slug:', error);
    res.status(500).json({ error: 'Error al obtener articulo' });
  }
};

/**
 * Obtener articulos recomendados (publico)
 * GET /api/public/blog/recomendados
 */
const getRecomendados = async (req, res) => {
  try {
    const articulos = await prisma.$queryRaw`
      SELECT a.id, a.titulo, a.slug, a.extracto, a.imagen_path as "imagenPath",
             a.fecha_publicacion as "fechaPublicacion",
             c.nombre as "categoriaNombre", c.color_badge as "categoriaColorBadge"
      FROM tbl_blog_articulos a
      LEFT JOIN tbl_blog_categorias c ON a.id_categoria = c.id
      WHERE a.activo = true AND a.estado = 'PUBLICADO' AND a.recomendado = true
      ORDER BY a.fecha_publicacion DESC
      LIMIT 5
    `;
    res.json({ articulos });
  } catch (error) {
    console.error('Error obteniendo recomendados:', error);
    res.status(500).json({ error: 'Error al obtener recomendados' });
  }
};

/**
 * Obtener articulos mas leidos (publico)
 * GET /api/public/blog/mas-leidos
 */
const getMasLeidos = async (req, res) => {
  try {
    const articulos = await prisma.$queryRaw`
      SELECT a.id, a.titulo, a.slug, a.extracto, a.imagen_path as "imagenPath",
             a.vistas, a.fecha_publicacion as "fechaPublicacion",
             c.nombre as "categoriaNombre", c.slug as "categoriaSlug",
             c.color_badge as "categoriaColorBadge", c.color_footer as "categoriaColorFooter"
      FROM tbl_blog_articulos a
      LEFT JOIN tbl_blog_categorias c ON a.id_categoria = c.id
      WHERE a.activo = true AND a.estado = 'PUBLICADO'
      ORDER BY a.vistas DESC
      LIMIT 6
    `;
    res.json({ articulos });
  } catch (error) {
    console.error('Error obteniendo mas leidos:', error);
    res.status(500).json({ error: 'Error al obtener mas leidos' });
  }
};

/**
 * Obtener categorias publicas (para filtros)
 * GET /api/public/blog/categorias
 */
const getCategoriasPublicas = async (req, res) => {
  try {
    const categorias = await prisma.$queryRaw`
      SELECT c.id, c.nombre, c.slug, c.color_badge as "colorBadge", c.color_footer as "colorFooter",
             COUNT(a.id)::int as "totalArticulos"
      FROM tbl_blog_categorias c
      LEFT JOIN tbl_blog_articulos a ON a.id_categoria = c.id AND a.activo = true AND a.estado = 'PUBLICADO'
      WHERE c.activo = true
      GROUP BY c.id, c.nombre, c.slug, c.color_badge, c.color_footer
      ORDER BY c.orden ASC
    `;
    res.json({ categorias });
  } catch (error) {
    console.error('Error obteniendo categorias publicas:', error);
    res.status(500).json({ error: 'Error al obtener categorias' });
  }
};

module.exports = {
  // Categorias admin
  listarCategorias,
  crearCategoria,
  actualizarCategoria,
  eliminarCategoria,
  // Articulos admin
  listarArticulos,
  obtenerArticulo,
  crearArticulo,
  actualizarArticulo,
  eliminarArticulo,
  toggleEstado,
  toggleDestacado,
  toggleRecomendado,
  // Publicos
  getArticulosPublicos,
  getArticuloPorSlug,
  getRecomendados,
  getMasLeidos,
  getCategoriasPublicas
};
