/**
 * Guía de Remisión Service
 * Lógica de negocio para guías de remisión electrónicas
 * Integración con KEYFACIL - Endpoint: POST /despatch-documents
 *
 * Tipo de comprobante: 09
 *
 * Tipo de transporte (transporte_tipo / campo KEYFACIL: transporte_tipo):
 * - 01: Transporte Público
 * - 02: Transporte Privado
 *
 * Motivo de traslado (envio_tipo / campo KEYFACIL: envio_tipo):
 * - 01: Venta
 * - 02: Compra
 * - 04: Traslado entre establecimientos de la misma empresa
 * - 08: Importación
 * - 09: Exportación
 * - 13: Otros
 * - 14: Venta sujeta a confirmación del comprador
 */

const prisma = require('../config/prisma');
const keyfacilService = require('./keyfacilService');
const { utcNow } = require('../utils/dateUtils');

/**
 * Obtener el siguiente número de guía
 * @param {string} serie - Serie de la guía (ej: 'TZ74')
 * @returns {number} Siguiente número correlativo
 */
const obtenerSiguienteNumero = async (serie = 'TZ74') => {
  const result = await prisma.$queryRaw`
    UPDATE tbl_series_factura
    SET numero_actual = numero_actual + 1
    WHERE tipo_comprobante = '09' AND serie = ${serie}
    RETURNING numero_actual
  `;

  if (!result || result.length === 0) {
    throw new Error(`Serie ${serie} no encontrada para guías de remisión`);
  }

  return result[0].numero_actual;
};

/**
 * Construir payload de guía para KEYFACIL
 * Estructura JSON plana según Manual de Integración KEYFACIL (GRE - Remitente)
 * Endpoint: POST /despatch-documents
 *
 * @param {Object} config - Configuración SUNAT (no se usa en payload GRE pero se mantiene por consistencia)
 * @param {Object} data - Datos de la guía
 * @returns {Object} Payload plano para KEYFACIL
 */
const construirPayloadGuia = (config, data) => {
  const {
    serie,
    numero,
    fechaInicioTraslado,
    motivoTraslado,
    transporteTipo,
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
  } = data;

  const formatFecha = (fecha) => {
    if (fecha instanceof Date) {
      return fecha.toISOString().split('T')[0];
    }
    return fecha;
  };

  const payload = {
    // Cabecera
    tipo: '09',
    serie,
    numero: parseInt(numero),
    // Receptor (destinatario)
    receptor_tipo: destinatario.tipoDoc,
    receptor_documento: destinatario.numDoc,
    receptor_nombre: destinatario.razonSocial,
    ...(destinatario.direccion && { receptor_direccion: destinatario.direccion }),
    // Observaciones
    ...(observaciones && { observaciones }),
    // Origen y Destino
    origen_ubigeo: ubigeoPartida,
    origen_direccion: direccionPartida,
    destino_ubigeo: ubigeoLlegada,
    destino_direccion: direccionLlegada,
    // Transporte
    transporte_tipo: transporteTipo,
    envio_tipo: motivoTraslado,
    envio_fecha: formatFecha(fechaInicioTraslado),
    envio_peso: parseFloat(pesoBrutoTotal),
    envio_cantidad_bultos: parseInt(numeroBultos) || 1,
    // Transportista (obligatorio según manual KEYFACIL)
    transportista_tipo: transportista?.tipoDoc || '6',
    transportista_documento: transportista?.documento || transportista?.ruc || '',
    transportista_nombre: transportista?.nombre || transportista?.razonSocial || '',
    ...(transportista?.direccion && { transportista_direccion: transportista.direccion }),
    // Conductor (obligatorio según manual KEYFACIL)
    conductor_tipo: conductor?.tipoDoc || '1',
    conductor_documento: conductor?.documento || conductor?.numDoc || '',
    conductor_nombre: conductor?.nombre || [conductor?.nombres, conductor?.apellidos].filter(Boolean).join(' ') || '',
    ...(conductor?.direccion && { conductor_direccion: conductor.direccion }),
    ...(conductor?.licencia && { conductor_licencia: conductor.licencia }),
    // Vehículo
    ...(vehiculo?.placa && { vehiculo_placa: vehiculo.placa }),
    // Solicitar PDF en respuesta
    incluir_pdf: true,
    // Items
    items: items.map((item) => ({
      codigo: item.codigo || 'PROD001',
      descripcion: item.descripcion,
      unidad_medida: item.unidadMedida || 'ZZ',
      cantidad: parseFloat(item.cantidad)
    }))
  };

  return payload;
};

