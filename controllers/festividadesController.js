/**
 * Festividades Controller
 * CRUD de festividades por punto (agencia/terminal)
 */

const prisma = require('../config/prisma');
const { registrarAuditoria } = require('../services/auditoriaService');
const { eliminarArchivoBanner, guardarBannerBase64, procesarBannerFile } = require('../middleware/bannerUpload');

/**
 * Listar todas las festividades (admin)
 * GET /api/landing/festividades
 */
const listar = async (req, res) => {
  try {
    const festividades = await prisma.$queryRaw`
      SELECT
        f.id,
        f.id_punto as "idPunto",
        f.titulo,
        f.descripcion,
        f.imagen_path as "imagenPath",
        f.activo,
        f.orden,
        f.date_time_registration as "createdAt",
        p.nombre as "puntoNombre",
        p.ciudad as "puntoCiudad"
      FROM tbl_festividades f
      JOIN tbl_puntos p ON p.id = f.id_punto
      ORDER BY f.orden ASC, f.id DESC
    `;

    res.json({ festividades });
  } catch (error) {
    console.error('Error listando festividades:', error);
    if (error.code === '42P01') {
      return res.json({ festividades: [] });
    }
    res.status(500).json({ error: 'Error al listar festividades' });
  }
};

/**
 * Crear festividad
 * POST /api/landing/festividades
 */
const crear = async (req, res) => {
  try {
    const { titulo, descripcion, idPunto, activo, orden, imagenBase64 } = req.body;

    if (!titulo || !idPunto) {
      return res.status(400).json({ error: 'Título y punto son requeridos' });
    }

    let imagenPath = null;

    if (req.file) {
      imagenPath = await procesarBannerFile(req.file, 'festividad');
    } else if (imagenBase64) {
      imagenPath = await guardarBannerBase64(imagenBase64, 'festividad');
    }

    const result = await prisma.$queryRaw`
      INSERT INTO tbl_festividades (
        id_punto, titulo, descripcion, imagen_path,
        activo, orden, user_id_registration, date_time_registration
      ) VALUES (
        ${parseInt(idPunto)},
        ${titulo},
        ${descripcion || null},
        ${imagenPath},
        ${activo !== false},
        ${parseInt(orden) || 0},
        ${req.user.id},
        NOW()
      )
      RETURNING
        id,
        id_punto as "idPunto",
        titulo,
        descripcion,
        imagen_path as "imagenPath",
        activo,
        orden
    `;

    await registrarAuditoria(
      req.user.id,
      'FESTIVIDAD_CREADA',
      'FESTIVIDADES',
      result[0].id,
      result[0]
    );

    res.status(201).json({
      mensaje: 'Festividad creada exitosamente',
      festividad: result[0]
    });
  } catch (error) {
    console.error('Error creando festividad:', error);
    res.status(500).json({ error: 'Error al crear festividad' });
  }
};

/**
 * Actualizar festividad
 * PUT /api/landing/festividades/:id
 */
const actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const { titulo, descripcion, idPunto, activo, orden, imagenBase64 } = req.body;

    const actual = await prisma.$queryRaw`
      SELECT imagen_path as "imagenPath" FROM tbl_festividades WHERE id = ${parseInt(id)}
    `;

    if (!actual || actual.length === 0) {
      return res.status(404).json({ error: 'Festividad no encontrada' });
    }

    let imagenPath = actual[0].imagenPath;

    if (req.file) {
      await eliminarArchivoBanner(actual[0].imagenPath);
      imagenPath = await procesarBannerFile(req.file, 'festividad');
    } else if (imagenBase64) {
      await eliminarArchivoBanner(actual[0].imagenPath);
      imagenPath = await guardarBannerBase64(imagenBase64, 'festividad');
    }

    const result = await prisma.$queryRaw`
      UPDATE tbl_festividades SET
        titulo = ${titulo || null},
        descripcion = ${descripcion || null},
        id_punto = ${parseInt(idPunto)},
        imagen_path = ${imagenPath},
        activo = ${activo !== false},
        orden = ${parseInt(orden) || 0},
        user_id_modification = ${req.user.id},
        date_time_modification = NOW()
      WHERE id = ${parseInt(id)}
      RETURNING
        id,
        id_punto as "idPunto",
        titulo,
        descripcion,
        imagen_path as "imagenPath",
        activo,
        orden
    `;

    await registrarAuditoria(
      req.user.id,
      'FESTIVIDAD_ACTUALIZADA',
      'FESTIVIDADES',
      parseInt(id),
      result[0]
    );

    res.json({
      mensaje: 'Festividad actualizada exitosamente',
      festividad: result[0]
    });
  } catch (error) {
    console.error('Error actualizando festividad:', error);
    res.status(500).json({ error: 'Error al actualizar festividad' });
  }
};

