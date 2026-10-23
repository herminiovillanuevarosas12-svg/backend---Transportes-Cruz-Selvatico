/**
 * Manifiesto de Encomiendas Service
 * Documento interno del bus (no se envía a SUNAT): encomiendas "En ruta" de un mismo origen
 * con los datos del viaje (destino final, salida, conductor y bus).
 * Una encomienda solo puede pertenecer a un manifiesto: lo garantiza el UNIQUE
 * de tbl_manifiesto_encomienda_items.id_encomienda.
 */

const { Prisma, EstadoEncomienda } = require('@prisma/client');
const prisma = require('../config/prisma');
const { parseCivilDate, parseTime } = require('../utils/dateUtils');
const { formatearConductor, formatearBus } = require('./flotaService');

class ManifiestoError extends Error {
  constructor(mensaje, status = 400) {
    super(mensaje);
    this.name = 'ManifiestoError';
    this.status = status;
  }
}

const redondear = (valor) => Math.round(valor * 100) / 100;

const aNumero = (valor) => parseFloat(valor ?? 0) || 0;

const vacio = (valor) => valor === null || valor === undefined || valor === '';

const esEnteroPositivo = (valor) => Number.isInteger(valor) && valor > 0;

const conCeros = (valor) => String(valor).padStart(2, '0');

/**
 * Formato visible del número de manifiesto (correlativo = id)
 * @param {number} id - ID del manifiesto
 * @returns {string} Ej: 'MAN-000013'
 */
const formatearNumeroManifiesto = (id) => `MAN-${String(id).padStart(6, '0')}`;

/**
 * Un usuario con punto solo ve los manifiestos que salen de su punto
 * @param {number|null} idPuntoUsuario - null = sin punto (ve todo)
 * @param {number|null} idPuntoOrigen - Origen del manifiesto (null en manifiestos antiguos de varios orígenes)
 * @returns {boolean}
 */
const esManifiestoVisible = (idPuntoUsuario, idPuntoOrigen) =>
  !idPuntoUsuario || idPuntoOrigen === idPuntoUsuario;

/**
 * Validar y normalizar los ids de encomiendas seleccionadas
 * @param {Array} ids - Ids recibidos en el body
 * @returns {{ids: number[]} | {error: string}}
 */
const normalizarIdsEncomiendas = (ids) => {
  if (!Array.isArray(ids) || ids.length === 0) {
    return { error: 'Seleccione al menos una encomienda para el manifiesto' };
  }

  const numeros = ids.map((id) => (vacio(id) ? NaN : Number(id)));
  if (!numeros.every(esEnteroPositivo)) {
    return { error: 'La selección contiene identificadores de encomienda no válidos' };
  }

  return { ids: [...new Set(numeros)] };
};

// Datos del viaje que se eligen de una lista (id)
const IDS_VIAJE = [
  { campo: 'idPuntoDestino', etiqueta: 'el destino final' },
  { campo: 'idConductor', etiqueta: 'el conductor' },
  { campo: 'idBus', etiqueta: 'el bus' }
];

/**
 * Validar y normalizar los datos del viaje del manifiesto
 * @param {Object} body - { idPuntoDestino, fechaSalida: 'YYYY-MM-DD', horaSalida: 'HH:MM', idConductor, idBus }
 * @returns {{viaje: Object} | {error: string}}
 */
