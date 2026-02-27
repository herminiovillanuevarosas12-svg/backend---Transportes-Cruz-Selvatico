/**
 * Paginas de Contenido Controller
 * CRUD de paginas estaticas (nosotros, politicas, terminos, etc.)
 */

const prisma = require('../config/prisma');
const { registrarAuditoria } = require('../services/auditoriaService');
const { procesarBannerFile, eliminarArchivoBanner } = require('../middleware/bannerUpload');

/**
 * Obtener pagina por slug (publico)
 * GET /api/public/paginas/:slug
 */
const getPaginaBySlug = async (req, res) => {
  try {
    const { slug } = req.params;

    const result = await prisma.$queryRaw`
      SELECT
        id,
        slug,
        titulo,
        subtitulo,
        contenido,
        imagen_hero_path as "imagenHeroPath",
        meta_descripcion as "metaDescripcion"
      FROM tbl_paginas_contenido
      WHERE slug = ${slug} AND activo = true
    `;

    if (!result || result.length === 0) {
      return res.status(404).json({ error: 'Pagina no encontrada' });
    }

    res.json({ pagina: result[0] });
  } catch (error) {
    console.error('Error obteniendo pagina por slug:', error);
    if (error.code === '42P01') {
      return res.status(404).json({ error: 'Pagina no encontrada' });
    }
    res.status(500).json({ error: 'Error al obtener pagina' });
  }
};

/**
 * Listar todas las paginas (admin)
 * GET /api/paginas-contenido
 */
const listar = async (req, res) => {
  try {
    const paginas = await prisma.$queryRaw`
      SELECT
        id,
        slug,
        titulo,
        subtitulo,
        activo,
        imagen_hero_path as "imagenHeroPath",
        date_time_registration as "createdAt",
        date_time_modification as "updatedAt"
      FROM tbl_paginas_contenido
      ORDER BY titulo ASC
    `;

    res.json({ paginas });
  } catch (error) {
    console.error('Error listando paginas de contenido:', error);
    if (error.code === '42P01' || error.code === '42703') {
      return res.json({ paginas: [] });
    }
    res.status(500).json({ error: 'Error al listar paginas' });
  }
};

/**
 * Crear pagina de contenido
 * POST /api/paginas-contenido
 */
const crear = async (req, res) => {
  try {
    const { slug, titulo, subtitulo, contenido, metaDescripcion } = req.body;

    if (!slug || slug.trim() === '') {
      return res.status(400).json({ error: 'El slug es requerido' });
    }

    if (!titulo || titulo.trim() === '') {
      return res.status(400).json({ error: 'El titulo es requerido' });
    }

    const existente = await prisma.$queryRaw`
      SELECT id FROM tbl_paginas_contenido WHERE slug = ${slug.trim().toLowerCase()}
    `;

    if (existente && existente.length > 0) {
      return res.status(400).json({ error: 'Ya existe una pagina con ese slug' });
    }

    let imagenHeroPath = null;

    if (req.file) {
      imagenHeroPath = await procesarBannerFile(req.file, 'pagina');
    }

    const result = await prisma.$queryRaw`
      INSERT INTO tbl_paginas_contenido (
        slug,
        titulo,
        subtitulo,
        contenido,
        imagen_hero_path,
        meta_descripcion,
        activo,
        user_id_registration,
        date_time_registration
      ) VALUES (
        ${slug.trim().toLowerCase()},
        ${titulo.trim()},
        ${subtitulo || null},
        ${contenido || null},
        ${imagenHeroPath},
        ${metaDescripcion || null},
        true,
        ${req.user.id},
        NOW()
      )
      RETURNING
        id,
        slug,
        titulo,
        subtitulo,
        contenido,
        imagen_hero_path as "imagenHeroPath",
        meta_descripcion as "metaDescripcion",
        activo
    `;

    await registrarAuditoria(
      req.user.id,
      'PAGINA_CREADA',
      'PAGINAS_CONTENIDO',
      result[0].id,
      result[0]
    );

    res.status(201).json({
      mensaje: 'Pagina creada exitosamente',
      pagina: result[0]
    });
  } catch (error) {
    console.error('Error creando pagina de contenido:', error);
    res.status(500).json({ error: 'Error al crear pagina' });
  }
};

