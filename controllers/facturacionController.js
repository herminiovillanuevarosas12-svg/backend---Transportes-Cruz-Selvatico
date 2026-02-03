/**
 * Facturación Controller
 * Controlador para facturación electrónica (Comprobantes y Guías de Remisión)
 */

const facturacionService = require('../services/facturacionService');
const guiaRemisionService = require('../services/guiaRemisionService');
const { registrarAuditoria } = require('../services/auditoriaService');

// =============================================================================
// MÉTRICAS Y DASHBOARD
// =============================================================================

/**
 * Obtener métricas de facturación
 * GET /api/facturacion/metricas
 */
const obtenerMetricas = async (req, res) => {
  try {
    const metricas = await facturacionService.obtenerMetricas();
    res.json(metricas);
  } catch (error) {
    console.error('Error obteniendo métricas:', error);
    res.status(500).json({ error: 'Error al obtener métricas' });
  }
};

// =============================================================================
// COMPROBANTES (FACTURAS Y BOLETAS)
// =============================================================================

/**
 * Listar comprobantes
 * GET /api/facturacion/comprobantes
 */
const listarComprobantes = async (req, res) => {
  try {
    const {
      tipoComprobante,
      fechaDesde,
      fechaHasta,
      estado,
      clienteNumDoc,
      page = 1,
      limit = 20
    } = req.query;

    const resultado = await facturacionService.listarComprobantes({
      tipoComprobante,
      fechaDesde,
      fechaHasta,
      estado,
      clienteNumDoc,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.json(resultado);
  } catch (error) {
    console.error('Error listando comprobantes:', error);
    res.status(500).json({ error: 'Error al listar comprobantes' });
  }
};

/**
 * Obtener comprobante por ID
 * GET /api/facturacion/comprobantes/:id
 */
const obtenerComprobante = async (req, res) => {
  try {
    const { id } = req.params;

    const comprobante = await facturacionService.obtenerComprobante(parseInt(id));

    if (!comprobante) {
      return res.status(404).json({ error: 'Comprobante no encontrado' });
    }

    res.json({ comprobante });
  } catch (error) {
    console.error('Error obteniendo comprobante:', error);
    res.status(500).json({ error: 'Error al obtener comprobante' });
  }
};

/**
 * Emitir comprobante manualmente
 * POST /api/facturacion/comprobantes
 */
const emitirComprobante = async (req, res) => {
  try {
    const {
      tipoComprobante,
      serie,
      cliente,
      items
    } = req.body;

    // Validaciones
    if (!tipoComprobante || !serie || !cliente || !items || items.length === 0) {
      return res.status(400).json({
        error: 'Se requieren: tipoComprobante, serie, cliente e items'
      });
    }

    if (!cliente.tipoDoc || !cliente.numDoc || !cliente.razonSocial) {
      return res.status(400).json({
        error: 'El cliente debe tener tipoDoc, numDoc y razonSocial'
      });
    }

    for (const item of items) {
      if (!item.descripcion || !item.cantidad || !item.precioUnitario) {
        return res.status(400).json({
          error: 'Cada item debe tener descripcion, cantidad y precioUnitario'
        });
      }
    }

    const comprobante = await facturacionService.emitirComprobante({
      tipoComprobante,
      serie,
      cliente,
      items,
      origenTipo: 'MANUAL',
      origenId: null,
      userId: req.user.id
    });

    // Auditoría
    await registrarAuditoria(req.user.id, 'COMPROBANTE_EMITIDO', 'COMPROBANTE', comprobante.id, {
      tipoComprobante,
      numeroCompleto: comprobante.numeroCompleto,
      cliente: cliente.razonSocial,
      total: comprobante.total
    });

    res.status(201).json({
      mensaje: 'Comprobante emitido exitosamente',
      comprobante
    });
  } catch (error) {
    console.error('Error emitiendo comprobante:', error);
    res.status(500).json({ error: error.message || 'Error al emitir comprobante' });
  }
};

/**
 * Emitir comprobante desde ticket
 * POST /api/facturacion/emitir/ticket/:ticketId
 */
const emitirDesdeTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { tipoComprobante, serie, cliente } = req.body;

    // Validaciones
    if (!tipoComprobante || !serie || !cliente) {
      return res.status(400).json({
        error: 'Se requieren: tipoComprobante, serie y cliente'
      });
    }

    if (!cliente.tipoDoc || !cliente.numDoc || !cliente.razonSocial) {
      return res.status(400).json({
        error: 'El cliente debe tener tipoDoc, numDoc y razonSocial'
      });
    }

    const comprobante = await facturacionService.emitirDesdeTicket(
      parseInt(ticketId),
      { tipoComprobante, serie, cliente, userId: req.user.id }
    );

    // Auditoría
    await registrarAuditoria(req.user.id, 'COMPROBANTE_EMITIDO_TICKET', 'COMPROBANTE', comprobante.id, {
      ticketId,
      tipoComprobante,
      numeroCompleto: comprobante.numeroCompleto,
      cliente: cliente.razonSocial
    });

    res.status(201).json({
      mensaje: 'Comprobante emitido exitosamente',
      comprobante
    });
  } catch (error) {
    console.error('Error emitiendo comprobante desde ticket:', error);
    res.status(500).json({ error: error.message || 'Error al emitir comprobante' });
  }
};

