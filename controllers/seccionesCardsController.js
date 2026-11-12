/**
 * Secciones de cards de /encomiendas-info (ej. "¿Por qué elegirnos?")
 * - tbl_encomiendas_secciones_cards: secciones (titulo, orden, activo)
 * - tbl_encomiendas_ventajas: cards de cada seccion (id_seccion)
 * Las rutas admin solo las usa el SUPER_ADMIN desde el modo edicion de la pagina publica.
 */

const { Prisma } = require('@prisma/client');
const prisma = require('../config/prisma');
const { registrarAuditoria } = require('../services/auditoriaService');
const { procesarBannerFile, eliminarArchivoBanner } = require('../middleware/bannerUpload');
const {
  validarTitulo,
  validarIdsOrden,
  construirCambiosCard,
  agruparSecciones,
  esErrorEsquemaPendiente
} = require('../utils/seccionesCards');

const ENTIDAD_SECCION = 'ENCOMIENDAS_SECCIONES_CARDS';
const ENTIDAD_CARD = 'ENCOMIENDAS_VENTAJAS';
const CARPETA_IMAGENES = 'encomienda';

const CAMPOS_SECCION = Prisma.sql`id, titulo, orden, activo`;
const CAMPOS_CARD = Prisma.sql`
  id, id_seccion as "idSeccion", titulo, descripcion,
  imagen_path as "imagenPath", icono, orden, activo
`;

const parseId = (valor) => {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
};

/**
 * Borra imagenes en storage sin hacer fallar la operacion:
 * la fila ya no las referencia, un fallo aqui solo deja un huerfano registrado en el log.
 */
const borrarImagenes = async (paths) => {
  for (const path of paths.filter(Boolean)) {
    try {
      await eliminarArchivoBanner(path);
    } catch (error) {
      console.error(`No se pudo eliminar la imagen ${path}:`, error);
    }
  }
};

/** El orden recibido debe contener exactamente los ids existentes */
const mismoConjunto = (ids, existentes) =>
  ids.length === existentes.length && existentes.every((id) => ids.includes(id));

const responderErrorListado = (res, error, mensaje) => {
  if (esErrorEsquemaPendiente(error)) {
    return res.json({ secciones: [] });
  }
  console.error(mensaje, error);
  return res.status(500).json({ error: 'Error al obtener las secciones de encomiendas' });
};

// =============================================
// PUBLICO
// =============================================

/**
 * Secciones visibles con sus cards visibles (sin secciones vacias)
 * GET /api/public/encomiendas-secciones-cards
 */
const listarPublicas = async (req, res) => {
  try {
    const secciones = await prisma.$queryRaw`
      SELECT id, titulo, orden
      FROM tbl_encomiendas_secciones_cards
      WHERE activo = true
      ORDER BY orden ASC, id ASC
    `;
    const cards = await prisma.$queryRaw`
      SELECT id, id_seccion as "idSeccion", titulo, descripcion,
        imagen_path as "imagenPath", icono, orden
      FROM tbl_encomiendas_ventajas
      WHERE activo = true
      ORDER BY orden ASC, id ASC
    `;

    res.json({ secciones: agruparSecciones(secciones, cards, { omitirVacias: true }) });
  } catch (error) {
    responderErrorListado(res, error, 'Error obteniendo secciones de cards publicas:');
  }
};

// =============================================
// ADMIN - SECCIONES
// =============================================

/**
 * Todas las secciones con todas sus cards (incluye ocultas y vacias)
 * GET /api/contenido/encomiendas-secciones-cards
 */
const listarAdmin = async (req, res) => {
  try {
    const secciones = await prisma.$queryRaw`
      SELECT ${CAMPOS_SECCION}
      FROM tbl_encomiendas_secciones_cards
      ORDER BY orden ASC, id ASC
    `;
    const cards = await prisma.$queryRaw`
      SELECT ${CAMPOS_CARD}
      FROM tbl_encomiendas_ventajas
      ORDER BY orden ASC, id ASC
    `;

    res.json({ secciones: agruparSecciones(secciones, cards) });
  } catch (error) {
    responderErrorListado(res, error, 'Error listando secciones de cards:');
  }
};

/**
 * Crear seccion al final
 * POST /api/contenido/encomiendas-secciones-cards  { titulo }
 */