/**
 * Eliminar festividad
 * DELETE /api/landing/festividades/:id
 */
const eliminar = async (req, res) => {
  try {
    const { id } = req.params;

    const festividad = await prisma.$queryRaw`
      SELECT imagen_path as "imagenPath" FROM tbl_festividades WHERE id = ${parseInt(id)}
    `;

    if (!festividad || festividad.length === 0) {
      return res.status(404).json({ error: 'Festividad no encontrada' });
    }

    await eliminarArchivoBanner(festividad[0].imagenPath);
    await prisma.$executeRaw`DELETE FROM tbl_festividades WHERE id = ${parseInt(id)}`;

    await registrarAuditoria(
      req.user.id,
      'FESTIVIDAD_ELIMINADA',
      'FESTIVIDADES',
      parseInt(id),
      { id: parseInt(id) }
    );

    res.json({ mensaje: 'Festividad eliminada exitosamente' });
  } catch (error) {
    console.error('Error eliminando festividad:', error);
    res.status(500).json({ error: 'Error al eliminar festividad' });
  }
};

/**
 * Toggle activo/inactivo
 * PATCH /api/landing/festividades/:id/toggle
 */
const toggleActivo = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await prisma.$queryRaw`
      UPDATE tbl_festividades SET
        activo = NOT activo,
        user_id_modification = ${req.user.id},
        date_time_modification = NOW()
      WHERE id = ${parseInt(id)}
      RETURNING id, activo
    `;

    if (!result || result.length === 0) {
      return res.status(404).json({ error: 'Festividad no encontrada' });
    }

    await registrarAuditoria(
      req.user.id,
      'FESTIVIDAD_ACTUALIZADA',
      'FESTIVIDADES',
      parseInt(id),
      { activo: result[0].activo }
    );

    res.json({
      mensaje: result[0].activo ? 'Festividad activada' : 'Festividad desactivada',
      activo: result[0].activo
    });
  } catch (error) {
    console.error('Error toggling festividad:', error);
    res.status(500).json({ error: 'Error al actualizar festividad' });
  }
};

/**
 * Obtener festividades activas agrupadas por punto (público)
 * GET /api/public/festividades
 */
const getFestividadesPublicas = async (req, res) => {
  try {
    const festividades = await prisma.$queryRaw`
      SELECT
        f.id,
        f.titulo,
        f.descripcion,
        f.imagen_path as "imagenPath",
        f.orden,
        p.id as "puntoId",
        p.nombre as "puntoNombre",
        p.ciudad as "puntoCiudad"
      FROM tbl_festividades f
      JOIN tbl_puntos p ON p.id = f.id_punto
      WHERE f.activo = true AND p.estado = 1
      ORDER BY p.ciudad ASC, f.orden ASC, f.id DESC
    `;

    res.json({ festividades });
  } catch (error) {
    console.error('Error obteniendo festividades públicas:', error);
    if (error.code === '42P01') {
      return res.json({ festividades: [] });
    }
    res.status(500).json({ error: 'Error al obtener festividades' });
  }
};

module.exports = {
  listar,
  crear,
  actualizar,
  eliminar,
  toggleActivo,
  getFestividadesPublicas
};
