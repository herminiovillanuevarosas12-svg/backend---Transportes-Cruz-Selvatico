/**
 * Promociones Controller
 * CRUD de promociones para la landing page
 */

const prisma = require('../config/prisma');
const { registrarAuditoria } = require('../services/auditoriaService');
const { procesarBannerFile, eliminarArchivoBanner } = require('../middleware/bannerUpload');

/**
 * Obtener promociones activas y vigentes (publico)
 * GET /api/public/promociones
 */
const getPromocionesPublicas = async (req, res) => {
  try {
    const promociones = await prisma.$queryRaw`
      SELECT
        id,
        titulo,
        subtitulo,
        descripcion,
        imagen_path as "imagenPath",
        porcentaje_descuento as "porcentajeDescuento",
        codigo_promocion as "codigoPromocion",
        url_destino as "urlDestino",
        orden
      FROM tbl_promociones_landing
      WHERE activo = true
        AND (fecha_inicio IS NULL OR fecha_inicio <= CURRENT_DATE)
        AND (fecha_fin IS NULL OR fecha_fin >= CURRENT_DATE)
      ORDER BY orden ASC, id ASC
    `;

    res.json({ promociones });
  } catch (error) {
    console.error('Error obteniendo promociones publicas:', error);
    if (error.code === '42P01' || error.code === '42703') {
      return res.json({ promociones: [] });
    }
    res.status(500).json({ error: 'Error al obtener promociones' });
  }
};

/**
 * Listar todas las promociones (admin)
 * GET /api/promociones
 */
const listar = async (req, res) => {
  try {
    const promociones = await prisma.$queryRaw`
      SELECT
        id,
        titulo,
        subtitulo,
        descripcion,
        imagen_path as "imagenPath",
        porcentaje_descuento as "porcentajeDescuento",
        codigo_promocion as "codigoPromocion",
        url_destino as "urlDestino",
        orden,
        activo,
        fecha_inicio as "fechaInicio",
        fecha_fin as "fechaFin",
        date_time_registration as "createdAt",
        date_time_modification as "updatedAt"
      FROM tbl_promociones_landing
      ORDER BY orden ASC, id ASC
    `;

    res.json({ promociones });
  } catch (error) {
    console.error('Error listando promociones:', error);
    if (error.code === '42P01' || error.code === '42703') {
      return res.json({ promociones: [] });
    }
    res.status(500).json({ error: 'Error al listar promociones' });
  }
};

/**
 * Crear promocion
 * POST /api/promociones
 */
const crear = async (req, res) => {
  try {
    const {
      titulo, subtitulo, descripcion,
      porcentajeDescuento, codigoPromocion,
      urlDestino, orden, activo,
      fechaInicio, fechaFin
    } = req.body;

    let imagenPath = null;

    if (req.file) {
      imagenPath = await procesarBannerFile(req.file, 'promocion');
    }

    const result = await prisma.$queryRaw`
      INSERT INTO tbl_promociones_landing (
        titulo,
        subtitulo,
        descripcion,
        imagen_path,
        porcentaje_descuento,
        codigo_promocion,
        url_destino,
        orden,
        activo,
        fecha_inicio,
        fecha_fin,
        user_id_registration,
        date_time_registration
      ) VALUES (
        ${titulo || null},
        ${subtitulo || null},
        ${descripcion || null},
        ${imagenPath},
        ${porcentajeDescuento ? parseFloat(porcentajeDescuento) : null},
        ${codigoPromocion || null},
        ${urlDestino || null},
        ${parseInt(orden) || 0},
        ${activo !== false},
        ${fechaInicio ? new Date(fechaInicio) : null},
        ${fechaFin ? new Date(fechaFin) : null},
        ${req.user.id},
        NOW()
      )
      RETURNING
        id,
        titulo,
        subtitulo,
        descripcion,
        imagen_path as "imagenPath",
        porcentaje_descuento as "porcentajeDescuento",
        codigo_promocion as "codigoPromocion",
        url_destino as "urlDestino",
        orden,
        activo,
        fecha_inicio as "fechaInicio",
        fecha_fin as "fechaFin"
    `;

    await registrarAuditoria(
      req.user.id,
      'PROMOCION_CREADA',
      'PROMOCIONES_LANDING',
      result[0].id,
      result[0]
    );

    res.status(201).json({
      mensaje: 'Promocion creada exitosamente',
      promocion: result[0]
    });
  } catch (error) {
    console.error('Error creando promocion:', error);
    res.status(500).json({ error: 'Error al crear promocion' });
  }
};

/**
 * Actualizar promocion
 * PUT /api/promociones/:id
 */
const actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      titulo, subtitulo, descripcion,
      porcentajeDescuento, codigoPromocion,
      urlDestino, orden, activo,
      fechaInicio, fechaFin
    } = req.body;

    const actual = await prisma.$queryRaw`
      SELECT id, imagen_path as "imagenPath"
      FROM tbl_promociones_landing
      WHERE id = ${parseInt(id)}
    `;

    if (!actual || actual.length === 0) {
      return res.status(404).json({ error: 'Promocion no encontrada' });
    }

    let imagenPath = actual[0].imagenPath;

    if (req.file) {
      await eliminarArchivoBanner(actual[0].imagenPath);
      imagenPath = await procesarBannerFile(req.file, 'promocion');
    }

    const result = await prisma.$queryRaw`
      UPDATE tbl_promociones_landing SET
        titulo = ${titulo || null},
        subtitulo = ${subtitulo || null},
        descripcion = ${descripcion || null},
        imagen_path = ${imagenPath},
        porcentaje_descuento = ${porcentajeDescuento ? parseFloat(porcentajeDescuento) : null},
        codigo_promocion = ${codigoPromocion || null},
        url_destino = ${urlDestino || null},
        orden = ${parseInt(orden) || 0},
        activo = ${activo !== false},
        fecha_inicio = ${fechaInicio ? new Date(fechaInicio) : null},
        fecha_fin = ${fechaFin ? new Date(fechaFin) : null},
        user_id_modification = ${req.user.id},
        date_time_modification = NOW()
      WHERE id = ${parseInt(id)}
      RETURNING
        id,
        titulo,
        subtitulo,
        descripcion,
        imagen_path as "imagenPath",
        porcentaje_descuento as "porcentajeDescuento",
        codigo_promocion as "codigoPromocion",
        url_destino as "urlDestino",
        orden,
        activo,
        fecha_inicio as "fechaInicio",
        fecha_fin as "fechaFin"
    `;

    await registrarAuditoria(
      req.user.id,
      'PROMOCION_ACTUALIZADA',
      'PROMOCIONES_LANDING',
      parseInt(id),
      result[0]
    );

    res.json({
      mensaje: 'Promocion actualizada exitosamente',
      promocion: result[0]
    });
  } catch (error) {
    console.error('Error actualizando promocion:', error);
    res.status(500).json({ error: 'Error al actualizar promocion' });
  }
};

/**
 * Eliminar promocion
 * DELETE /api/promociones/:id
 */
const eliminar = async (req, res) => {
  try {
    const { id } = req.params;

    const promocion = await prisma.$queryRaw`
      SELECT id, imagen_path as "imagenPath"
      FROM tbl_promociones_landing
      WHERE id = ${parseInt(id)}
    `;

    if (!promocion || promocion.length === 0) {
      return res.status(404).json({ error: 'Promocion no encontrada' });
    }

    await eliminarArchivoBanner(promocion[0].imagenPath);

    await prisma.$executeRaw`DELETE FROM tbl_promociones_landing WHERE id = ${parseInt(id)}`;

    await registrarAuditoria(
      req.user.id,
      'PROMOCION_ELIMINADA',
      'PROMOCIONES_LANDING',
      parseInt(id),
      { id: parseInt(id) }
    );

    res.json({ mensaje: 'Promocion eliminada exitosamente' });
  } catch (error) {
    console.error('Error eliminando promocion:', error);
    res.status(500).json({ error: 'Error al eliminar promocion' });
  }
};

/**
 * Toggle activo/inactivo
 * PATCH /api/promociones/:id/toggle
 */
const toggleActivo = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await prisma.$queryRaw`
      UPDATE tbl_promociones_landing SET
        activo = NOT activo,
        user_id_modification = ${req.user.id},
        date_time_modification = NOW()
      WHERE id = ${parseInt(id)}
      RETURNING id, activo
    `;

    if (!result || result.length === 0) {
      return res.status(404).json({ error: 'Promocion no encontrada' });
    }

    await registrarAuditoria(
      req.user.id,
      'PROMOCION_ACTUALIZADA',
      'PROMOCIONES_LANDING',
      parseInt(id),
      { activo: result[0].activo }
    );

    res.json({
      mensaje: result[0].activo ? 'Promocion activada' : 'Promocion desactivada',
      activo: result[0].activo
    });
  } catch (error) {
    console.error('Error toggling promocion:', error);
    res.status(500).json({ error: 'Error al actualizar promocion' });
  }
};

module.exports = {
  getPromocionesPublicas,
  listar,
  crear,
  actualizar,
  eliminar,
  toggleActivo
};