const crearSeccion = async (req, res) => {
  try {
    const { titulo, error } = validarTitulo(req.body?.titulo);
    if (error) return res.status(400).json({ error });

    const [seccion] = await prisma.$queryRaw`
      INSERT INTO tbl_encomiendas_secciones_cards (titulo, orden, activo, user_id_registration)
      VALUES (
        ${titulo},
        (SELECT COALESCE(MAX(orden) + 1, 0) FROM tbl_encomiendas_secciones_cards),
        true,
        ${req.user.id}
      )
      RETURNING ${CAMPOS_SECCION}
    `;

    await registrarAuditoria(req.user.id, 'ENCOMIENDA_SECCION_CARDS_CREADA', ENTIDAD_SECCION, seccion.id, seccion);

    res.status(201).json({ mensaje: 'Sección creada', seccion: { ...seccion, cards: [] } });
  } catch (error) {
    console.error('Error creando seccion de cards:', error);
    res.status(500).json({ error: 'Error al crear la sección' });
  }
};

/**
 * Renombrar seccion
 * PUT /api/contenido/encomiendas-secciones-cards/:id  { titulo }
 */
const renombrarSeccion = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Sección inválida' });

    const { titulo, error } = validarTitulo(req.body?.titulo);
    if (error) return res.status(400).json({ error });

    const [seccion] = await prisma.$queryRaw`
      UPDATE tbl_encomiendas_secciones_cards SET
        titulo = ${titulo},
        date_time_modification = NOW(),
        user_id_modification = ${req.user.id}
      WHERE id = ${id}
      RETURNING ${CAMPOS_SECCION}
    `;
    if (!seccion) return res.status(404).json({ error: 'Sección no encontrada' });

    await registrarAuditoria(req.user.id, 'ENCOMIENDA_SECCION_CARDS_RENOMBRADA', ENTIDAD_SECCION, id, seccion);

    res.json({ mensaje: 'Sección actualizada', seccion });
  } catch (error) {
    console.error('Error renombrando seccion de cards:', error);
    res.status(500).json({ error: 'Error al actualizar la sección' });
  }
};

/**
 * Ocultar / mostrar seccion
 * PATCH /api/contenido/encomiendas-secciones-cards/:id/toggle
 */
const toggleSeccion = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Sección inválida' });

    const [seccion] = await prisma.$queryRaw`
      UPDATE tbl_encomiendas_secciones_cards SET
        activo = NOT activo,
        date_time_modification = NOW(),
        user_id_modification = ${req.user.id}
      WHERE id = ${id}
      RETURNING id, activo
    `;
    if (!seccion) return res.status(404).json({ error: 'Sección no encontrada' });

    await registrarAuditoria(req.user.id, 'ENCOMIENDA_SECCION_CARDS_TOGGLE', ENTIDAD_SECCION, id, seccion);

    res.json({ mensaje: seccion.activo ? 'Sección visible' : 'Sección oculta', activo: seccion.activo });
  } catch (error) {
    console.error('Error cambiando estado de seccion de cards:', error);
    res.status(500).json({ error: 'Error al cambiar el estado de la sección' });
  }
};

/**
 * Eliminar seccion con sus cards (CASCADE) y luego sus imagenes
 * DELETE /api/contenido/encomiendas-secciones-cards/:id
 */
const eliminarSeccion = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Sección inválida' });

    const cards = await prisma.$queryRaw`
      SELECT id, imagen_path as "imagenPath"
      FROM tbl_encomiendas_ventajas
      WHERE id_seccion = ${id}
    `;

    const [seccion] = await prisma.$queryRaw`
      DELETE FROM tbl_encomiendas_secciones_cards
      WHERE id = ${id}
      RETURNING id, titulo
    `;
    if (!seccion) return res.status(404).json({ error: 'Sección no encontrada' });

    await borrarImagenes(cards.map((card) => card.imagenPath));

    await registrarAuditoria(req.user.id, 'ENCOMIENDA_SECCION_CARDS_ELIMINADA', ENTIDAD_SECCION, id, {
      ...seccion,
      cardsEliminadas: cards.map((card) => card.id)
    });

    res.json({ mensaje: 'Sección eliminada' });
  } catch (error) {
    console.error('Error eliminando seccion de cards:', error);
    res.status(500).json({ error: 'Error al eliminar la sección' });
  }
};

/**
 * Reordenar secciones
 * PUT /api/contenido/encomiendas-secciones-cards/orden  { ids: [3, 1, 2] }
 */
