/**
 * Festividades Imágenes Controller
 * CRUD de imágenes asociadas a festividades (máx 5 por festividad)
 */

const prisma = require('../config/prisma');
const { registrarAuditoria } = require('../services/auditoriaService');
const { eliminarArchivoBanner, procesarBannerFile } = require('../middleware/bannerUpload');

const MAX_IMAGENES = 5;

/**
 * Listar imágenes de una festividad
 * GET /api/landing/festividades/:id/imagenes
 */
const listar = async (req, res) => {
  try {
    const { id } = req.params;

    const imagenes = await prisma.$queryRaw`
      SELECT
        id,
        id_festividad as "idFestividad",
        imagen_path as "imagenPath",
        orden
      FROM tbl_festividades_imagenes
      WHERE id_festividad = ${parseInt(id)}
      ORDER BY orden ASC, id ASC
    `;

    res.json({ imagenes });
  } catch (error) {
    console.error('Error listando imágenes de festividad:', error);
    if (error.code === '42P01') {
      return res.json({ imagenes: [] });
    }
    res.status(500).json({ error: 'Error al listar imágenes' });
  }
};

/**
 * Agregar imagen a una festividad
 * POST /api/landing/festividades/:id/imagenes
 */
const agregar = async (req, res) => {
  try {
    const { id } = req.params;

    const festividad = await prisma.$queryRaw`
      SELECT id FROM tbl_festividades WHERE id = ${parseInt(id)}
    `;
    if (!festividad || festividad.length === 0) {
      return res.status(404).json({ error: 'Festividad no encontrada' });
    }

    const countResult = await prisma.$queryRaw`
      SELECT COUNT(*)::int as total FROM tbl_festividades_imagenes WHERE id_festividad = ${parseInt(id)}
    `;
    const total = countResult[0].total;

    if (total >= MAX_IMAGENES) {
      return res.status(400).json({ error: `Máximo ${MAX_IMAGENES} imágenes por festividad` });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Se requiere una imagen' });
    }

    const imagenPath = await procesarBannerFile(req.file, 'festividad');

    const result = await prisma.$queryRaw`
      INSERT INTO tbl_festividades_imagenes (id_festividad, imagen_path, orden, date_time_registration)
      VALUES (${parseInt(id)}, ${imagenPath}, ${total}, NOW())
      RETURNING id, id_festividad as "idFestividad", imagen_path as "imagenPath", orden
    `;

    await registrarAuditoria(
      req.user.id,
      'FESTIVIDAD_IMAGEN_AGREGADA',
      'FESTIVIDADES',
      parseInt(id),
      { imagenId: result[0].id }
    );

    res.status(201).json({
      mensaje: 'Imagen agregada exitosamente',
      imagen: result[0]
    });
  } catch (error) {
    console.error('Error agregando imagen a festividad:', error);
    res.status(500).json({ error: 'Error al agregar imagen' });
  }
};

/**
 * Eliminar imagen de festividad
 * DELETE /api/landing/festividades/imagenes/:imgId
 */
const eliminar = async (req, res) => {
  try {
    const { imgId } = req.params;

    const imagen = await prisma.$queryRaw`
      SELECT id, id_festividad as "idFestividad", imagen_path as "imagenPath"
      FROM tbl_festividades_imagenes
      WHERE id = ${parseInt(imgId)}
    `;

    if (!imagen || imagen.length === 0) {
      return res.status(404).json({ error: 'Imagen no encontrada' });
    }

    await eliminarArchivoBanner(imagen[0].imagenPath);
    await prisma.$executeRaw`DELETE FROM tbl_festividades_imagenes WHERE id = ${parseInt(imgId)}`;

    await registrarAuditoria(
      req.user.id,
      'FESTIVIDAD_IMAGEN_ELIMINADA',
      'FESTIVIDADES',
      imagen[0].idFestividad,
      { imagenId: parseInt(imgId) }
    );

    res.json({ mensaje: 'Imagen eliminada exitosamente' });
  } catch (error) {
    console.error('Error eliminando imagen de festividad:', error);
    res.status(500).json({ error: 'Error al eliminar imagen' });
  }
};

/**
 * Reordenar imágenes de una festividad
 * PUT /api/landing/festividades/:id/imagenes/orden
 * Body: { orden: [{ id: 1, orden: 0 }, { id: 2, orden: 1 }, ...] }
 */
const reordenar = async (req, res) => {
  try {
    const { id } = req.params;
    const { orden } = req.body;

    if (!Array.isArray(orden)) {
      return res.status(400).json({ error: 'Se requiere un array de orden' });
    }

    for (const item of orden) {
      await prisma.$executeRaw`
        UPDATE tbl_festividades_imagenes
        SET orden = ${parseInt(item.orden)}
        WHERE id = ${parseInt(item.id)} AND id_festividad = ${parseInt(id)}
      `;
    }

    await registrarAuditoria(
      req.user.id,
      'FESTIVIDAD_IMAGENES_REORDENADAS',
      'FESTIVIDADES',
      parseInt(id),
      { orden }
    );

    res.json({ mensaje: 'Orden actualizado exitosamente' });
  } catch (error) {
    console.error('Error reordenando imágenes:', error);
    res.status(500).json({ error: 'Error al reordenar imágenes' });
  }
};

module.exports = {
  listar,
  agregar,
  eliminar,
  reordenar
};