/**
 * Actualizar pagina de contenido
 * PUT /api/paginas-contenido/:id
 */
const actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const { slug, titulo, subtitulo, contenido, metaDescripcion, activo } = req.body;

    const actual = await prisma.$queryRaw`
      SELECT id, imagen_hero_path as "imagenHeroPath"
      FROM tbl_paginas_contenido
      WHERE id = ${parseInt(id)}
    `;

    if (!actual || actual.length === 0) {
      return res.status(404).json({ error: 'Pagina no encontrada' });
    }

    if (slug) {
      const duplicado = await prisma.$queryRaw`
        SELECT id FROM tbl_paginas_contenido
        WHERE slug = ${slug.trim().toLowerCase()} AND id != ${parseInt(id)}
      `;

      if (duplicado && duplicado.length > 0) {
        return res.status(400).json({ error: 'Ya existe otra pagina con ese slug' });
      }
    }

    let imagenHeroPath = actual[0].imagenHeroPath;

    if (req.file) {
      await eliminarArchivoBanner(actual[0].imagenHeroPath);
      imagenHeroPath = await procesarBannerFile(req.file, 'pagina');
    }

    const result = await prisma.$queryRaw`
      UPDATE tbl_paginas_contenido SET
        slug = ${slug ? slug.trim().toLowerCase() : actual[0].slug},
        titulo = ${titulo || null},
        subtitulo = ${subtitulo || null},
        contenido = ${contenido || null},
        imagen_hero_path = ${imagenHeroPath},
        meta_descripcion = ${metaDescripcion || null},
        activo = ${activo !== false},
        user_id_modification = ${req.user.id},
        date_time_modification = NOW()
      WHERE id = ${parseInt(id)}
      RETURNING
        id,
        slug,
        titulo,
        subtitulo,
        contenido,
        imagen_hero_path as "imagenHeroPath",
        meta_descripcion as "metaDescripcion",
        activo
    `;

    await registrarAuditoria(
      req.user.id,
      'PAGINA_ACTUALIZADA',
      'PAGINAS_CONTENIDO',
      parseInt(id),
      result[0]
    );

    res.json({
      mensaje: 'Pagina actualizada exitosamente',
      pagina: result[0]
    });
  } catch (error) {
    console.error('Error actualizando pagina de contenido:', error);
    res.status(500).json({ error: 'Error al actualizar pagina' });
  }
};

/**
 * Eliminar pagina de contenido
 * DELETE /api/paginas-contenido/:id
 */
const eliminar = async (req, res) => {
  try {
    const { id } = req.params;

    const pagina = await prisma.$queryRaw`
      SELECT id, imagen_hero_path as "imagenHeroPath"
      FROM tbl_paginas_contenido
      WHERE id = ${parseInt(id)}
    `;

    if (!pagina || pagina.length === 0) {
      return res.status(404).json({ error: 'Pagina no encontrada' });
    }

    await eliminarArchivoBanner(pagina[0].imagenHeroPath);

    await prisma.$executeRaw`DELETE FROM tbl_paginas_contenido WHERE id = ${parseInt(id)}`;

    await registrarAuditoria(
      req.user.id,
      'PAGINA_ELIMINADA',
      'PAGINAS_CONTENIDO',
      parseInt(id),
      { id: parseInt(id) }
    );

    res.json({ mensaje: 'Pagina eliminada exitosamente' });
  } catch (error) {
    console.error('Error eliminando pagina de contenido:', error);
    res.status(500).json({ error: 'Error al eliminar pagina' });
  }
};

module.exports = {
  getPaginaBySlug,
  listar,
  crear,
  actualizar,
  eliminar
};
