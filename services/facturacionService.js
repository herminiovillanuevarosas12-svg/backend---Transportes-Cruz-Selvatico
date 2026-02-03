/**
 * Facturación Service
 * Lógica de negocio para comprobantes electrónicos (Facturas y Boletas)
 *
 * Tipos de comprobante:
 * - 01: Factura
 * - 03: Boleta de Venta
 *
 * Tipos de documento cliente:
 * - 6: RUC
 * - 1: DNI
 * - -: Sin documento (VARIOS)
 */

const prisma = require('../config/prisma');
const keyfacilService = require('./keyfacilService');
const { utcNow } = require('../utils/dateUtils');

/**
 * Obtener el siguiente número de comprobante
 * @param {string} tipoComprobante - '01' para factura, '03' para boleta
 * @param {string} serie - Serie del comprobante (ej: 'FT74', 'BT74')
 * @returns {number} Siguiente número correlativo
 */
const obtenerSiguienteNumero = async (tipoComprobante, serie) => {
  const result = await prisma.$queryRaw`
    UPDATE tbl_series_factura
    SET numero_actual = numero_actual + 1
    WHERE tipo_comprobante = ${tipoComprobante} AND serie = ${serie}
    RETURNING numero_actual
  `;

  if (!result || result.length === 0) {
    throw new Error(`Serie ${serie} no encontrada para tipo ${tipoComprobante}`);
  }

  return result[0].numero_actual;
};

/**
 * Construir payload para KEYFACIL
 * Estructura según documentación oficial de KEYFACIL API
 * @param {Object} config - Configuración SUNAT (no se usa, KEYFACIL tiene datos del emisor)
 * @param {Object} data - Datos del comprobante
 * @returns {Object} Payload para KEYFACIL
 */
const construirPayloadKeyfacil = (config, data) => {
  const {
    tipoComprobante,
    serie,
    numero,
    fechaEmision,
    cliente,
    items
  } = data;

  // Formatear fecha YYYY-MM-DD
  const fechaFormateada = fechaEmision instanceof Date
    ? fechaEmision.toISOString().split('T')[0]
    : fechaEmision;

  // Estructura plana según documentación KEYFACIL
  // KEYFACIL calcula automáticamente los totales desde los items
  return {
    tipo: tipoComprobante,                    // "01" o "03"
    serie: serie,                             // "FT74" o "BT74"
    numero: parseInt(numero),                 // Número entero, no string padded
    fecha_emision: fechaFormateada,           // "YYYY-MM-DD"
    tipo_operacion: '0101',                   // Venta interna
    cliente_tipo: cliente.tipoDoc,            // "6"=RUC, "1"=DNI, "-"=VARIOS
    cliente_documento: cliente.numDoc,        // Número de documento
    cliente_nombre: cliente.razonSocial,      // Nombre o razón social
    cliente_direccion: cliente.direccion || '',
    moneda: 'PEN',
    items: items.map((item, index) => ({
      codigo: item.codigo || `SERV-${String(index + 1).padStart(3, '0')}`,
      descripcion: item.descripcion,
      unidad_medida: item.unidadMedida || 'ZZ',  // ZZ = Servicio
      cantidad: parseFloat(item.cantidad),
      precio_unitario: parseFloat(item.precioUnitario.toFixed(2)),
      tipo_igv: item.tipoIGV || '10'             // 10 = Gravado
    }))
  };
};

/**
 * Calcular IGV y totales de items
 * @param {Array} items - Items sin IGV calculado
 * @param {number} igvPorcentaje - Porcentaje de IGV (default 18)
 * @returns {Object} Items con IGV y totales
 */
