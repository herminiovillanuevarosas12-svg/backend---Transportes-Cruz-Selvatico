/**
 * Preguntas Frecuentes Controller
 * Controlador para gestion de FAQs
 */

const prisma = require('../config/prisma');
const { registrarAuditoria } = require('../services/auditoriaService');

/**
 * Obtener preguntas frecuentes publicas
 * GET /api/public/preguntas-frecuentes
 */
const getPreguntasPublicas = async (req, res) => {
  try {
    const preguntas = await prisma.$queryRaw`
      SELECT
        id,
        pregunta,
        respuesta,
        categoria,
        orden
      FROM tbl_preguntas_frecuentes
      WHERE activo = true
      ORDER BY orden ASC, id ASC
    `;

    res.json({ preguntas });
  } catch (error) {
    console.error('Error obteniendo preguntas frecuentes publicas:', error);
    if (error.code === '42P01' || error.code === '42703') {
      return res.json({ preguntas: [] });
    }
    res.status(500).json({ error: 'Error al obtener preguntas frecuentes' });
  }
};

/**
 * Listar todas las preguntas frecuentes (admin)
 * GET /api/preguntas-frecuentes
 */
const listar = async (req, res) => {
  try {
    const preguntas = await prisma.$queryRaw`
      SELECT
        id,
        pregunta,
        respuesta,
        categoria,
        orden,
        activo,
        date_time_registration as "createdAt",
        date_time_modification as "updatedAt"
      FROM tbl_preguntas_frecuentes
      ORDER BY orden ASC, id ASC
    `;

    res.json({ preguntas });
  } catch (error) {
    console.error('Error listando preguntas frecuentes:', error);
    if (error.code === '42P01' || error.code === '42703') {
      return res.json({ preguntas: [] });
    }
    res.status(500).json({ error: 'Error al listar preguntas frecuentes' });
  }
};

/**
 * Crear pregunta frecuente (admin)
 * POST /api/preguntas-frecuentes
 */
const crear = async (req, res) => {
  try {
    const { pregunta, respuesta, categoria, orden } = req.body;

    await prisma.$executeRaw`
      INSERT INTO tbl_preguntas_frecuentes (
        pregunta,
        respuesta,
        categoria,
        orden,
        activo,
        date_time_registration
      ) VALUES (
        ${pregunta},
        ${respuesta},
        ${categoria || null},
        ${parseInt(orden) || 0},
        true,
        NOW()
      )
    `;

    const insertada = await prisma.$queryRaw`
      SELECT
        id,
        pregunta,
        respuesta,
        categoria,
        orden,
        activo,
        date_time_registration as "createdAt",
        date_time_modification as "updatedAt"
      FROM tbl_preguntas_frecuentes
      ORDER BY id DESC
      LIMIT 1
    `;

    await registrarAuditoria(
      req.user.id,
      'FAQ_CREADA',
      'PREGUNTAS_FRECUENTES',
      insertada[0].id,
      insertada[0]
    );

    res.status(201).json({
      mensaje: 'Pregunta frecuente creada exitosamente',
      pregunta: insertada[0]
    });
  } catch (error) {
    console.error('Error creando pregunta frecuente:', error);
    res.status(500).json({ error: 'Error al crear pregunta frecuente' });
  }
};

/**
 * Actualizar pregunta frecuente (admin)
 * PUT /api/preguntas-frecuentes/:id
 */
const actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const { pregunta, respuesta, categoria, orden } = req.body;

    const result = await prisma.$queryRaw`
      UPDATE tbl_preguntas_frecuentes SET
        pregunta = ${pregunta},
        respuesta = ${respuesta},
        categoria = ${categoria || null},
        orden = ${parseInt(orden) || 0},
        date_time_modification = NOW()
      WHERE id = ${parseInt(id)}
      RETURNING
        id,
        pregunta,
        respuesta,
        categoria,
        orden,
        activo,
        date_time_registration as "createdAt",
        date_time_modification as "updatedAt"
    `;

    if (!result || result.length === 0) {
      return res.status(404).json({ error: 'Pregunta frecuente no encontrada' });
    }

    await registrarAuditoria(
      req.user.id,
      'FAQ_ACTUALIZADA',
      'PREGUNTAS_FRECUENTES',
      parseInt(id),
      result[0]
    );

    res.json({
      mensaje: 'Pregunta frecuente actualizada exitosamente',
      pregunta: result[0]
    });
  } catch (error) {
    console.error('Error actualizando pregunta frecuente:', error);
    res.status(500).json({ error: 'Error al actualizar pregunta frecuente' });
  }
};

/**
 * Eliminar pregunta frecuente (admin)
 * DELETE /api/preguntas-frecuentes/:id
 */
const eliminar = async (req, res) => {
  try {
    const { id } = req.params;

    const faq = await prisma.$queryRaw`
      SELECT id FROM tbl_preguntas_frecuentes WHERE id = ${parseInt(id)}
    `;

    if (!faq || faq.length === 0) {
      return res.status(404).json({ error: 'Pregunta frecuente no encontrada' });
    }

    await prisma.$executeRaw`
      DELETE FROM tbl_preguntas_frecuentes WHERE id = ${parseInt(id)}
    `;

    await registrarAuditoria(
      req.user.id,
      'FAQ_ELIMINADA',
      'PREGUNTAS_FRECUENTES',
      parseInt(id),
      { id: parseInt(id) }
    );

    res.json({ mensaje: 'Pregunta frecuente eliminada exitosamente' });
  } catch (error) {
    console.error('Error eliminando pregunta frecuente:', error);
    res.status(500).json({ error: 'Error al eliminar pregunta frecuente' });
  }
};

/**
 * Toggle activo/inactivo de pregunta frecuente (admin)
 * PATCH /api/preguntas-frecuentes/:id/toggle
 */
const toggleActivo = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await prisma.$queryRaw`
      UPDATE tbl_preguntas_frecuentes
      SET activo = NOT activo, date_time_modification = NOW()
      WHERE id = ${parseInt(id)}
      RETURNING id, activo
    `;

    if (!result || result.length === 0) {
      return res.status(404).json({ error: 'Pregunta frecuente no encontrada' });
    }

    await registrarAuditoria(
      req.user.id,
      'FAQ_TOGGLE',
      'PREGUNTAS_FRECUENTES',
      parseInt(id),
      { activo: result[0].activo }
    );

    res.json({
      mensaje: `Pregunta ${result[0].activo ? 'activada' : 'desactivada'} exitosamente`,
      activo: result[0].activo
    });
  } catch (error) {
    console.error('Error toggling pregunta frecuente:', error);
    res.status(500).json({ error: 'Error al cambiar estado de la pregunta' });
  }
};

/**
 * Reordenar preguntas frecuentes (admin)
 * PUT /api/preguntas-frecuentes/reordenar
 */
const reordenar = async (req, res) => {
  try {
    const { ordenes } = req.body;

    if (!Array.isArray(ordenes)) {
      return res.status(400).json({ error: 'Se requiere un array de ordenes' });
    }

    for (const item of ordenes) {
      await prisma.$executeRaw`
        UPDATE tbl_preguntas_frecuentes
        SET orden = ${item.orden}, date_time_modification = NOW()
        WHERE id = ${item.id}
      `;
    }

    await registrarAuditoria(
      req.user.id,
      'FAQS_REORDENADAS',
      'PREGUNTAS_FRECUENTES',
      null,
      { ordenes }
    );

    res.json({ mensaje: 'Preguntas frecuentes reordenadas exitosamente' });
  } catch (error) {
    console.error('Error reordenando preguntas frecuentes:', error);
    res.status(500).json({ error: 'Error al reordenar preguntas frecuentes' });
  }
};

module.exports = {
  getPreguntasPublicas,
  listar,
  crear,
  actualizar,
  eliminar,
  toggleActivo,
  reordenar
};