const normalizarDatosViaje = (body) => {
  if (!body || typeof body !== 'object') {
    return { error: 'Faltan los datos del viaje' };
  }

  const viaje = {};
  for (const { campo, etiqueta } of IDS_VIAJE) {
    if (vacio(body[campo])) {
      return { error: `Seleccione ${etiqueta}` };
    }
    const id = Number(body[campo]);
    if (!esEnteroPositivo(id)) {
      return { error: `La selección de ${etiqueta} no es válida` };
    }
    viaje[campo] = id;
  }

  if (vacio(body.fechaSalida)) {
    return { error: 'Ingrese la fecha de salida' };
  }
  const { date, error: errorFecha } = parseCivilDate(String(body.fechaSalida), 'fechaSalida');
  // parseCivilDate acepta días desbordados (31 de febrero): se exige que la fecha exista
  if (errorFecha || date.toISOString().slice(0, 10) !== body.fechaSalida) {
    return { error: 'La fecha de salida no es válida' };
  }
  viaje.fechaSalida = body.fechaSalida;

  if (vacio(body.horaSalida)) {
    return { error: 'Ingrese la hora de salida' };
  }
  const { hours, minutes, error: errorHora } = parseTime(String(body.horaSalida), 'horaSalida');
  if (errorHora) {
    return { error: 'La hora de salida no es válida' };
  }
  viaje.horaSalida = `${conCeros(hours)}:${conCeros(minutes)}`;

  return { viaje };
};

/**
 * Verificar que las encomiendas puedan incluirse en un nuevo manifiesto
 * @param {Object} params
 * @param {number[]} params.ids - Ids solicitados (ya normalizados)
 * @param {Object[]} params.encomiendas - Filas encontradas en BD
 * @param {number|null} params.idPuntoUsuario - Punto del usuario (null = sin punto)
 * @param {number} params.idPuntoDestino - Destino final del manifiesto
 * @returns {null | {status: number, error: string}} null si la selección es válida
 */
const validarEncomiendasParaManifiesto = ({ ids, encomiendas, idPuntoUsuario, idPuntoDestino }) => {
  const encontrados = new Set(encomiendas.map((e) => e.id));
  const faltantes = ids.filter((id) => !encontrados.has(id));
  if (faltantes.length > 0) {
    return { status: 404, error: `Encomiendas no encontradas (id): ${faltantes.join(', ')}` };
  }

  // Antes que cualquier otra regla: no revelar código, estado ni manifiesto de encomiendas de otra agencia
  if (idPuntoUsuario && encomiendas.some((e) => e.idPuntoOrigen !== idPuntoUsuario)) {
    return { status: 403, error: 'Solo puede incluir encomiendas que salen de su agencia' };
  }

  const noEnRuta = encomiendas.filter((e) => e.estadoActual !== EstadoEncomienda.EN_RUTA);
  if (noEnRuta.length > 0) {
    return {
      status: 400,
      error: `Solo se pueden incluir encomiendas En ruta. No lo están: ${noEnRuta.map((e) => e.codigoTracking).join(', ')}`
    };
  }

  const conManifiesto = encomiendas.filter((e) => e.idManifiesto);
  if (conManifiesto.length > 0) {
    const detalle = conManifiesto
      .map((e) => `${e.codigoTracking} (${formatearNumeroManifiesto(e.idManifiesto)})`)
      .join(', ');
    return { status: 409, error: `Estas encomiendas ya pertenecen a un manifiesto: ${detalle}` };
  }

  const origenes = new Set(encomiendas.map((e) => e.idPuntoOrigen));
  if (origenes.size > 1) {
    return { status: 400, error: 'Todas las encomiendas del manifiesto deben tener el mismo origen' };
  }
  const [idPuntoOrigen] = origenes;

  if (idPuntoDestino === idPuntoOrigen) {
    return { status: 400, error: 'El destino final debe ser diferente al origen' };
  }

  return null;
};

/**
 * Totales del manifiesto. El flete es el monto efectivamente cobrado
 * (precio final con descuento por puntos, o el calculado si no hubo descuento).
 * @param {Object[]} encomiendas
 * @returns {Object} { cantidad, pesoTotal, fleteTotal, pagado: {cantidad, monto}, porCobrar: {cantidad, monto} }
 */