/**
 * Emitir guía de remisión
 * @param {Object} params - Parámetros de la guía
 * @returns {Object} Guía creada
 */
const emitirGuia = async ({
  serie = 'TZ74',
  fechaInicioTraslado,
  motivoTraslado = '01',
  descripcionMotivo,
  transporteTipo = '01',
  pesoBrutoTotal,
  numeroBultos = 1,
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
  idEncomienda = null,
  userId
}) => {
  // Obtener configuración
  const config = await keyfacilService.getConfig();

  // Validar que transportista y conductor tengan datos (ambos obligatorios en KEYFACIL)
  if (!transportista || (!transportista.documento && !transportista.ruc)) {
    throw new Error('Se requieren datos del transportista (documento y nombre)');
  }

  if (!conductor || (!conductor.documento && !conductor.numDoc)) {
    throw new Error('Se requieren datos del conductor (documento y nombre)');
  }

  // Obtener siguiente número
  const numero = await obtenerSiguienteNumero(serie);

  // Crear guía en BD
  const guia = await prisma.$queryRaw`
    INSERT INTO tbl_guias_remision (
      serie, numero, fecha_emision, fecha_inicio_traslado,
      motivo_traslado, descripcion_motivo, modalidad_traslado, transporte_tipo,
      peso_bruto_total, numero_bultos,
      ubigeo_partida, direccion_partida,
      ubigeo_llegada, direccion_llegada,
      destinatario_tipo_doc, destinatario_num_doc, destinatario_razon_social,
      transportista_ruc, transportista_razon_social,
      conductor_tipo_doc, conductor_num_doc, conductor_nombres, conductor_apellidos, conductor_licencia,
      vehiculo_placa,
      id_encomienda,
      estado, user_id_registration
    ) VALUES (
      ${serie}, ${numero}, CURRENT_DATE, ${fechaInicioTraslado}::date,
      ${motivoTraslado}, ${descripcionMotivo || null}, ${transporteTipo}, ${transporteTipo},
      ${pesoBrutoTotal}, ${numeroBultos || 1},
      ${ubigeoPartida}, ${direccionPartida},
      ${ubigeoLlegada}, ${direccionLlegada},
      ${destinatario.tipoDoc}, ${destinatario.numDoc}, ${destinatario.razonSocial},
      ${transportista?.documento || transportista?.ruc || null}, ${transportista?.nombre || transportista?.razonSocial || null},
      ${conductor?.tipoDoc || null}, ${conductor?.documento || conductor?.numDoc || null},
      ${conductor?.nombres || null}, ${conductor?.apellidos || null}, ${conductor?.licencia || null},
      ${vehiculo?.placa || null},
      ${idEncomienda},
      'PENDIENTE', ${userId}
    )
    RETURNING id, numero_completo
  `;

  const idGuia = guia[0].id;

  // Insertar items
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    await prisma.$executeRaw`
      INSERT INTO tbl_guia_remision_items (
        id_guia, numero_item, codigo, descripcion, unidad_medida, cantidad, peso
      ) VALUES (
        ${idGuia}, ${i + 1}, ${item.codigo || `ITEM-${i + 1}`},
        ${item.descripcion}, ${item.unidadMedida || 'ZZ'},
        ${item.cantidad}, ${item.peso || null}
      )
    `;
  }

  // Construir payload para KEYFACIL (estructura plana según manual GRE)
  const payload = construirPayloadGuia(config, {
    serie,
    numero,
    fechaInicioTraslado,
    motivoTraslado,
    transporteTipo,
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
  });

  // Enviar a KEYFACIL
  const response = await keyfacilService.enviarGuiaRemision(payload, idGuia);

  // Actualizar estado según respuesta
  if (response.success) {
    const keyfacilData = response.data;

    await prisma.$executeRaw`
      UPDATE tbl_guias_remision
      SET estado = 'ACEPTADA',
          keyfacil_id = ${keyfacilData.id || null},
          keyfacil_response = ${JSON.stringify(keyfacilData)}::jsonb,
          pdf_url = ${keyfacilData.pdf_url || keyfacilData.pdfUrl || null}
      WHERE id = ${idGuia}
    `;
  } else {
    await prisma.$executeRaw`
      UPDATE tbl_guias_remision
      SET estado = 'RECHAZADA',
          keyfacil_response = ${JSON.stringify(response.data)}::jsonb,
          mensaje_error = ${response.data.message || response.data.error || 'Error al enviar a KEYFACIL'}
      WHERE id = ${idGuia}
    `;
  }

  // Si hay encomienda vinculada, actualizar referencia
  if (idEncomienda) {
    await prisma.$executeRaw`
      UPDATE tbl_encomiendas
      SET id_guia_remision = ${idGuia}
      WHERE id = ${idEncomienda}
    `;
  }

  // Obtener guía actualizada
  return await obtenerGuia(idGuia);
};