const calcularTotales = (items, igvPorcentaje = 18) => {
  const factor = igvPorcentaje / 100;

  const itemsCalculados = items.map(item => {
    const cantidad = parseFloat(item.cantidad);
    const precioConIgv = parseFloat(item.precioUnitario);

    // Calcular valor sin IGV
    const valorUnitario = precioConIgv / (1 + factor);
    const subtotal = valorUnitario * cantidad;
    const igv = subtotal * factor;
    const total = subtotal + igv;

    return {
      ...item,
      cantidad,
      valorUnitario: Math.round(valorUnitario * 1000000) / 1000000,
      precioUnitario: precioConIgv,
      subtotal: Math.round(subtotal * 100) / 100,
      igv: Math.round(igv * 100) / 100,
      total: Math.round(total * 100) / 100
    };
  });

  const totales = {
    subtotal: itemsCalculados.reduce((sum, item) => sum + item.subtotal, 0),
    igv: itemsCalculados.reduce((sum, item) => sum + item.igv, 0),
    total: itemsCalculados.reduce((sum, item) => sum + item.total, 0)
  };

  // Redondear totales
  totales.subtotal = Math.round(totales.subtotal * 100) / 100;
  totales.igv = Math.round(totales.igv * 100) / 100;
  totales.total = Math.round(totales.total * 100) / 100;

  return { items: itemsCalculados, totales };
};

/**
 * Emitir comprobante electrónico
 * @param {Object} params - Parámetros del comprobante
 * @returns {Object} Comprobante creado
 */
const emitirComprobante = async ({
  tipoComprobante,
  serie,
  cliente,
  items,
  origenTipo = 'MANUAL',
  origenId = null,
  userId,
  comentario = null
}) => {
  // Obtener configuración
  const config = await keyfacilService.getConfig();

  // Validar tipo de comprobante
  if (!['01', '03'].includes(tipoComprobante)) {
    throw new Error('Tipo de comprobante inválido. Use 01 (Factura) o 03 (Boleta)');
  }

  // Validar serie según tipo
  if (tipoComprobante === '01' && !serie.startsWith('F')) {
    throw new Error('La serie de factura debe empezar con F');
  }
  if (tipoComprobante === '03' && !serie.startsWith('B')) {
    throw new Error('La serie de boleta debe empezar con B');
  }

  // Validar documento del cliente
  if (tipoComprobante === '01' && cliente.tipoDoc !== '6') {
    throw new Error('Para facturas se requiere RUC (tipo documento 6)');
  }

  // Calcular IGV y totales
  const igvPorcentaje = parseFloat(config.igvPorcentaje) || 18;
  const { items: itemsCalculados, totales } = calcularTotales(items, igvPorcentaje);

  // Obtener siguiente número
  const numero = await obtenerSiguienteNumero(tipoComprobante, serie);
  const numeroCompleto = `${serie}-${String(numero).padStart(8, '0')}`;

  // Crear comprobante en BD
  // IMPORTANTE: Usar hora de Perú (America/Lima) para fecha_emision y hora_emision
  // Esto garantiza que la fecha/hora sea correcta tanto en local como en producción (Railway)
  const comprobante = await prisma.$queryRaw`
    INSERT INTO tbl_comprobantes (
      tipo_comprobante, serie, numero, numero_completo, fecha_emision, hora_emision,
      cliente_tipo_doc, cliente_num_doc, cliente_razon_social, cliente_direccion,
      subtotal, igv, total, moneda, origen_tipo, origen_id,
      estado, user_id_registration, comentario
    ) VALUES (
      ${tipoComprobante}, ${serie}, ${numero}, ${numeroCompleto},
      (NOW() AT TIME ZONE 'America/Lima')::DATE,
      (NOW() AT TIME ZONE 'America/Lima')::TIME,
      ${cliente.tipoDoc}, ${cliente.numDoc}, ${cliente.razonSocial}, ${cliente.direccion || ''},
      ${totales.subtotal}, ${totales.igv}, ${totales.total}, 'PEN',
      ${origenTipo}, ${origenId}, 'PENDIENTE', ${userId}, ${comentario}
    )
    RETURNING id, numero_completo
  `;

  const idComprobante = comprobante[0].id;

  // Insertar items
  for (let i = 0; i < itemsCalculados.length; i++) {
    const item = itemsCalculados[i];
    await prisma.$executeRaw`
      INSERT INTO tbl_comprobante_items (
        id_comprobante, numero_item, codigo, descripcion, unidad_medida,
        cantidad, valor_unitario, precio_unitario, subtotal, igv, total, tipo_igv
      ) VALUES (
        ${idComprobante}, ${i + 1}, ${item.codigo || `SERV-${i + 1}`},
        ${item.descripcion}, ${item.unidadMedida || 'ZZ'},
        ${item.cantidad}, ${item.valorUnitario}, ${item.precioUnitario},
        ${item.subtotal}, ${item.igv}, ${item.total}, ${item.tipoIGV || '10'}
      )
    `;
  }

  // Construir payload para KEYFACIL
  const payload = construirPayloadKeyfacil(config, {
    tipoComprobante,
    serie,
    numero,
    fechaEmision: utcNow(),
    cliente,
    items: itemsCalculados,
    totales
  });

  // Enviar a KEYFACIL
  const response = await keyfacilService.enviarComprobante(payload, idComprobante);

  // Actualizar estado según respuesta
  if (response.success) {
    const keyfacilData = response.data;

    await prisma.$executeRaw`
      UPDATE tbl_comprobantes
      SET estado = 'ACEPTADO',
          keyfacil_id = ${keyfacilData.id || null},
          keyfacil_response = ${JSON.stringify(keyfacilData)}::jsonb,
          hash_cpe = ${keyfacilData.hash || null},
          codigo_qr = ${keyfacilData.qr || null},
          pdf_url = ${keyfacilData.pdfUrl || null},
          xml_url = ${keyfacilData.xmlUrl || null},
          cdr_url = ${keyfacilData.cdrUrl || null},
          intentos_envio = intentos_envio + 1
      WHERE id = ${idComprobante}
    `;
  } else {
    await prisma.$executeRaw`
      UPDATE tbl_comprobantes
      SET estado = 'RECHAZADO',
          keyfacil_response = ${JSON.stringify(response.data)}::jsonb,
          mensaje_error = ${response.data.message || response.data.error || 'Error al enviar'},
          intentos_envio = intentos_envio + 1
      WHERE id = ${idComprobante}
    `;
  }

  // Obtener comprobante actualizado
  const comprobanteActualizado = await prisma.$queryRaw`
    SELECT
      c.*,
      c.numero_completo as "numeroCompleto",
      c.tipo_comprobante as "tipoComprobante",
      c.cliente_tipo_doc as "clienteTipoDoc",
      c.cliente_num_doc as "clienteNumDoc",
      c.cliente_razon_social as "clienteRazonSocial",
      c.cliente_direccion as "clienteDireccion",
      c.fecha_emision as "fechaEmision",
      c.hora_emision as "horaEmision",
      c.origen_tipo as "origenTipo",
      c.origen_id as "origenId",
      c.keyfacil_id as "keyfacilId",
      c.pdf_url as "pdfUrl",
      c.xml_url as "xmlUrl",
      c.comentario
    FROM tbl_comprobantes c
    WHERE c.id = ${idComprobante}
  `;

  return comprobanteActualizado[0];
};