const calcularResumenManifiesto = (encomiendas) => {
  const resumen = {
    cantidad: encomiendas.length,
    pesoTotal: 0,
    fleteTotal: 0,
    pagado: { cantidad: 0, monto: 0 },
    porCobrar: { cantidad: 0, monto: 0 }
  };

  for (const e of encomiendas) {
    const flete = aNumero(e.precioFinal ?? e.precioCalculado);
    const grupo = e.pagoAlRecojo ? resumen.porCobrar : resumen.pagado;
    resumen.pesoTotal += aNumero(e.peso);
    resumen.fleteTotal += flete;
    grupo.cantidad += 1;
    grupo.monto += flete;
  }

  resumen.pesoTotal = redondear(resumen.pesoTotal);
  resumen.fleteTotal = redondear(resumen.fleteTotal);
  resumen.pagado.monto = redondear(resumen.pagado.monto);
  resumen.porCobrar.monto = redondear(resumen.porCobrar.monto);

  return resumen;
};

/**
 * Datos de la empresa para la cabecera: los fiscales de la configuración SUNAT
 * y, en su defecto, los de la configuración del sistema
 * @param {Object|null} sunat - { razonSocial, ruc, direccion, departamento, provincia, distrito }
 * @param {Object|null} sistema - { nombreEmpresa, ruc, direccion }
 * @returns {Object} { razonSocial, ruc, domicilioFiscal }
 */
const combinarDatosEmpresa = (sunat, sistema) => {
  const ubicacion = [sunat?.departamento, sunat?.provincia, sunat?.distrito].filter(Boolean).join('-');
  const domicilioFiscal = sunat?.direccion
    ? [sunat.direccion, ubicacion].filter(Boolean).join(' ')
    : sistema?.direccion || null;

  return {
    razonSocial: sunat?.razonSocial || sistema?.nombreEmpresa || null,
    ruc: sunat?.ruc || sistema?.ruc || null,
    domicilioFiscal
  };
};

const obtenerDatosEmpresa = async () => {
  const [sunat] = await prisma.$queryRaw`
    SELECT razon_social as "razonSocial", ruc_emisor as "ruc", direccion_fiscal as "direccion",
      departamento, provincia, distrito
    FROM tbl_configuracion_sunat
    WHERE activo = true
    LIMIT 1
  `;
  const [sistema] = await prisma.$queryRaw`
    SELECT nombre_empresa as "nombreEmpresa", ruc, direccion
    FROM tbl_configuracion_sistema
    WHERE activo = true
    LIMIT 1
  `;
  return combinarDatosEmpresa(sunat, sistema);
};

const puntoDeViaje = (nombre, ciudad, direccion) =>
  (nombre ? { nombre, ciudad: ciudad ?? null, direccion: direccion ?? null } : null);

/**
 * Datos del viaje para la cabecera (los manifiestos antiguos los tienen en null)
 * @param {Object} fila - Columnas con alias de obtenerManifiesto
 * @returns {Object} { oficina, destino, fechaSalida, horaSalida, conductor, bus }
 */
const formatearViaje = (fila) => ({
  oficina: puntoDeViaje(fila.oficinaNombre, fila.oficinaCiudad, fila.oficinaDireccion),
  destino: puntoDeViaje(fila.destinoNombre, fila.destinoCiudad, fila.destinoDireccion),
  fechaSalida: fila.fechaSalida ?? null,
  horaSalida: fila.horaSalida ?? null,
  conductor: {
    nombre: fila.conductorNombre ?? null,
    licencia: fila.conductorLicencia ?? null
  },
  bus: {
    numeroInterno: fila.busNumeroInterno ?? null,
    placa: fila.busPlaca ?? null,
    marca: fila.busMarca ?? null,
    certificadoInscripcion: fila.busCertificadoInscripcion ?? null
  }
});

/**
 * Leer un registro activo de una lista del viaje dentro de la transacción
 * @returns {Promise<Object>} fila
 * @throws {ManifiestoError} si no existe o está inactivo
 */
