/**
 * Festividades Controller
 * CRUD de festividades por punto (agencia/terminal)
 * Las imágenes se gestionan via festividadesImagenesController
 */

const prisma = require('../config/prisma');
const { registrarAuditoria } = require('../services/auditoriaService');
const { eliminarArchivoBanner } = require('../middleware/bannerUpload');

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
        f.activo,
        f.orden,
        f.date_time_registration as "createdAt",
        p.nombre as "puntoNombre",
        p.ciudad as "puntoCiudad"
      FROM tbl_festividades f
      JOIN tbl_puntos p ON p.id = f.id_punto
      ORDER BY f.orden ASC, f.id DESC
    `;

    const imagenes = await prisma.$queryRaw`
      SELECT
        id,
        id_festividad as "idFestividad",
        imagen_path as "imagenPath",
        orden
      FROM tbl_festividades_imagenes
      ORDER BY orden ASC, id ASC
    `;

    const imagenesMap = {};
    for (const img of imagenes) {
      if (!imagenesMap[img.idFestividad]) imagenesMap[img.idFestividad] = [];
      imagenesMap[img.idFestividad].push(img);
    }

    const result = festividades.map(f => ({
      ...f,
      imagenes: imagenesMap[f.id] || []
    }));

    res.json({ festividades: result });
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
    const { titulo, descripcion, idPunto, activo, orden } = req.body;

    if (!titulo || !idPunto) {
      return res.status(400).json({ error: 'Título y punto son requeridos' });
    }

    const result = await prisma.$queryRaw`
      INSERT INTO tbl_festividades (
        id_punto, titulo, descripcion,
        activo, orden, user_id_registration, date_time_registration
      ) VALUES (
        ${parseInt(idPunto)},
        ${titulo},
        ${descripcion || null},
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
      festividad: { ...result[0], imagenes: [] }
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
    const { titulo, descripcion, idPunto, activo, orden } = req.body;

    const actual = await prisma.$queryRaw`
      SELECT id FROM tbl_festividades WHERE id = ${parseInt(id)}
    `;

    if (!actual || actual.length === 0) {
      return res.status(404).json({ error: 'Festividad no encontrada' });
    }

    const result = await prisma.$queryRaw`
      UPDATE tbl_festividades SET
        titulo = ${titulo || null},
        descripcion = ${descripcion || null},
        id_punto = ${parseInt(idPunto)},
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
      SELECT id FROM tbl_festividades WHERE id = ${parseInt(id)}
    `;

    if (!festividad || festividad.length === 0) {
      return res.status(404).json({ error: 'Festividad no encontrada' });
    }

    // Eliminar archivos de S3/local antes del CASCADE
    const imagenes = await prisma.$queryRaw`
      SELECT imagen_path as "imagenPath" FROM tbl_festividades_imagenes WHERE id_festividad = ${parseInt(id)}
    `;
    for (const img of imagenes) {
      await eliminarArchivoBanner(img.imagenPath);
    }

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
 * Obtener festividades activas con imágenes (público)
 * GET /api/public/festividades
 */
const getFestividadesPublicas = async (req, res) => {
  try {
    const festividades = await prisma.$queryRaw`
      SELECT
        f.id,
        f.titulo,
        f.descripcion,
        f.orden,
        p.id as "puntoId",
        p.nombre as "puntoNombre",
        p.ciudad as "puntoCiudad"
      FROM tbl_festividades f
      JOIN tbl_puntos p ON p.id = f.id_punto
      WHERE f.activo = true AND p.estado = 1
      ORDER BY p.ciudad ASC, f.orden ASC, f.id DESC
    `;

    const imagenes = festividades.length > 0
      ? await prisma.$queryRaw`
          SELECT
            id,
            id_festividad as "idFestividad",
            imagen_path as "imagenPath",
            orden
          FROM tbl_festividades_imagenes
          ORDER BY orden ASC, id ASC
        `
      : [];

    const imagenesMap = {};
    for (const img of imagenes) {
      if (!imagenesMap[img.idFestividad]) imagenesMap[img.idFestividad] = [];
      imagenesMap[img.idFestividad].push(img);
    }

    const result = festividades.map(f => ({
      ...f,
      imagenes: imagenesMap[f.id] || []
    }));

    res.json({ festividades: result });
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