/**
 * Emitir comprobante desde ticket
 * @param {number} ticketId - ID del ticket
 * @param {Object} params - Parámetros adicionales
 * @returns {Object} Comprobante creado
 */
const emitirDesdeTicket = async (ticketId, { tipoComprobante, serie, cliente, userId }) => {
  // Obtener datos del ticket
  const ticket = await prisma.ticket.findUnique({
    where: { id: parseInt(ticketId) },
    include: {
      viaje: {
        include: {
          ruta: {
            include: {
              puntoOrigen: true,
              puntoDestino: true
            }
          },
          horario: true
        }
      },
      pasajero: true
    }
  });

  if (!ticket) {
    throw new Error('Ticket no encontrado');
  }

  // Verificar que no tenga comprobante ya emitido
  const comprobanteExistente = await prisma.$queryRaw`
    SELECT id FROM tbl_comprobantes
    WHERE origen_tipo = 'TICKET' AND origen_id = ${ticketId}
    AND estado NOT IN ('ANULADO', 'RECHAZADO')
    LIMIT 1
  `;

  if (comprobanteExistente && comprobanteExistente.length > 0) {
    throw new Error('Este ticket ya tiene un comprobante emitido');
  }

  // Preparar item del pasaje
  const precio = parseFloat(ticket.viaje.ruta.precioPasaje);
  const items = [{
    codigo: `PAS-${ticket.codigoInterno}`,
    descripcion: `Pasaje ${ticket.viaje.ruta.puntoOrigen.nombre} - ${ticket.viaje.ruta.puntoDestino.nombre}`,
    unidadMedida: 'ZZ',
    cantidad: 1,
    precioUnitario: precio
  }];

  // Emitir comprobante
  const comprobante = await emitirComprobante({
    tipoComprobante,
    serie,
    cliente,
    items,
    origenTipo: 'TICKET',
    origenId: ticketId,
    userId
  });

  // Actualizar ticket con referencia al comprobante
  await prisma.$executeRaw`
    UPDATE tbl_tickets
    SET id_comprobante = ${comprobante.id}
    WHERE id = ${ticketId}
  `;

  return comprobante;
};