const reordenarSecciones = async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!validarIdsOrden(ids)) return res.status(400).json({ error: 'Orden inválido' });

    const existentes = await prisma.$queryRaw`SELECT id FROM tbl_encomiendas_secciones_cards`;
    if (!mismoConjunto(ids, existentes.map((s) => s.id))) {
      return res.status(400).json({ error: 'El orden debe incluir todas las secciones' });
    }

    await prisma.$transaction(
      ids.map((id, orden) => prisma.$executeRaw`
        UPDATE tbl_encomiendas_secciones_cards SET orden = ${orden} WHERE id = ${id}
      `)
    );

    await registrarAuditoria(req.user.id, 'ENCOMIENDA_SECCION_CARDS_REORDENADAS', ENTIDAD_SECCION, null, { ids });

    res.json({ mensaje: 'Orden de secciones actualizado' });
  } catch (error) {
    console.error('Error reordenando secciones de cards:', error);
    res.status(500).json({ error: 'Error al reordenar las secciones' });
  }
};

// =============================================
// ADMIN - CARDS
// =============================================

/**
 * Crear card al final de su seccion
 * POST /api/contenido/encomiendas-ventajas  multipart { idSeccion, titulo, descripcion?, icono?, imagen? }
 */
const crearCard = async (req, res) => {
  try {
    const idSeccion = parseId(req.body?.idSeccion);
    if (!idSeccion) return res.status(400).json({ error: 'Sección inválida' });

    const { titulo, error } = validarTitulo(req.body?.titulo);
    if (error) return res.status(400).json({ error });

    const { cambios } = construirCambiosCard({ descripcion: req.body.descripcion, icono: req.body.icono });

    const [seccion] = await prisma.$queryRaw`
      SELECT id FROM tbl_encomiendas_secciones_cards WHERE id = ${idSeccion}
    `;
    if (!seccion) return res.status(404).json({ error: 'Sección no encontrada' });

    const imagenPath = req.file ? await procesarBannerFile(req.file, CARPETA_IMAGENES) : null;

    let card;
    try {
      [card] = await prisma.$queryRaw`
        INSERT INTO tbl_encomiendas_ventajas (
          id_seccion, titulo, descripcion, imagen_path, icono, orden, activo, user_id_registration
        ) VALUES (
          ${idSeccion},
          ${titulo},
          ${cambios.descripcion ?? null},
          ${imagenPath},
          ${cambios.icono ?? null},
          (SELECT COALESCE(MAX(orden) + 1, 0) FROM tbl_encomiendas_ventajas WHERE id_seccion = ${idSeccion}),
          true,
          ${req.user.id}
        )
        RETURNING ${CAMPOS_CARD}
      `;
    } catch (errorInsert) {
      await borrarImagenes([imagenPath]);
      throw errorInsert;
    }

    await registrarAuditoria(req.user.id, 'ENCOMIENDA_VENTAJA_CREADA', ENTIDAD_CARD, card.id, card);

    res.status(201).json({ mensaje: 'Card creada', card });
  } catch (error) {
    console.error('Error creando card de encomiendas:', error);
    res.status(500).json({ error: 'Error al crear la card' });
  }
};

/**
 * Actualizacion parcial: solo los campos enviados (edicion inline)
 * PUT /api/contenido/encomiendas-ventajas/:id  multipart { titulo?, descripcion?, icono?, quitarImagen?, imagen? }
 */
const actualizarCard = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Card inválida' });

    const { cambios, quitarImagen, error } = construirCambiosCard(req.body);
    if (error) return res.status(400).json({ error });

    const [actual] = await prisma.$queryRaw`
      SELECT imagen_path as "imagenPath" FROM tbl_encomiendas_ventajas WHERE id = ${id}
    `;
    if (!actual) return res.status(404).json({ error: 'Card no encontrada' });

    const columnas = Object.entries(cambios).map(([campo, valor]) =>
      Prisma.sql`${Prisma.raw(campo)} = ${valor}`
    );
    // La nueva imagen se sube antes de tocar la fila; la anterior se borra al final
    const nuevaImagen = req.file ? await procesarBannerFile(req.file, CARPETA_IMAGENES) : null;
    if (nuevaImagen) {
      columnas.push(Prisma.sql`imagen_path = ${nuevaImagen}`);
    } else if (quitarImagen) {
      columnas.push(Prisma.sql`imagen_path = NULL`);
    }

    if (columnas.length === 0) {
      return res.status(400).json({ error: 'No hay cambios para guardar' });
    }

    let card;
    try {
      [card] = await prisma.$queryRaw`
        UPDATE tbl_encomiendas_ventajas SET
          ${Prisma.join(columnas)},
          date_time_modification = NOW(),
          user_id_modification = ${req.user.id}
        WHERE id = ${id}
        RETURNING ${CAMPOS_CARD}
      `;
    } catch (errorUpdate) {
      await borrarImagenes([nuevaImagen]);
      throw errorUpdate;
    }

    if (!card) {
      await borrarImagenes([nuevaImagen]);
      return res.status(404).json({ error: 'Card no encontrada' });
    }

    if (nuevaImagen || quitarImagen) {
      await borrarImagenes([actual.imagenPath]);
    }

    await registrarAuditoria(req.user.id, 'ENCOMIENDA_VENTAJA_ACTUALIZADA', ENTIDAD_CARD, id, card);

    res.json({ mensaje: 'Card actualizada', card });
  } catch (error) {
    console.error('Error actualizando card de encomiendas:', error);
    res.status(500).json({ error: 'Error al actualizar la card' });
  }
};

