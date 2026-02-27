/**
 * Contacto Controller
 * Gestion de mensajes de contacto publicos y administracion
 */

const prisma = require('../config/prisma');
const { registrarAuditoria } = require('../services/auditoriaService');

/**
 * Enviar mensaje de contacto (publico)
 * POST /api/public/contacto
 */
const enviarMensaje = async (req, res) => {
  try {
    const {
      tipo_remitente,
      nombre,
      email,
      telefono,
      empresa,
      ruc,
      asunto,
      mensaje
    } = req.body;

    if (!nombre || nombre.trim() === '') {
      return res.status(400).json({ error: 'El nombre es requerido' });
    }

    if (!asunto || asunto.trim() === '') {
      return res.status(400).json({ error: 'El asunto es requerido' });
    }

    if (!mensaje || mensaje.trim() === '') {
      return res.status(400).json({ error: 'El mensaje es requerido' });
    }

    const tiposValidos = ['pasajero', 'empresa'];
    if (!tipo_remitente || !tiposValidos.includes(tipo_remitente)) {
      return res.status(400).json({ error: 'El tipo de remitente debe ser "pasajero" o "empresa"' });
    }

    const result = await prisma.$queryRaw`
      INSERT INTO tbl_contacto_mensajes (
        tipo_remitente,
        nombre,
        email,
        telefono,
        empresa,
        ruc,
        asunto,
        mensaje,
        leido,
        respondido,
        date_time_registration
      ) VALUES (
        ${tipo_remitente},
        ${nombre.trim()},
        ${email || null},
        ${telefono || null},
        ${empresa || null},
        ${ruc || null},
        ${asunto.trim()},
        ${mensaje.trim()},
        false,
        false,
        NOW()
      )
      RETURNING id
    `;

    res.status(201).json({
      mensaje: 'Mensaje enviado correctamente',
      id: result[0].id
    });
  } catch (error) {
    console.error('Error enviando mensaje de contacto:', error);
    res.status(500).json({ error: 'Error al enviar mensaje' });
  }
};

/**
 * Listar mensajes de contacto con paginacion (admin)
 * GET /api/contacto/mensajes?page=1&limit=20&leido=true|false
 */
const listarMensajes = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const { leido } = req.query;

    let mensajes;
    let totalResult;

    if (leido !== undefined) {
      const leidoBool = leido === 'true';

      totalResult = await prisma.$queryRaw`
        SELECT COUNT(*)::int as total
        FROM tbl_contacto_mensajes
        WHERE leido = ${leidoBool}
      `;

      mensajes = await prisma.$queryRaw`
        SELECT
          id,
          tipo_remitente as "tipoRemitente",
          nombre,
          email,
          telefono,
          empresa,
          asunto,
          mensaje,
          leido,
          respondido,
          date_time_registration as "fechaRegistro"
        FROM tbl_contacto_mensajes
        WHERE leido = ${leidoBool}
        ORDER BY date_time_registration DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else {
      totalResult = await prisma.$queryRaw`
        SELECT COUNT(*)::int as total
        FROM tbl_contacto_mensajes
      `;

      mensajes = await prisma.$queryRaw`
        SELECT
          id,
          tipo_remitente as "tipoRemitente",
          nombre,
          email,
          telefono,
          empresa,
          asunto,
          mensaje,
          leido,
          respondido,
          date_time_registration as "fechaRegistro"
        FROM tbl_contacto_mensajes
        ORDER BY date_time_registration DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    }

    const total = totalResult[0].total;
    const totalPages = Math.ceil(total / limit);

    res.json({
      mensajes,
      total,
      page,
      totalPages
    });
  } catch (error) {
    console.error('Error listando mensajes de contacto:', error);
    if (error.code === '42P01') {
      return res.json({ mensajes: [], total: 0, page: 1, totalPages: 0 });
    }
    res.status(500).json({ error: 'Error al listar mensajes' });
  }
};

/**
 * Obtener mensaje por ID y marcar como leido (admin)
 * GET /api/contacto/mensajes/:id
 */
const getMensaje = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await prisma.$queryRaw`
      SELECT
        id,
        tipo_remitente as "tipoRemitente",
        nombre,
        email,
        telefono,
        empresa,
        ruc,
        asunto,
        mensaje,
        leido,
        respondido,
        notas_internas as "notasInternas",
        date_time_registration as "fechaRegistro"
      FROM tbl_contacto_mensajes
      WHERE id = ${parseInt(id)}
    `;

    if (!result || result.length === 0) {
      return res.status(404).json({ error: 'Mensaje no encontrado' });
    }

    if (result[0].leido === false) {
      await prisma.$executeRaw`
        UPDATE tbl_contacto_mensajes
        SET leido = true
        WHERE id = ${parseInt(id)}
      `;
      result[0].leido = true;
    }

    res.json({ mensaje: result[0] });
  } catch (error) {
    console.error('Error obteniendo mensaje de contacto:', error);
    res.status(500).json({ error: 'Error al obtener mensaje' });
  }
};

/**
 * Actualizar mensaje (notas internas, respondido) (admin)
 * PUT /api/contacto/mensajes/:id
 */
const actualizarMensaje = async (req, res) => {
  try {
    const { id } = req.params;
    const { notasInternas, respondido } = req.body;

    const actual = await prisma.$queryRaw`
      SELECT id FROM tbl_contacto_mensajes WHERE id = ${parseInt(id)}
    `;

    if (!actual || actual.length === 0) {
      return res.status(404).json({ error: 'Mensaje no encontrado' });
    }

    const result = await prisma.$queryRaw`
      UPDATE tbl_contacto_mensajes SET
        notas_internas = ${notasInternas || null},
        respondido = ${respondido === true},
        date_time_modification = NOW()
      WHERE id = ${parseInt(id)}
      RETURNING
        id,
        tipo_remitente as "tipoRemitente",
        nombre,
        asunto,
        leido,
        respondido,
        notas_internas as "notasInternas"
    `;

    await registrarAuditoria(
      req.user.id,
      'CONTACTO_MENSAJE_ACTUALIZADO',
      'CONTACTO_MENSAJES',
      parseInt(id),
      result[0]
    );

    res.json({
      mensaje: 'Mensaje actualizado exitosamente',
      datos: result[0]
    });
  } catch (error) {
    console.error('Error actualizando mensaje de contacto:', error);
    res.status(500).json({ error: 'Error al actualizar mensaje' });
  }
};

module.exports = {
  enviarMensaje,
  listarMensajes,
  getMensaje,
  actualizarMensaje
};