/**
 * Emitir comprobante desde encomienda
 * @param {number} encomiendaId - ID de la encomienda
 * @param {Object} params - Parámetros adicionales
 * @returns {Object} Comprobante creado
 */
const emitirDesdeEncomienda = async (encomiendaId, { tipoComprobante, serie, cliente, userId }) => {
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

  // Verificar que no tenga comprobante ya emitido
  const comprobanteExistente = await prisma.$queryRaw`
    SELECT id FROM tbl_comprobantes
    WHERE origen_tipo = 'ENCOMIENDA' AND origen_id = ${encomiendaId}
    AND estado NOT IN ('ANULADO', 'RECHAZADO')
    LIMIT 1
  `;

  if (comprobanteExistente && comprobanteExistente.length > 0) {
    throw new Error('Esta encomienda ya tiene un comprobante emitido');
  }

  // Preparar item de la encomienda
  const precio = parseFloat(encomienda.precioCalculado);
  const items = [{
    codigo: `ENC-${encomienda.codigoTracking}`,
    descripcion: `Envío de encomienda ${encomienda.puntoOrigen.nombre} - ${encomienda.puntoDestino.nombre} (${encomienda.tipoPaquete})`,
    unidadMedida: 'ZZ',
    cantidad: 1,
    precioUnitario: precio
  }];

  // Emitir comprobante
  const comprobante = await emitirComprobante({
    tipoComprobante,
    serie,
    cliente,
    items,
    origenTipo: 'ENCOMIENDA',
    origenId: encomiendaId,
    userId
  });

  // Actualizar encomienda con referencia al comprobante
  await prisma.$executeRaw`
    UPDATE tbl_encomiendas
    SET id_comprobante = ${comprobante.id}
    WHERE id = ${encomiendaId}
  `;

  return comprobante;
};

/**
 * Anular comprobante
 * @param {number} idComprobante - ID del comprobante
 * @param {string} motivo - Motivo de anulación
 * @param {number} userId - ID del usuario
 * @returns {Object} Comprobante anulado
 */
const anularComprobanteLocal = async (idComprobante, motivo, userId) => {
  // Obtener comprobante
  const comprobante = await prisma.$queryRaw`
    SELECT * FROM tbl_comprobantes WHERE id = ${idComprobante}
  `;

  if (!comprobante || comprobante.length === 0) {
    throw new Error('Comprobante no encontrado');
  }

  const comp = comprobante[0];

  if (comp.estado === 'ANULADO') {
    throw new Error('El comprobante ya está anulado');
  }

  // Si tiene keyfacil_id, intentar anular en KEYFACIL
  if (comp.keyfacil_id) {
    const response = await keyfacilService.anularComprobante(comp.keyfacil_id, motivo, idComprobante);

    if (!response.success) {
      console.error('Error anulando en KEYFACIL:', response.data);
      // Continuar con anulación local aunque falle en KEYFACIL
    }
  }

  // Actualizar estado en BD
  await prisma.$executeRaw`
    UPDATE tbl_comprobantes
    SET estado = 'ANULADO',
        fecha_anulacion = NOW(),
        motivo_anulacion = ${motivo},
        user_id_modification = ${userId},
        date_time_modification = NOW()
    WHERE id = ${idComprobante}
  `;

  // Limpiar referencia id_comprobante en ticket/encomienda para permitir re-facturación
  if (comp.origen_tipo === 'TICKET' && comp.origen_id) {
    await prisma.$executeRaw`
      UPDATE tbl_tickets
      SET id_comprobante = NULL
      WHERE id = ${comp.origen_id}
    `;
  } else if (comp.origen_tipo === 'ENCOMIENDA' && comp.origen_id) {
    await prisma.$executeRaw`
      UPDATE tbl_encomiendas
      SET id_comprobante = NULL
      WHERE id = ${comp.origen_id}
    `;
  }

  // Obtener comprobante actualizado
  const comprobanteActualizado = await prisma.$queryRaw`
    SELECT * FROM tbl_comprobantes WHERE id = ${idComprobante}
  `;

  return comprobanteActualizado[0];
};

