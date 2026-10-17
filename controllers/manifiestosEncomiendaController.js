/**
 * Manifiestos de Encomiendas Controller
 * Generar, listar y consultar manifiestos (documento interno, no se envía a SUNAT)
 */

const { registrarAuditoria } = require('../services/auditoriaService');
const {
  ManifiestoError,
  normalizarIdsEncomiendas,
  crearManifiesto,
  obtenerManifiesto,
  listarManifiestos
} = require('../services/manifiestoEncomiendaService');

/**
 * Generar manifiesto con encomiendas En ruta
 * POST /api/encomiendas/manifiestos
 * Body: { idsEncomiendas: number[] }
 */
const generar = async (req, res) => {
  try {
    const { ids, error } = normalizarIdsEncomiendas(req.body.idsEncomiendas);
    if (error) {
      return res.status(400).json({ error });
    }

    const idManifiesto = await crearManifiesto({
      ids,
      idUsuario: req.user.id,
      idPuntoUsuario: req.user.id_punto || null
    });

    const manifiesto = await obtenerManifiesto(idManifiesto);

    await registrarAuditoria(req.user.id, 'MANIFIESTO_ENCOMIENDAS_GENERADO', 'MANIFIESTO_ENCOMIENDA', idManifiesto, {
      numero: manifiesto.numeroCompleto,
      cantidad: manifiesto.resumen.cantidad,
      encomiendas: manifiesto.encomiendas.map((e) => e.codigoTracking)
    });

    res.status(201).json({
      mensaje: `Manifiesto ${manifiesto.numeroCompleto} generado con ${manifiesto.resumen.cantidad} encomienda(s)`,
      manifiesto
    });
  } catch (error) {
    if (error instanceof ManifiestoError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Error generando manifiesto:', error);
    res.status(500).json({ error: 'Error al generar el manifiesto' });
  }
};

/**
 * Listar manifiestos generados
 * GET /api/encomiendas/manifiestos
 * Query params: page, limit
 */
const listar = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);

    res.json(await listarManifiestos({ page, limit }));
  } catch (error) {
    console.error('Error listando manifiestos:', error);
    res.status(500).json({ error: 'Error al listar manifiestos' });
  }
};

/**
 * Obtener manifiesto con sus encomiendas (datos para el PDF)
 * GET /api/encomiendas/manifiestos/:id
 */
const obtener = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID de manifiesto no válido' });
    }

    const manifiesto = await obtenerManifiesto(id);
    if (!manifiesto) {
      return res.status(404).json({ error: 'Manifiesto no encontrado' });
    }

    res.json({ manifiesto });
  } catch (error) {
    console.error('Error obteniendo manifiesto:', error);
    res.status(500).json({ error: 'Error al obtener el manifiesto' });
  }
};

module.exports = {
  generar,
  listar,
  obtener
};