/**
 * Ocultar / mostrar card
 * PATCH /api/contenido/encomiendas-ventajas/:id/toggle
 */
const toggleCard = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Card inválida' });

    const [card] = await prisma.$queryRaw`
      UPDATE tbl_encomiendas_ventajas SET
        activo = NOT activo,
        date_time_modification = NOW(),
        user_id_modification = ${req.user.id}
      WHERE id = ${id}
      RETURNING id, activo
    `;
    if (!card) return res.status(404).json({ error: 'Card no encontrada' });

    await registrarAuditoria(req.user.id, 'ENCOMIENDA_VENTAJA_TOGGLE', ENTIDAD_CARD, id, card);

    res.json({ mensaje: card.activo ? 'Card visible' : 'Card oculta', activo: card.activo });
  } catch (error) {
    console.error('Error cambiando estado de card de encomiendas:', error);
    res.status(500).json({ error: 'Error al cambiar el estado de la card' });
  }
};

/**
 * Eliminar card y luego su imagen
 * DELETE /api/contenido/encomiendas-ventajas/:id
 */
const eliminarCard = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Card inválida' });

    const [card] = await prisma.$queryRaw`
      DELETE FROM tbl_encomiendas_ventajas
      WHERE id = ${id}
      RETURNING id, id_seccion as "idSeccion", titulo, imagen_path as "imagenPath"
    `;
    if (!card) return res.status(404).json({ error: 'Card no encontrada' });

    await borrarImagenes([card.imagenPath]);

    await registrarAuditoria(req.user.id, 'ENCOMIENDA_VENTAJA_ELIMINADA', ENTIDAD_CARD, id, card);

    res.json({ mensaje: 'Card eliminada' });
  } catch (error) {
    console.error('Error eliminando card de encomiendas:', error);
    res.status(500).json({ error: 'Error al eliminar la card' });
  }
};

/**
 * Reordenar las cards de una seccion
 * PUT /api/contenido/encomiendas-ventajas/orden  { idSeccion, ids: [7, 5, 6] }
 */
const reordenarCards = async (req, res) => {
  try {
    const idSeccion = parseId(req.body?.idSeccion);
    const { ids } = req.body || {};
    if (!idSeccion || !validarIdsOrden(ids)) return res.status(400).json({ error: 'Orden inválido' });

    const existentes = await prisma.$queryRaw`
      SELECT id FROM tbl_encomiendas_ventajas WHERE id_seccion = ${idSeccion}
    `;
    if (!mismoConjunto(ids, existentes.map((c) => c.id))) {
      return res.status(400).json({ error: 'El orden debe incluir todas las cards de la sección' });
    }

    await prisma.$transaction(
      ids.map((id, orden) => prisma.$executeRaw`
        UPDATE tbl_encomiendas_ventajas SET orden = ${orden} WHERE id = ${id}
      `)
    );

    await registrarAuditoria(req.user.id, 'ENCOMIENDA_VENTAJA_REORDENADAS', ENTIDAD_CARD, null, { idSeccion, ids });

    res.json({ mensaje: 'Orden de cards actualizado' });
  } catch (error) {
    console.error('Error reordenando cards de encomiendas:', error);
    res.status(500).json({ error: 'Error al reordenar las cards' });
  }
};

module.exports = {
  // Publico
  listarPublicas,
  // Admin secciones
  listarAdmin,
  crearSeccion,
  renombrarSeccion,
  toggleSeccion,
  eliminarSeccion,
  reordenarSecciones,
  // Admin cards
  crearCard,
  actualizarCard,
  toggleCard,
  eliminarCard,
  reordenarCards
};
