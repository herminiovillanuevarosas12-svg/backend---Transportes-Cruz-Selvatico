/**
 * Encomiendas Info Controller
 * Carrusel hero, imagen del landing y secciones Servicios/Flota de la pagina encomiendas-info.
 * Las secciones de cards (ej. "¿Por qué elegirnos?") viven en seccionesCardsController.
 */

const prisma = require('../config/prisma');
const { registrarAuditoria } = require('../services/auditoriaService');
const { procesarBannerFile, eliminarArchivoBanner } = require('../middleware/bannerUpload');

const MAX_HERO_IMAGENES = 10;

const esTablaInexistente = (error) =>
  error?.code === '42P01' || error?.meta?.code === '42P01';

/**
 * Imagenes del carrusel hero en orden de aparicion.
 * Devuelve [] si la tabla aun no existe (script SQL pendiente).
 */
const obtenerHeroImagenes = async () => {
  try {
    return await prisma.$queryRaw`
      SELECT id, imagen_path as "imagenPath", orden
      FROM tbl_encomiendas_hero_imagenes
      ORDER BY orden ASC, id ASC
    `;
  } catch (error) {
    if (esTablaInexistente(error)) return [];
    throw error;
  }
};

/**
 * Imagenes del carrusel hero (publico y admin)
 * GET /api/public/encomiendas-hero-imagenes
 * GET /api/landing/encomiendas-hero-imagenes
 */
const listarHeroImagenes = async (req, res) => {
  try {
    res.json({ heroImagenes: await obtenerHeroImagenes() });
  } catch (error) {
    console.error('Error obteniendo imagenes hero encomiendas:', error);
    res.status(500).json({ error: 'Error al obtener el carrusel de portada' });
  }
};

/**
 * Agregar imagen al carrusel hero de encomiendas (se agrega al final)
 * POST /api/landing/encomiendas-hero-imagenes
 */
const agregarHeroImagen = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Se requiere una imagen' });
    }

    const [{ total }] = await prisma.$queryRaw`
      SELECT COUNT(*)::int as total FROM tbl_encomiendas_hero_imagenes
    `;
    if (total >= MAX_HERO_IMAGENES) {
      return res.status(400).json({ error: `Máximo ${MAX_HERO_IMAGENES} imágenes en el carrusel` });
    }

    const imagenPath = await procesarBannerFile(req.file, 'encomienda');

    const [imagen] = await prisma.$queryRaw`
      INSERT INTO tbl_encomiendas_hero_imagenes (imagen_path, orden, user_id_registration)
      VALUES (
        ${imagenPath},
        (SELECT COALESCE(MAX(orden) + 1, 0) FROM tbl_encomiendas_hero_imagenes),
        ${req.user.id}
      )
      RETURNING id, imagen_path as "imagenPath", orden
    `;

    await registrarAuditoria(
      req.user.id,
      'ENCOMIENDAS_HERO_IMAGEN_AGREGADA',
      'ENCOMIENDAS_HERO_IMAGENES',
      imagen.id,
      imagen
    );

    res.status(201).json({
      mensaje: 'Imagen agregada al carrusel',
      imagen
    });
  } catch (error) {
    console.error('Error agregando imagen hero encomiendas:', error);
    res.status(500).json({ error: 'Error al agregar imagen al carrusel' });
  }
};

/**
 * Eliminar imagen del carrusel hero de encomiendas
 * DELETE /api/landing/encomiendas-hero-imagenes/:id
 */
const eliminarHeroImagen = async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const [imagen] = await prisma.$queryRaw`
      DELETE FROM tbl_encomiendas_hero_imagenes
      WHERE id = ${id}
      RETURNING id, imagen_path as "imagenPath"
    `;

    if (!imagen) {
      return res.status(404).json({ error: 'Imagen no encontrada' });
    }

    await eliminarArchivoBanner(imagen.imagenPath);

    await registrarAuditoria(
      req.user.id,
      'ENCOMIENDAS_HERO_IMAGEN_ELIMINADA',
      'ENCOMIENDAS_HERO_IMAGENES',
      id,
      imagen
    );

    res.json({ mensaje: 'Imagen eliminada del carrusel' });
  } catch (error) {
    console.error('Error eliminando imagen hero encomiendas:', error);
    res.status(500).json({ error: 'Error al eliminar imagen del carrusel' });
  }
};