/**
 * Emitir comprobante desde encomienda
 * POST /api/facturacion/emitir/encomienda/:encomiendaId
 */
const emitirDesdeEncomienda = async (req, res) => {
  try {
    const { encomiendaId } = req.params;
    const { tipoComprobante, serie, cliente } = req.body;

    // Validaciones
    if (!tipoComprobante || !serie || !cliente) {
      return res.status(400).json({
        error: 'Se requieren: tipoComprobante, serie y cliente'
      });
    }

    if (!cliente.tipoDoc || !cliente.numDoc || !cliente.razonSocial) {
      return res.status(400).json({
        error: 'El cliente debe tener tipoDoc, numDoc y razonSocial'
      });
    }

    const comprobante = await facturacionService.emitirDesdeEncomienda(
      parseInt(encomiendaId),
      { tipoComprobante, serie, cliente, userId: req.user.id }
    );

    // Auditoría
    await registrarAuditoria(req.user.id, 'COMPROBANTE_EMITIDO_ENCOMIENDA', 'COMPROBANTE', comprobante.id, {
      encomiendaId,
      tipoComprobante,
      numeroCompleto: comprobante.numeroCompleto,
      cliente: cliente.razonSocial
    });

    res.status(201).json({
      mensaje: 'Comprobante emitido exitosamente',
      comprobante
    });
  } catch (error) {
    console.error('Error emitiendo comprobante desde encomienda:', error);
    res.status(500).json({ error: error.message || 'Error al emitir comprobante' });
  }
};

/**
 * Anular comprobante
 * POST /api/facturacion/comprobantes/:id/anular
 */
const anularComprobante = async (req, res) => {
  try {
    const { id } = req.params;
    const { motivo } = req.body;

    if (!motivo) {
      return res.status(400).json({ error: 'Se requiere motivo de anulación' });
    }

    const comprobante = await facturacionService.anularComprobante(
      parseInt(id),
      motivo,
      req.user.id
    );

    // Auditoría
    await registrarAuditoria(req.user.id, 'COMPROBANTE_ANULADO', 'COMPROBANTE', id, {
      motivo
    });

    res.json({
      mensaje: 'Comprobante anulado exitosamente',
      comprobante
    });
  } catch (error) {
    console.error('Error anulando comprobante:', error);
    res.status(500).json({ error: error.message || 'Error al anular comprobante' });
  }
};

// =============================================================================
// GUÍAS DE REMISIÓN
// =============================================================================

/**
 * Listar guías de remisión
 * GET /api/facturacion/guias
 */