const leerActivo = async (consulta, etiqueta) => {
  const [fila] = await consulta;
  if (!fila) {
    throw new ManifiestoError(`${etiqueta} seleccionado no existe o está inactivo`);
  }
  return fila;
};

/**
 * Crear un manifiesto con las encomiendas seleccionadas y los datos del viaje
 * @param {Object} params
 * @param {number[]} params.ids - Ids normalizados
 * @param {Object} params.viaje - Resultado de normalizarDatosViaje
 * @param {number} params.idUsuario - Usuario que genera
 * @param {number|null} params.idPuntoUsuario - Punto del usuario (null = sin punto)
 * @returns {Promise<number>} ID del manifiesto creado
 */
const crearManifiesto = async ({ ids, viaje, idUsuario, idPuntoUsuario }) => {
  try {
    return await prisma.$transaction(async (tx) => {
      // Bloquear las encomiendas: dos manifiestos simultáneos no pueden tomar las mismas
      const encomiendas = await tx.$queryRaw`
        SELECT
          e.id,
          e.codigo_tracking as "codigoTracking",
          e.estado_actual::text as "estadoActual",
          e.id_punto_origen as "idPuntoOrigen",
          e.id_punto_destino as "idPuntoDestino",
          mi.id_manifiesto as "idManifiesto"
        FROM tbl_encomiendas e
        LEFT JOIN tbl_manifiesto_encomienda_items mi ON mi.id_encomienda = e.id
        WHERE e.id = ANY(${ids})
        FOR UPDATE OF e
      `;

      const errorValidacion = validarEncomiendasParaManifiesto({
        ids,
        encomiendas,
        idPuntoUsuario,
        idPuntoDestino: viaje.idPuntoDestino
      });
      if (errorValidacion) {
        throw new ManifiestoError(errorValidacion.error, errorValidacion.status);
      }

      await leerActivo(
        tx.$queryRaw`SELECT id FROM tbl_puntos WHERE id = ${viaje.idPuntoDestino} AND estado = 1`,
        'El destino'
      );
      // Conductor y bus se copian: editar la lista después no cambia el manifiesto emitido
      const conductor = formatearConductor(await leerActivo(
        tx.$queryRaw`SELECT * FROM tbl_conductores WHERE id = ${viaje.idConductor} AND estado = 1`,
        'El conductor'
      ));
      const bus = formatearBus(await leerActivo(
        tx.$queryRaw`SELECT * FROM tbl_buses WHERE id = ${viaje.idBus} AND estado = 1`,
        'El bus'
      ));

      const [manifiesto] = await tx.$queryRaw`
        INSERT INTO tbl_manifiestos_encomienda (
          id_usuario_emision, user_id_registration,
          id_punto_origen, id_punto_destino, fecha_salida, hora_salida,
          conductor_nombre, conductor_licencia,
          bus_numero_interno, bus_placa, bus_marca, bus_certificado_inscripcion
        )
        VALUES (
          ${idUsuario}, ${idUsuario},
          ${encomiendas[0].idPuntoOrigen}, ${viaje.idPuntoDestino}, ${viaje.fechaSalida}::date, ${viaje.horaSalida}::time,
          ${conductor.nombreCompleto}, ${conductor.licencia},
          ${bus.numeroInterno}, ${bus.placa}, ${bus.marca}, ${bus.certificadoInscripcion}
        )
        RETURNING id
      `;

      // Ítems ordenados por destino y código: facilita la descarga en cada parada
      await tx.$executeRaw`
        INSERT INTO tbl_manifiesto_encomienda_items (id_manifiesto, id_encomienda, numero_item)
        SELECT ${manifiesto.id}, e.id, ROW_NUMBER() OVER (ORDER BY pd.nombre, e.codigo_tracking)
        FROM tbl_encomiendas e
        JOIN tbl_puntos pd ON pd.id = e.id_punto_destino
        WHERE e.id = ANY(${ids})
      `;

      return manifiesto.id;
    });
  } catch (error) {
    // Respaldo del UNIQUE(id_encomienda) ante una carrera que la validación no vio
    if (error.code === 'P2010' && error.meta?.code === '23505') {
      throw new ManifiestoError('Alguna de las encomiendas ya fue incluida en otro manifiesto. Recargue la lista e intente nuevamente.', 409);
    }
    throw error;
  }
};