/**
 * Reordenar el carrusel hero de encomiendas
 * PUT /api/landing/encomiendas-hero-imagenes/orden
 * Body: { ids: [3, 1, 2] }  (orden final de aparicion)
 */
const reordenarHeroImagenes = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.some(id => !Number.isInteger(id))) {
      return res.status(400).json({ error: 'Se requiere un array de ids' });
    }

    await prisma.$transaction(
      ids.map((id, orden) => prisma.$executeRaw`
        UPDATE tbl_encomiendas_hero_imagenes SET orden = ${orden} WHERE id = ${id}
      `)
    );

    await registrarAuditoria(
      req.user.id,
      'ENCOMIENDAS_HERO_IMAGENES_REORDENADAS',
      'ENCOMIENDAS_HERO_IMAGENES',
      null,
      { ids }
    );

    res.json({ mensaje: 'Orden del carrusel actualizado', heroImagenes: await obtenerHeroImagenes() });
  } catch (error) {
    console.error('Error reordenando imagenes hero encomiendas:', error);
    res.status(500).json({ error: 'Error al reordenar el carrusel' });
  }
};

/**
 * Subir/actualizar imagen de la seccion encomiendas en el landing
 * PUT /api/landing/config/imagen-encomiendas-landing
 */
const subirLandingImagen = async (req, res) => {
  try {
    let imagenPath = null;

    if (req.file) {
      imagenPath = await procesarBannerFile(req.file, 'encomienda');
    }

    if (!imagenPath) {
      return res.status(400).json({ error: 'Se requiere una imagen' });
    }

    try {
      const configActual = await prisma.$queryRaw`
        SELECT encomiendas_landing_imagen as "encomiendasLandingImagen"
        FROM tbl_configuracion_sistema
        WHERE activo = true
        LIMIT 1
      `;
      if (configActual?.[0]?.encomiendasLandingImagen) {
        await eliminarArchivoBanner(configActual[0].encomiendasLandingImagen);
      }
    } catch (e) {}

    await prisma.$executeRaw`
      UPDATE tbl_configuracion_sistema SET
        encomiendas_landing_imagen = ${imagenPath},
        date_time_modification = NOW(),
        user_id_modification = ${req.user.id}
      WHERE activo = true
    `;

    await registrarAuditoria(
      req.user.id,
      'ENCOMIENDAS_LANDING_IMAGEN_ACTUALIZADA',
      'CONFIGURACION',
      null,
      { imagenPath }
    );

    res.json({
      mensaje: 'Imagen de encomiendas landing actualizada exitosamente',
      encomiendasLandingImagen: imagenPath
    });
  } catch (error) {
    console.error('Error subiendo imagen encomiendas landing:', error);
    res.status(500).json({ error: 'Error al subir imagen' });
  }
};

/**
 * Eliminar imagen de la seccion encomiendas en el landing
 * DELETE /api/landing/config/imagen-encomiendas-landing
 */
const eliminarLandingImagen = async (req, res) => {
  try {
    try {
      const configActual = await prisma.$queryRaw`
        SELECT encomiendas_landing_imagen as "encomiendasLandingImagen"
        FROM tbl_configuracion_sistema
        WHERE activo = true
        LIMIT 1
      `;
      if (configActual?.[0]?.encomiendasLandingImagen) {
        await eliminarArchivoBanner(configActual[0].encomiendasLandingImagen);
      }
    } catch (e) {}

    await prisma.$executeRaw`
      UPDATE tbl_configuracion_sistema SET
        encomiendas_landing_imagen = NULL,
        date_time_modification = NOW(),
        user_id_modification = ${req.user.id}
      WHERE activo = true
    `;

    await registrarAuditoria(
      req.user.id,
      'ENCOMIENDAS_LANDING_IMAGEN_ELIMINADA',
      'CONFIGURACION',
      null,
      {}
    );

    res.json({ mensaje: 'Imagen de encomiendas landing eliminada exitosamente' });
  } catch (error) {
    console.error('Error eliminando imagen encomiendas landing:', error);
    res.status(500).json({ error: 'Error al eliminar imagen' });
  }
};

// =============================================
// SECCIONES SERVICIOS/FLOTA
// =============================================