/**
 * Emitir guía desde encomienda
 * @param {number} encomiendaId - ID de la encomienda
 * @param {Object} params - Parámetros adicionales
 * @returns {Object} Guía creada
 */
const emitirGuiaDesdeEncomienda = async (encomiendaId, params) => {
  // Obtener datos de la encomienda
  const encomienda = await prisma.encomienda.findUnique({
    where: { id: parseInt(encomiendaId) },
    include: {
      puntoOrigen: true,
      puntoDestino: true
    }
  });

  if (!encomienda) {
    throw new Error('Encomienda no encontrada');
  }

  // Verificar que no tenga guía ya emitida
  const guiaExistente = await prisma.$queryRaw`
    SELECT id FROM tbl_guias_remision
    WHERE id_encomienda = ${encomiendaId}
    AND estado NOT IN ('ANULADA', 'RECHAZADA')
    LIMIT 1
  `;

  if (guiaExistente && guiaExistente.length > 0) {
    throw new Error('Esta encomienda ya tiene una guía de remisión emitida');
  }

  // Preparar item de la encomienda
  const items = [{
    codigo: `ENC-${encomienda.codigoTracking}`,
    descripcion: `${encomienda.tipoPaquete}: ${encomienda.descripcion || 'Encomienda'}`,
    unidadMedida: 'ZZ',
    cantidad: 1,
    peso: parseFloat(encomienda.peso)
  }];

  // Emitir guía con datos de la encomienda
  // Usar datos del destinatario de la encomienda si no se proporcionan
  const destinatarioDefault = {
    tipoDoc: '1', // DNI por defecto
    numDoc: encomienda.destinatario_dni || '00000000',
    razonSocial: encomienda.destinatarioNombre
  };

  const guia = await emitirGuia({
    ...params,
    pesoBrutoTotal: parseFloat(encomienda.peso),
    numeroBultos: 1,
    destinatario: params.destinatario || destinatarioDefault,
    items,
    idEncomienda: encomiendaId,
    userId: params.userId
  });

  return guia;
};

/**
 * Anular guía de remisión
 * @param {number} idGuia - ID de la guía
 * @param {string} motivo - Motivo de anulación
 * @param {number} userId - ID del usuario
 * @returns {Object} Guía anulada
 */
const anularGuia = async (idGuia, motivo, userId) => {
  // Obtener guía
  const guia = await prisma.$queryRaw`
    SELECT * FROM tbl_guias_remision WHERE id = ${idGuia}
  `;

  if (!guia || guia.length === 0) {
    throw new Error('Guía de remisión no encontrada');
  }

  const g = guia[0];

  if (g.estado === 'ANULADA') {
    throw new Error('La guía ya está anulada');
  }

  // Si tiene keyfacil_id, intentar anular en KEYFACIL
  if (g.keyfacil_id) {
    const response = await keyfacilService.anularGuiaRemision(g.keyfacil_id, motivo, idGuia);

    if (!response.success) {
      console.error('Error anulando guía en KEYFACIL:', response.data);
    }
  }

  // Actualizar estado en BD
  await prisma.$executeRaw`
    UPDATE tbl_guias_remision
    SET estado = 'ANULADA',
        fecha_anulacion = NOW(),
        motivo_anulacion = ${motivo},
        user_id_modification = ${userId},
        date_time_modification = NOW()
    WHERE id = ${idGuia}
  `;

  return await obtenerGuia(idGuia);
};

/**
 * Listar guías con filtros
 * @param {Object} filtros - Filtros de búsqueda
 * @returns {Object} Lista de guías y total
 */