/**
 * Listar comprobantes con filtros
 * @param {Object} filtros - Filtros de búsqueda
 * @returns {Object} Lista de comprobantes y total
 */
const listarComprobantes = async ({
  tipoComprobante,
  fechaDesde,
  fechaHasta,
  estado,
  clienteNumDoc,
  page = 1,
  limit = 20
}) => {
  const offset = (page - 1) * limit;

  let whereClause = 'WHERE 1=1';
  const params = [];

  if (tipoComprobante) {
    whereClause += ` AND tipo_comprobante = '${tipoComprobante}'`;
  }

  if (fechaDesde) {
    whereClause += ` AND fecha_emision >= '${fechaDesde}'`;
  }

  if (fechaHasta) {
    whereClause += ` AND fecha_emision <= '${fechaHasta}'`;
  }

  if (estado) {
    whereClause += ` AND estado = '${estado}'`;
  }

  if (clienteNumDoc) {
    whereClause += ` AND cliente_num_doc ILIKE '%${clienteNumDoc}%'`;
  }

  const comprobantes = await prisma.$queryRawUnsafe(`
    SELECT
      c.*,
      c.numero_completo as "numeroCompleto",
      c.tipo_comprobante as "tipoComprobante",
      c.cliente_tipo_doc as "clienteTipoDoc",
      c.cliente_num_doc as "clienteNumDoc",
      c.cliente_razon_social as "clienteRazonSocial",
      c.fecha_emision as "fechaEmision",
      c.hora_emision as "horaEmision",
      c.pdf_url as "pdfUrl"
    FROM tbl_comprobantes c
    ${whereClause}
    ORDER BY c.fecha_emision DESC, c.id DESC
    LIMIT ${limit} OFFSET ${offset}
  `);

  const totalResult = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) as total FROM tbl_comprobantes c ${whereClause}
  `);

  const total = parseInt(totalResult[0].total);

  return {
    comprobantes,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  };
};

/**
 * Obtener comprobante por ID
 * @param {number} id - ID del comprobante
 * @returns {Object} Comprobante con items
 */
const obtenerComprobante = async (id) => {
  const comprobante = await prisma.$queryRaw`
    SELECT
      c.*,
      c.numero_completo as "numeroCompleto",
      c.tipo_comprobante as "tipoComprobante",
      c.cliente_tipo_doc as "clienteTipoDoc",
      c.cliente_num_doc as "clienteNumDoc",
      c.cliente_razon_social as "clienteRazonSocial",
      c.cliente_direccion as "clienteDireccion",
      c.fecha_emision as "fechaEmision",
      c.hora_emision as "horaEmision",
      c.origen_tipo as "origenTipo",
      c.origen_id as "origenId",
      c.keyfacil_id as "keyfacilId",
      c.keyfacil_response as "keyfacilResponse",
      c.pdf_url as "pdfUrl",
      c.xml_url as "xmlUrl",
      c.cdr_url as "cdrUrl",
      c.hash_cpe as "hashCpe",
      c.codigo_qr as "codigoQr",
      c.mensaje_error as "mensajeError",
      c.fecha_anulacion as "fechaAnulacion",
      c.motivo_anulacion as "motivoAnulacion"
    FROM tbl_comprobantes c
    WHERE c.id = ${id}
  `;

  if (!comprobante || comprobante.length === 0) {
    return null;
  }

  const items = await prisma.$queryRaw`
    SELECT
      id,
      id_comprobante as "idComprobante",
      numero_item as "numeroItem",
      codigo,
      descripcion,
      unidad_medida as "unidadMedida",
      cantidad,
      valor_unitario as "valorUnitario",
      precio_unitario as "precioUnitario",
      subtotal,
      igv,
      total,
      tipo_igv as "tipoIgv"
    FROM tbl_comprobante_items
    WHERE id_comprobante = ${id}
    ORDER BY numero_item
  `;

  const comp = comprobante[0];
  let origen = null;

  // Obtener datos del origen (ticket o encomienda) para mostrar fecha, ruta, etc.
  if (comp.origenTipo === 'TICKET' && comp.origenId) {
    const ticketData = await prisma.ticket.findUnique({
      where: { id: comp.origenId },
      include: {
        viaje: {
          include: {
            ruta: {
              include: {
                puntoOrigen: true,
                puntoDestino: true
              }
            },
            horario: true
          }
        }
      }
    });
    if (ticketData) {
      origen = {
        tipo: 'TICKET',
        fechaViaje: ticketData.viaje?.fechaServicio,
        horaSalida: ticketData.viaje?.horario?.horaSalida,
        ruta: ticketData.viaje?.ruta ? {
          origen: ticketData.viaje.ruta.puntoOrigen?.nombre,
          destino: ticketData.viaje.ruta.puntoDestino?.nombre
        } : null,
        agencia: ticketData.viaje?.ruta?.puntoOrigen ? {
          nombre: ticketData.viaje.ruta.puntoOrigen.nombre,
          ciudad: ticketData.viaje.ruta.puntoOrigen.ciudad,
          direccion: ticketData.viaje.ruta.puntoOrigen.direccion
        } : null
      };
    }
  } else if (comp.origenTipo === 'ENCOMIENDA' && comp.origenId) {
    const encomiendaData = await prisma.encomienda.findUnique({
      where: { id: comp.origenId },
      include: {
        puntoOrigen: true,
        puntoDestino: true
      }
    });
    if (encomiendaData) {
      origen = {
        tipo: 'ENCOMIENDA',
        fechaRegistro: encomiendaData.fechaRegistro,
        ruta: {
          origen: encomiendaData.puntoOrigen?.nombre,
          destino: encomiendaData.puntoDestino?.nombre
        },
        agencia: encomiendaData.puntoOrigen ? {
          nombre: encomiendaData.puntoOrigen.nombre,
          ciudad: encomiendaData.puntoOrigen.ciudad,
          direccion: encomiendaData.puntoOrigen.direccion
        } : null
      };
    }
  }

  return {
    ...comp,
    items,
    origen
  };
};

/**
 * Obtener métricas de facturación
 * @returns {Object} Métricas del mes
 */
const obtenerMetricas = async () => {
  const primerDiaMes = new Date();
  primerDiaMes.setDate(1);
  primerDiaMes.setHours(0, 0, 0, 0);

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const metricas = await prisma.$queryRaw`
    SELECT
      COALESCE(SUM(CASE WHEN tipo_comprobante = '01' AND estado != 'ANULADO' AND fecha_emision >= ${primerDiaMes} THEN 1 ELSE 0 END), 0) as "facturasMes",
      COALESCE(SUM(CASE WHEN tipo_comprobante = '03' AND estado != 'ANULADO' AND fecha_emision >= ${primerDiaMes} THEN 1 ELSE 0 END), 0) as "boletasMes",
      COALESCE(SUM(CASE WHEN estado = 'ANULADO' AND fecha_emision >= ${primerDiaMes} THEN 1 ELSE 0 END), 0) as "anuladosMes",
      COALESCE(SUM(CASE WHEN estado != 'ANULADO' AND fecha_emision = ${hoy} THEN 1 ELSE 0 END), 0) as "docsHoy",
      COALESCE(SUM(CASE WHEN estado != 'ANULADO' AND fecha_emision >= ${primerDiaMes} THEN subtotal ELSE 0 END), 0) as "baseImponibleMes",
      COALESCE(SUM(CASE WHEN estado != 'ANULADO' AND fecha_emision >= ${primerDiaMes} THEN igv ELSE 0 END), 0) as "igvMes"
    FROM tbl_comprobantes
  `;

  // Contar guías del mes
  const guias = await prisma.$queryRaw`
    SELECT COUNT(*) as total
    FROM tbl_guias_remision
    WHERE estado != 'ANULADA' AND fecha_emision >= ${primerDiaMes}
  `;

  return {
    facturasMes: parseInt(metricas[0].facturasMes),
    boletasMes: parseInt(metricas[0].boletasMes),
    guiasMes: parseInt(guias[0].total),
    docsHoy: parseInt(metricas[0].docsHoy),
    anuladosMes: parseInt(metricas[0].anuladosMes),
    baseImponibleMes: parseFloat(metricas[0].baseImponibleMes) || 0,
    igvMes: parseFloat(metricas[0].igvMes) || 0
  };
};

/**
 * Obtener series disponibles
 * @returns {Array} Series activas
 */
const obtenerSeries = async () => {
  const series = await prisma.$queryRaw`
    SELECT
      id,
      tipo_comprobante as "tipoComprobante",
      serie,
      numero_actual as "numeroActual",
      activo
    FROM tbl_series_factura
    WHERE activo = true
    ORDER BY tipo_comprobante, serie
  `;

  return series;
};

/**
 * Obtener configuración SUNAT
 * @returns {Object} Configuración activa
 */
const obtenerConfiguracion = async () => {
  return await keyfacilService.getConfig();
};

/**
 * Actualizar configuración SUNAT
 * @param {Object} data - Datos a actualizar
 * @param {number} userId - ID del usuario
 * @returns {Object} Configuración actualizada
 */
const actualizarConfiguracion = async (data, userId) => {
  const {
    rucEmisor,
    razonSocial,
    nombreComercial,
    direccionFiscal,
    ubigeo,
    departamento,
    provincia,
    distrito,
    keyfacilToken,
    modoProduccion,
    igvPorcentaje
  } = data;

  // Verificar si existe configuración
  const configExistente = await prisma.$queryRaw`
    SELECT id FROM tbl_configuracion_sunat WHERE activo = true LIMIT 1
  `;

  if (configExistente && configExistente.length > 0) {
    // Actualizar existente
    await prisma.$executeRaw`
      UPDATE tbl_configuracion_sunat
      SET ruc_emisor = ${rucEmisor},
          razon_social = ${razonSocial},
          nombre_comercial = ${nombreComercial},
          direccion_fiscal = ${direccionFiscal},
          ubigeo = ${ubigeo},
          departamento = ${departamento},
          provincia = ${provincia},
          distrito = ${distrito},
          keyfacil_token = ${keyfacilToken},
          modo_produccion = ${modoProduccion || false},
          igv_porcentaje = ${igvPorcentaje || 18},
          user_id_modification = ${userId},
          date_time_modification = NOW()
      WHERE activo = true
    `;
  } else {
    // Crear nueva
    await prisma.$executeRaw`
      INSERT INTO tbl_configuracion_sunat (
        ruc_emisor, razon_social, nombre_comercial, direccion_fiscal,
        ubigeo, departamento, provincia, distrito,
        keyfacil_token, modo_produccion, igv_porcentaje, activo, user_id_registration
      ) VALUES (
        ${rucEmisor}, ${razonSocial}, ${nombreComercial}, ${direccionFiscal},
        ${ubigeo}, ${departamento}, ${provincia}, ${distrito},
        ${keyfacilToken}, ${modoProduccion || false}, ${igvPorcentaje || 18},
        true, ${userId}
      )
    `;
  }

  return await obtenerConfiguracion();
};

module.exports = {
  obtenerSiguienteNumero,
  construirPayloadKeyfacil,
  calcularTotales,
  emitirComprobante,
  emitirDesdeTicket,
  emitirDesdeEncomienda,
  anularComprobante: anularComprobanteLocal,
  listarComprobantes,
  obtenerComprobante,
  obtenerMetricas,
  obtenerSeries,
  obtenerConfiguracion,
  actualizarConfiguracion
};