/**
 * Obtener secciones publicas activas agrupadas por tipo
 * GET /api/public/encomiendas-secciones
 */
const getSeccionesPublicas = async (req, res) => {
  try {
    const secciones = await prisma.$queryRaw`
      SELECT
        id,
        tipo,
        titulo,
        descripcion,
        imagen_path as "imagenPath",
        orden
      FROM tbl_encomiendas_secciones
      WHERE activo = true
      ORDER BY orden ASC, id ASC
    `;

    const servicios = secciones.filter(s => s.tipo === 'SERVICIOS');
    const flota = secciones.filter(s => s.tipo === 'FLOTA');

    res.json({ servicios, flota });
  } catch (error) {
    console.error('Error obteniendo secciones encomiendas publicas:', error);
    if (error.code === '42P01' || error.code === '42703') {
      return res.json({ servicios: [], flota: [] });
    }
    res.status(500).json({ error: 'Error al obtener secciones de encomiendas' });
  }
};

/**
 * Listar todas las secciones (admin)
 * GET /api/contenido/encomiendas-secciones
 */
const listarSecciones = async (req, res) => {
  try {
    const secciones = await prisma.$queryRaw`
      SELECT
        id,
        tipo,
        titulo,
        descripcion,
        imagen_path as "imagenPath",
        orden,
        activo,
        date_time_registration as "createdAt",
        date_time_modification as "updatedAt"
      FROM tbl_encomiendas_secciones
      ORDER BY tipo ASC, orden ASC, id ASC
    `;

    res.json({ secciones });
  } catch (error) {
    console.error('Error listando secciones encomiendas:', error);
    if (error.code === '42P01' || error.code === '42703') {
      return res.json({ secciones: [] });
    }
    res.status(500).json({ error: 'Error al listar secciones de encomiendas' });
  }
};

/**
 * Crear seccion (admin)
 * POST /api/contenido/encomiendas-secciones
 */
const crearSeccion = async (req, res) => {
  try {
    const { titulo, descripcion, tipo, orden } = req.body;

    if (!titulo || !titulo.trim()) {
      return res.status(400).json({ error: 'El titulo es obligatorio' });
    }

    const tipoValido = ['SERVICIOS', 'FLOTA'].includes(tipo) ? tipo : 'SERVICIOS';

    let imagenPath = null;
    if (req.file) {
      imagenPath = await procesarBannerFile(req.file, 'encomienda');
    }

    await prisma.$executeRaw`
      INSERT INTO tbl_encomiendas_secciones (
        tipo, titulo, descripcion, imagen_path, orden, activo,
        user_id_registration, date_time_registration
      ) VALUES (
        ${tipoValido},
        ${titulo.trim()},
        ${descripcion || null},
        ${imagenPath},
        ${parseInt(orden) || 0},
        true,
        ${req.user.id},
        NOW()
      )
    `;

    const insertado = await prisma.$queryRaw`
      SELECT
        id, tipo, titulo, descripcion,
        imagen_path as "imagenPath",
        orden, activo
      FROM tbl_encomiendas_secciones
      ORDER BY id DESC
      LIMIT 1
    `;

    await registrarAuditoria(
      req.user.id,
      'ENCOMIENDA_SECCION_CREADA',
      'ENCOMIENDAS_SECCIONES',
      insertado[0].id,
      insertado[0]
    );

    res.status(201).json({
      mensaje: 'Seccion creada exitosamente',
      seccion: insertado[0]
    });
  } catch (error) {
    console.error('Error creando seccion encomienda:', error);
    res.status(500).json({ error: 'Error al crear seccion' });
  }
};

/**
 * Actualizar seccion (admin)
 * PUT /api/contenido/encomiendas-secciones/:id
 */