const listarGuias = async (req, res) => {
  try {
    const {
      fechaDesde,
      fechaHasta,
      estado,
      destinatarioNumDoc,
      page = 1,
      limit = 20
    } = req.query;

    const resultado = await guiaRemisionService.listarGuias({
      fechaDesde,
      fechaHasta,
      estado,
      destinatarioNumDoc,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.json(resultado);
  } catch (error) {
    console.error('Error listando guías:', error);
    res.status(500).json({ error: 'Error al listar guías de remisión' });
  }
};

/**
 * Obtener guía por ID
 * GET /api/facturacion/guias/:id
 */
const obtenerGuia = async (req, res) => {
  try {
    const { id } = req.params;

    const guia = await guiaRemisionService.obtenerGuia(parseInt(id));

    if (!guia) {
      return res.status(404).json({ error: 'Guía de remisión no encontrada' });
    }

    res.json({ guia });
  } catch (error) {
    console.error('Error obteniendo guía:', error);
    res.status(500).json({ error: 'Error al obtener guía de remisión' });
  }
};

/**
 * Emitir guía de remisión desde encomienda
 * POST /api/facturacion/guias/encomienda/:encomiendaId
 */
const emitirGuiaDesdeEncomienda = async (req, res) => {
  try {
    const { encomiendaId } = req.params;
    const {
      serie = 'TZ74',
      fechaInicioTraslado,
      motivoTraslado = '01',
      descripcionMotivo,
      transporteTipo = '01',
      ubigeoPartida,
      direccionPartida,
      ubigeoLlegada,
      direccionLlegada,
      destinatario,
      transportista,
      conductor,
      vehiculo,
      observaciones
    } = req.body;

    // Validaciones
    if (!fechaInicioTraslado) {
      return res.status(400).json({ error: 'Se requiere fecha de inicio de traslado' });
    }

    if (!ubigeoPartida || !direccionPartida || !ubigeoLlegada || !direccionLlegada) {
      return res.status(400).json({
        error: 'Se requieren ubigeos y direcciones de partida y llegada'
      });
    }

    // Destinatario es opcional cuando se emite desde encomienda
    // El servicio obtiene los datos del destinatario de la encomienda si no se proporcionan
    if (destinatario && (!destinatario.tipoDoc || !destinatario.numDoc || !destinatario.razonSocial)) {
      return res.status(400).json({
        error: 'Si proporciona destinatario, debe incluir tipoDoc, numDoc y razonSocial'
      });
    }

    if (!transportista || (!transportista.ruc && !transportista.documento)) {
      return res.status(400).json({
        error: 'Se requieren datos del transportista (RUC/documento y razón social)'
      });
    }

    if (!conductor || (!conductor.numDoc && !conductor.documento)) {
      return res.status(400).json({
        error: 'Se requieren datos del conductor (documento y nombre)'
      });
    }

    const guia = await guiaRemisionService.emitirGuiaDesdeEncomienda(
      parseInt(encomiendaId),
      {
        serie,
        fechaInicioTraslado,
        motivoTraslado,
        descripcionMotivo,
        transporteTipo,
        ubigeoPartida,
        direccionPartida,
        ubigeoLlegada,
        direccionLlegada,
        destinatario,
        transportista,
        conductor,
        vehiculo,
        observaciones,
        userId: req.user.id
      }
    );

    // Auditoría
    await registrarAuditoria(req.user.id, 'GUIA_REMISION_EMITIDA', 'GUIA_REMISION', guia.id, {
      encomiendaId,
      numeroCompleto: guia.numeroCompleto,
      destinatario: guia.destinatarioRazonSocial || destinatario?.razonSocial || 'N/A'
    });

    res.status(201).json({
      mensaje: 'Guía de remisión emitida exitosamente',
      guia
    });
  } catch (error) {
    console.error('Error emitiendo guía desde encomienda:', error);
    res.status(500).json({ error: error.message || 'Error al emitir guía de remisión' });
  }
};

/**
 * Emitir guía de remisión manual
 * POST /api/facturacion/guias
 */
const emitirGuia = async (req, res) => {
  try {
    const {
      serie = 'TZ74',
      fechaInicioTraslado,
      motivoTraslado = '01',
      descripcionMotivo,
      transporteTipo = '01',
      pesoBrutoTotal,
      numeroBultos,
      ubigeoPartida,
      direccionPartida,
      ubigeoLlegada,
      direccionLlegada,
      destinatario,
      transportista,
      conductor,
      vehiculo,
      observaciones,
      items
    } = req.body;

    // Validaciones
    if (!fechaInicioTraslado || !pesoBrutoTotal || !items || items.length === 0) {
      return res.status(400).json({
        error: 'Se requieren: fechaInicioTraslado, pesoBrutoTotal e items'
      });
    }

    if (!ubigeoPartida || !direccionPartida || !ubigeoLlegada || !direccionLlegada) {
      return res.status(400).json({
        error: 'Se requieren ubigeos y direcciones de partida y llegada'
      });
    }

    if (!destinatario || !destinatario.tipoDoc || !destinatario.numDoc || !destinatario.razonSocial) {
      return res.status(400).json({
        error: 'El destinatario debe tener tipoDoc, numDoc y razonSocial'
      });
    }

    if (!transportista || (!transportista.ruc && !transportista.documento)) {
      return res.status(400).json({
        error: 'Se requieren datos del transportista (RUC/documento y razón social)'
      });
    }

    if (!conductor || (!conductor.numDoc && !conductor.documento)) {
      return res.status(400).json({
        error: 'Se requieren datos del conductor (documento y nombre)'
      });
    }

    const guia = await guiaRemisionService.emitirGuia({
      serie,
      fechaInicioTraslado,
      motivoTraslado,
      descripcionMotivo,
      transporteTipo,
      pesoBrutoTotal: parseFloat(pesoBrutoTotal),
      numeroBultos,
      ubigeoPartida,
      direccionPartida,
      ubigeoLlegada,
      direccionLlegada,
      destinatario,
      transportista,
      conductor,
      vehiculo,
      observaciones,
      items,
      userId: req.user.id
    });

    // Auditoría
    await registrarAuditoria(req.user.id, 'GUIA_REMISION_EMITIDA', 'GUIA_REMISION', guia.id, {
      numeroCompleto: guia.numeroCompleto,
      destinatario: destinatario.razonSocial
    });

    res.status(201).json({
      mensaje: 'Guía de remisión emitida exitosamente',
      guia
    });
  } catch (error) {
    console.error('Error emitiendo guía:', error);
    res.status(500).json({ error: error.message || 'Error al emitir guía de remisión' });
  }
};

/**
 * Anular guía de remisión
 * POST /api/facturacion/guias/:id/anular
 */
const anularGuia = async (req, res) => {
  try {
    const { id } = req.params;
    const { motivo } = req.body;

    if (!motivo) {
      return res.status(400).json({ error: 'Se requiere motivo de anulación' });
    }

    const guia = await guiaRemisionService.anularGuia(
      parseInt(id),
      motivo,
      req.user.id
    );

    // Auditoría
    await registrarAuditoria(req.user.id, 'GUIA_REMISION_ANULADA', 'GUIA_REMISION', id, {
      motivo
    });

    res.json({
      mensaje: 'Guía de remisión anulada exitosamente',
      guia
    });
  } catch (error) {
    console.error('Error anulando guía:', error);
    res.status(500).json({ error: error.message || 'Error al anular guía de remisión' });
  }
};

// =============================================================================
// CONFIGURACIÓN
// =============================================================================

/**
 * Obtener configuración SUNAT
 * GET /api/facturacion/configuracion
 */
const obtenerConfiguracionSunat = async (req, res) => {
  try {
    const config = await facturacionService.obtenerConfiguracion();
    res.json({ configuracion: config });
  } catch (error) {
    console.error('Error obteniendo configuración:', error);
    res.status(500).json({ error: 'Error al obtener configuración' });
  }
};

/**
 * Actualizar configuración SUNAT
 * PUT /api/facturacion/configuracion
 */
const actualizarConfiguracionSunat = async (req, res) => {
  try {
    const config = await facturacionService.actualizarConfiguracion(req.body, req.user.id);

    // Auditoría
    await registrarAuditoria(req.user.id, 'CONFIG_FACTURACION_ACTUALIZADA', 'CONFIG_SUNAT', 1, {
      ruc: req.body.rucEmisor
    });

    res.json({
      mensaje: 'Configuración actualizada exitosamente',
      configuracion: config
    });
  } catch (error) {
    console.error('Error actualizando configuración:', error);
    res.status(500).json({ error: 'Error al actualizar configuración' });
  }
};

/**
 * Obtener series disponibles
 * GET /api/facturacion/series
 */
const obtenerSeries = async (req, res) => {
  try {
    const series = await facturacionService.obtenerSeries();
    res.json({ series });
  } catch (error) {
    console.error('Error obteniendo series:', error);
    res.status(500).json({ error: 'Error al obtener series' });
  }
};

module.exports = {
  // Métricas
  obtenerMetricas,
  // Comprobantes
  listarComprobantes,
  obtenerComprobante,
  emitirComprobante,
  emitirDesdeTicket,
  emitirDesdeEncomienda,
  anularComprobante,
  // Guías de Remisión
  listarGuias,
  obtenerGuia,
  emitirGuia,
  emitirGuiaDesdeEncomienda,
  anularGuia,
  // Configuración
  obtenerConfiguracionSunat,
  actualizarConfiguracionSunat,
  obtenerSeries
};