const listarGuias = async ({
  fechaDesde,
  fechaHasta,
  estado,
  destinatarioNumDoc,
  page = 1,
  limit = 20
}) => {
  const offset = (page - 1) * limit;

  let whereClause = 'WHERE 1=1';

  if (fechaDesde) {
    whereClause += ` AND fecha_emision >= '${fechaDesde}'`;
  }

  if (fechaHasta) {
    whereClause += ` AND fecha_emision <= '${fechaHasta}'`;
  }

  if (estado) {
    whereClause += ` AND estado = '${estado}'`;
  }

  if (destinatarioNumDoc) {
    whereClause += ` AND destinatario_num_doc ILIKE '%${destinatarioNumDoc}%'`;
  }

  const guias = await prisma.$queryRawUnsafe(`
    SELECT
      g.*,
      g.numero_completo as "numeroCompleto",
      g.fecha_emision as "fechaEmision",
      g.fecha_inicio_traslado as "fechaInicioTraslado",
      g.motivo_traslado as "motivoTraslado",
      g.modalidad_traslado as "modalidadTraslado",
      g.transporte_tipo as "transporteTipo",
      g.peso_bruto_total as "pesoBrutoTotal",
      g.numero_bultos as "numeroBultos",
      g.ubigeo_partida as "ubigeoPartida",
      g.direccion_partida as "direccionPartida",
      g.ubigeo_llegada as "ubigeoLlegada",
      g.direccion_llegada as "direccionLlegada",
      g.destinatario_tipo_doc as "destinatarioTipoDoc",
      g.destinatario_num_doc as "destinatarioNumDoc",
      g.destinatario_razon_social as "destinatarioRazonSocial",
      g.pdf_url as "pdfUrl"
    FROM tbl_guias_remision g
    ${whereClause}
    ORDER BY g.fecha_emision DESC, g.id DESC
    LIMIT ${limit} OFFSET ${offset}
  `);

  const totalResult = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) as total FROM tbl_guias_remision g ${whereClause}
  `);

  const total = parseInt(totalResult[0].total);

  return {
    guias,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  };
};

/**
 * Obtener guía por ID
 * @param {number} id - ID de la guía
 * @returns {Object} Guía con items
 */
const obtenerGuia = async (id) => {
  const guia = await prisma.$queryRaw`
    SELECT
      g.*,
      g.numero_completo as "numeroCompleto",
      g.fecha_emision as "fechaEmision",
      g.fecha_inicio_traslado as "fechaInicioTraslado",
      g.motivo_traslado as "motivoTraslado",
      g.descripcion_motivo as "descripcionMotivo",
      g.modalidad_traslado as "modalidadTraslado",
      g.transporte_tipo as "transporteTipo",
      g.peso_bruto_total as "pesoBrutoTotal",
      g.numero_bultos as "numeroBultos",
      g.ubigeo_partida as "ubigeoPartida",
      g.direccion_partida as "direccionPartida",
      g.ubigeo_llegada as "ubigeoLlegada",
      g.direccion_llegada as "direccionLlegada",
      g.destinatario_tipo_doc as "destinatarioTipoDoc",
      g.destinatario_num_doc as "destinatarioNumDoc",
      g.destinatario_razon_social as "destinatarioRazonSocial",
      g.transportista_ruc as "transportistaRuc",
      g.transportista_razon_social as "transportistaRazonSocial",
      g.conductor_tipo_doc as "conductorTipoDoc",
      g.conductor_num_doc as "conductorNumDoc",
      g.conductor_nombres as "conductorNombres",
      g.conductor_apellidos as "conductorApellidos",
      g.conductor_licencia as "conductorLicencia",
      g.vehiculo_placa as "vehiculoPlaca",
      g.id_encomienda as "idEncomienda",
      g.keyfacil_id as "keyfacilId",
      g.keyfacil_response as "keyfacilResponse",
      g.pdf_url as "pdfUrl",
      g.mensaje_error as "mensajeError",
      g.fecha_anulacion as "fechaAnulacion",
      g.motivo_anulacion as "motivoAnulacion"
    FROM tbl_guias_remision g
    WHERE g.id = ${id}
  `;

  if (!guia || guia.length === 0) {
    return null;
  }

  const items = await prisma.$queryRaw`
    SELECT
      id,
      id_guia as "idGuia",
      numero_item as "numeroItem",
      codigo,
      descripcion,
      unidad_medida as "unidadMedida",
      cantidad,
      peso
    FROM tbl_guia_remision_items
    WHERE id_guia = ${id}
    ORDER BY numero_item
  `;

  // Si tiene encomienda vinculada, obtener datos
  let encomienda = null;
  if (guia[0].id_encomienda) {
    encomienda = await prisma.encomienda.findUnique({
      where: { id: guia[0].id_encomienda },
      include: {
        puntoOrigen: { select: { nombre: true } },
        puntoDestino: { select: { nombre: true } }
      }
    });
  }

  return {
    ...guia[0],
    items,
    encomienda
  };
};

module.exports = {
  obtenerSiguienteNumero,
  construirPayloadGuia,
  emitirGuia,
  emitirGuiaDesdeEncomienda,
  anularGuia,
  listarGuias,
  obtenerGuia
};