/**
 * Obtener un manifiesto con todo lo necesario para el PDF
 * @param {number} id - ID del manifiesto
 * @param {number|null} idPuntoUsuario - Punto del usuario (null = sin punto)
 * @returns {Promise<Object|null>} null si no existe o no es visible para el usuario
 */
const obtenerManifiesto = async (id, idPuntoUsuario = null) => {
  const [manifiesto] = await prisma.$queryRaw`
    SELECT
      m.id,
      m.fecha_emision as "fechaEmision",
      u.nombres as "usuarioEmision",
      m.id_punto_origen as "idPuntoOrigen",
      po.nombre as "oficinaNombre",
      po.ciudad as "oficinaCiudad",
      po.direccion as "oficinaDireccion",
      pd.nombre as "destinoNombre",
      pd.ciudad as "destinoCiudad",
      pd.direccion as "destinoDireccion",
      m.fecha_salida as "fechaSalida",
      m.hora_salida as "horaSalida",
      m.conductor_nombre as "conductorNombre",
      m.conductor_licencia as "conductorLicencia",
      m.bus_numero_interno as "busNumeroInterno",
      m.bus_placa as "busPlaca",
      m.bus_marca as "busMarca",
      m.bus_certificado_inscripcion as "busCertificadoInscripcion"
    FROM tbl_manifiestos_encomienda m
    JOIN tbl_usuarios u ON u.id = m.id_usuario_emision
    LEFT JOIN tbl_puntos po ON po.id = m.id_punto_origen
    LEFT JOIN tbl_puntos pd ON pd.id = m.id_punto_destino
    WHERE m.id = ${id}
  `;

  if (!manifiesto || !esManifiestoVisible(idPuntoUsuario, manifiesto.idPuntoOrigen)) {
    return null;
  }

  const filas = await prisma.$queryRaw`
    SELECT
      mi.numero_item as "numeroItem",
      e.id,
      e.codigo_tracking as "codigoTracking",
      e.estado_actual::text as "estadoActual",
      e.remitente_nombre as "remitenteNombre",
      e.remitente_dni as "remitenteDni",
      e.remitente_telefono as "remitenteTelefono",
      e.destinatario_nombre as "destinatarioNombre",
      e.destinatario_dni as "destinatarioDni",
      e.destinatario_telefono as "destinatarioTelefono",
      e.tipo_paquete as "tipoPaquete",
      e.descripcion,
      e.peso,
      e.precio_calculado as "precioCalculado",
      e.precio_final as "precioFinal",
      COALESCE(e.pago_al_recojo, false) as "pagoAlRecojo",
      po.nombre as "puntoOrigen",
      pd.nombre as "puntoDestino"
    FROM tbl_manifiesto_encomienda_items mi
    JOIN tbl_encomiendas e ON e.id = mi.id_encomienda
    JOIN tbl_puntos po ON po.id = e.id_punto_origen
    JOIN tbl_puntos pd ON pd.id = e.id_punto_destino
    WHERE mi.id_manifiesto = ${id}
    ORDER BY mi.numero_item
  `;

  const encomiendas = filas.map(({ precioCalculado, precioFinal, peso, ...fila }) => ({
    ...fila,
    peso: aNumero(peso),
    flete: aNumero(precioFinal ?? precioCalculado)
  }));

  return {
    id: manifiesto.id,
    numeroCompleto: formatearNumeroManifiesto(manifiesto.id),
    fechaEmision: manifiesto.fechaEmision,
    usuarioEmision: manifiesto.usuarioEmision,
    empresa: await obtenerDatosEmpresa(),
    viaje: formatearViaje(manifiesto),
    resumen: calcularResumenManifiesto(filas),
    encomiendas
  };
};