const actualizarSeccion = async (req, res) => {
  try {
    const { id } = req.params;
    const { titulo, descripcion, tipo, orden } = req.body;

    const seccionActual = await prisma.$queryRaw`
      SELECT imagen_path as "imagenPath"
      FROM tbl_encomiendas_secciones
      WHERE id = ${parseInt(id)}
    `;

    if (!seccionActual || seccionActual.length === 0) {
      return res.status(404).json({ error: 'Seccion no encontrada' });
    }

    const tipoValido = ['SERVICIOS', 'FLOTA'].includes(tipo) ? tipo : 'SERVICIOS';
    let imagenPath = seccionActual[0].imagenPath;

    if (req.file) {
      if (seccionActual[0].imagenPath) {
        await eliminarArchivoBanner(seccionActual[0].imagenPath);
      }
      imagenPath = await procesarBannerFile(req.file, 'encomienda');
    }

    const result = await prisma.$queryRaw`
      UPDATE tbl_encomiendas_secciones SET
        tipo = ${tipoValido},
        titulo = ${titulo},
        descripcion = ${descripcion || null},
        imagen_path = ${imagenPath},
        orden = ${parseInt(orden) || 0},
        date_time_modification = NOW(),
        user_id_modification = ${req.user.id}
      WHERE id = ${parseInt(id)}
      RETURNING
        id, tipo, titulo, descripcion,
        imagen_path as "imagenPath",
        orden, activo
    `;

    await registrarAuditoria(
      req.user.id,
      'ENCOMIENDA_SECCION_ACTUALIZADA',
      'ENCOMIENDAS_SECCIONES',
      parseInt(id),
      result[0]
    );

    res.json({
      mensaje: 'Seccion actualizada exitosamente',
      seccion: result[0]
    });
  } catch (error) {
    console.error('Error actualizando seccion encomienda:', error);
    res.status(500).json({ error: 'Error al actualizar seccion' });
  }
};

/**
 * Eliminar seccion (admin)
 * DELETE /api/contenido/encomiendas-secciones/:id
 */
const eliminarSeccion = async (req, res) => {
  try {
    const { id } = req.params;

    const seccion = await prisma.$queryRaw`
      SELECT imagen_path as "imagenPath"
      FROM tbl_encomiendas_secciones
      WHERE id = ${parseInt(id)}
    `;

    if (!seccion || seccion.length === 0) {
      return res.status(404).json({ error: 'Seccion no encontrada' });
    }

    if (seccion[0].imagenPath) {
      await eliminarArchivoBanner(seccion[0].imagenPath);
    }

    await prisma.$executeRaw`
      DELETE FROM tbl_encomiendas_secciones WHERE id = ${parseInt(id)}
    `;

    await registrarAuditoria(
      req.user.id,
      'ENCOMIENDA_SECCION_ELIMINADA',
      'ENCOMIENDAS_SECCIONES',
      parseInt(id),
      { id: parseInt(id) }
    );

    res.json({ mensaje: 'Seccion eliminada exitosamente' });
  } catch (error) {
    console.error('Error eliminando seccion encomienda:', error);
    res.status(500).json({ error: 'Error al eliminar seccion' });
  }
};

/**
 * Toggle activo/inactivo seccion (admin)
 * PATCH /api/contenido/encomiendas-secciones/:id/toggle
 */
const toggleSeccion = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await prisma.$queryRaw`
      UPDATE tbl_encomiendas_secciones
      SET activo = NOT activo, date_time_modification = NOW(), user_id_modification = ${req.user.id}
      WHERE id = ${parseInt(id)}
      RETURNING id, activo
    `;

    if (!result || result.length === 0) {
      return res.status(404).json({ error: 'Seccion no encontrada' });
    }

    await registrarAuditoria(
      req.user.id,
      'ENCOMIENDA_SECCION_TOGGLE',
      'ENCOMIENDAS_SECCIONES',
      parseInt(id),
      { activo: result[0].activo }
    );

    res.json({
      mensaje: `Seccion ${result[0].activo ? 'activada' : 'desactivada'} exitosamente`,
      activo: result[0].activo
    });
  } catch (error) {
    console.error('Error toggling seccion encomienda:', error);
    res.status(500).json({ error: 'Error al cambiar estado de seccion' });
  }
};

module.exports = {
  // Publicos
  getSeccionesPublicas,
  // Carrusel hero (publico y admin)
  listarHeroImagenes,
  // Admin hero / landing
  agregarHeroImagen,
  eliminarHeroImagen,
  reordenarHeroImagenes,
  subirLandingImagen,
  eliminarLandingImagen,
  // Admin secciones
  listarSecciones,
  crearSeccion,
  actualizarSeccion,
  eliminarSeccion,
  toggleSeccion
};