/**
 * Listar manifiestos generados (más recientes primero)
 * @param {Object} params - { page, limit, idPuntoUsuario } (con punto: solo los que salen de él)
 * @returns {Promise<Object>} { manifiestos, pagination }
 */
const listarManifiestos = async ({ page = 1, limit = 20, idPuntoUsuario = null }) => {
  const offset = (page - 1) * limit;
  const filtroPunto = idPuntoUsuario
    ? Prisma.sql`WHERE m.id_punto_origen = ${idPuntoUsuario}`
    : Prisma.empty;

  const filas = await prisma.$queryRaw`
    SELECT
      m.id,
      m.fecha_emision as "fechaEmision",
      u.nombres as "usuarioEmision",
      po.nombre as "origen",
      pd.nombre as "destino",
      m.fecha_salida as "fechaSalida",
      m.hora_salida as "horaSalida",
      COUNT(mi.id)::int as "cantidad",
      COALESCE(SUM(COALESCE(e.precio_final, e.precio_calculado)), 0) as "fleteTotal"
    FROM tbl_manifiestos_encomienda m
    JOIN tbl_usuarios u ON u.id = m.id_usuario_emision
    LEFT JOIN tbl_puntos po ON po.id = m.id_punto_origen
    LEFT JOIN tbl_puntos pd ON pd.id = m.id_punto_destino
    LEFT JOIN tbl_manifiesto_encomienda_items mi ON mi.id_manifiesto = m.id
    LEFT JOIN tbl_encomiendas e ON e.id = mi.id_encomienda
    ${filtroPunto}
    GROUP BY m.id, u.nombres, po.nombre, pd.nombre
    ORDER BY m.id DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const [{ total }] = await prisma.$queryRaw`
    SELECT COUNT(*)::int as total FROM tbl_manifiestos_encomienda m ${filtroPunto}
  `;

  return {
    manifiestos: filas.map((m) => ({
      ...m,
      numeroCompleto: formatearNumeroManifiesto(m.id),
      fleteTotal: aNumero(m.fleteTotal)
    })),
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  };
};

/**
 * Manifiesto al que pertenece cada encomienda (para marcar el listado)
 * @param {number[]} idsEncomiendas
 * @param {number|null} idPuntoUsuario - Para indicar si el usuario puede descargarlo
 * @returns {Promise<Map<number, {id: number, numeroCompleto: string, descargable: boolean}>>}
 */
const obtenerManifiestosDeEncomiendas = async (idsEncomiendas, idPuntoUsuario = null) => {
  if (idsEncomiendas.length === 0) {
    return new Map();
  }

  const filas = await prisma.$queryRaw`
    SELECT mi.id_encomienda as "idEncomienda", mi.id_manifiesto as "idManifiesto", m.id_punto_origen as "idPuntoOrigen"
    FROM tbl_manifiesto_encomienda_items mi
    JOIN tbl_manifiestos_encomienda m ON m.id = mi.id_manifiesto
    WHERE mi.id_encomienda = ANY(${idsEncomiendas})
  `;

  return new Map(filas.map((f) => [
    f.idEncomienda,
    {
      id: f.idManifiesto,
      numeroCompleto: formatearNumeroManifiesto(f.idManifiesto),
      descargable: esManifiestoVisible(idPuntoUsuario, f.idPuntoOrigen)
    }
  ]));
};

module.exports = {
  ManifiestoError,
  formatearNumeroManifiesto,
  esManifiestoVisible,
  normalizarIdsEncomiendas,
  normalizarDatosViaje,
  validarEncomiendasParaManifiesto,
  calcularResumenManifiesto,
  combinarDatosEmpresa,
  formatearViaje,
  crearManifiesto,
  obtenerManifiesto,
  listarManifiestos,
  obtenerManifiestosDeEncomiendas
};
