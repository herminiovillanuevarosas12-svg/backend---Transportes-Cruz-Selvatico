/**
 * Manifiesto de Encomiendas Service
 * Documento interno que agrupa encomiendas "En ruta" (no se envía a SUNAT).
 * Una encomienda solo puede pertenecer a un manifiesto: lo garantiza el UNIQUE
 * de tbl_manifiesto_encomienda_items.id_encomienda.
 */

const prisma = require('../config/prisma');

class ManifiestoError extends Error {
  constructor(mensaje, status = 400) {
    super(mensaje);
    this.name = 'ManifiestoError';
    this.status = status;
  }
}

const redondear = (valor) => Math.round(valor * 100) / 100;

const aNumero = (valor) => parseFloat(valor ?? 0) || 0;

/**
 * Formato visible del número de manifiesto (correlativo = id)
 * @param {number} id - ID del manifiesto
 * @returns {string} Ej: 'MAN-000013'
 */
const formatearNumeroManifiesto = (id) => `MAN-${String(id).padStart(6, '0')}`;

/**
 * Validar y normalizar los ids de encomiendas seleccionadas
 * @param {Array} ids - Ids recibidos en el body
 * @returns {{ids: number[]} | {error: string}}
 */
const normalizarIdsEncomiendas = (ids) => {
  if (!Array.isArray(ids) || ids.length === 0) {
    return { error: 'Seleccione al menos una encomienda para el manifiesto' };
  }

  const numeros = ids.map((id) => (id === null || id === '' ? NaN : Number(id)));
  if (numeros.some((id) => !Number.isInteger(id) || id <= 0)) {
    return { error: 'La selección contiene identificadores de encomienda no válidos' };
  }

  return { ids: [...new Set(numeros)] };
};

/**
 * Verificar que las encomiendas puedan incluirse en un nuevo manifiesto
 * @param {Object} params
 * @param {number[]} params.ids - Ids solicitados (ya normalizados)
 * @param {Object[]} params.encomiendas - Filas encontradas en BD
 * @param {number|null} params.idPuntoUsuario - Punto del usuario (null = superadmin)
 * @returns {null | {status: number, error: string}} null si la selección es válida
 */
const validarEncomiendasParaManifiesto = ({ ids, encomiendas, idPuntoUsuario }) => {
  const encontrados = new Set(encomiendas.map((e) => e.id));
  const faltantes = ids.filter((id) => !encontrados.has(id));
  if (faltantes.length > 0) {
    return { status: 404, error: `Encomiendas no encontradas (id): ${faltantes.join(', ')}` };
  }

  const noEnRuta = encomiendas.filter((e) => e.estadoActual !== 'EN_RUTA');
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

  if (idPuntoUsuario) {
    const ajenas = encomiendas.filter(
      (e) => e.idPuntoOrigen !== idPuntoUsuario && e.idPuntoDestino !== idPuntoUsuario
    );
    if (ajenas.length > 0) {
      return {
        status: 403,
        error: `Estas encomiendas no pertenecen a su punto de operación: ${ajenas.map((e) => e.codigoTracking).join(', ')}`
      };
    }
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
 * y, en su defecto, los de la configuración del sistema (de donde sale el teléfono)
 * @param {Object|null} sunat - { razonSocial, ruc, direccion }
 * @param {Object|null} sistema - { nombreEmpresa, ruc, direccion, telefono }
 * @returns {Object} { razonSocial, ruc, direccion, telefono }
 */
const combinarDatosEmpresa = (sunat, sistema) => ({
  razonSocial: sunat?.razonSocial || sistema?.nombreEmpresa || null,
  ruc: sunat?.ruc || sistema?.ruc || null,
  direccion: sunat?.direccion || sistema?.direccion || null,
  telefono: sistema?.telefono || null
});

const obtenerDatosEmpresa = async () => {
  const [sunat] = await prisma.$queryRaw`
    SELECT razon_social as "razonSocial", ruc_emisor as "ruc", direccion_fiscal as "direccion"
    FROM tbl_configuracion_sunat
    WHERE activo = true
    LIMIT 1
  `;
  const [sistema] = await prisma.$queryRaw`
    SELECT nombre_empresa as "nombreEmpresa", ruc, direccion, telefono
    FROM tbl_configuracion_sistema
    WHERE activo = true
    LIMIT 1
  `;
  return combinarDatosEmpresa(sunat, sistema);
};

/**
 * Crear un manifiesto con las encomiendas seleccionadas
 * @param {Object} params
 * @param {number[]} params.ids - Ids normalizados
 * @param {number} params.idUsuario - Usuario que genera
 * @param {number|null} params.idPuntoUsuario - Punto del usuario (null = superadmin)
 * @returns {Promise<number>} ID del manifiesto creado
 */
const crearManifiesto = async ({ ids, idUsuario, idPuntoUsuario }) => {
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

      const errorValidacion = validarEncomiendasParaManifiesto({ ids, encomiendas, idPuntoUsuario });
      if (errorValidacion) {
        throw new ManifiestoError(errorValidacion.error, errorValidacion.status);
      }

      const [manifiesto] = await tx.$queryRaw`
        INSERT INTO tbl_manifiestos_encomienda (id_usuario_emision, user_id_registration)
        VALUES (${idUsuario}, ${idUsuario})
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
 * @returns {Promise<Object|null>}
 */
const obtenerManifiesto = async (id) => {
  const [manifiesto] = await prisma.$queryRaw`
    SELECT m.id, m.fecha_emision as "fechaEmision", u.nombres as "usuarioEmision"
    FROM tbl_manifiestos_encomienda m
    JOIN tbl_usuarios u ON u.id = m.id_usuario_emision
    WHERE m.id = ${id}
  `;

  if (!manifiesto) {
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
    resumen: calcularResumenManifiesto(filas),
    encomiendas
  };
};

/**
 * Listar manifiestos generados (más recientes primero)
 * @param {Object} params - { page, limit }
 * @returns {Promise<Object>} { manifiestos, pagination }
 */
const listarManifiestos = async ({ page = 1, limit = 20 }) => {
  const offset = (page - 1) * limit;

  const filas = await prisma.$queryRaw`
    SELECT
      m.id,
      m.fecha_emision as "fechaEmision",
      u.nombres as "usuarioEmision",
      COUNT(mi.id)::int as "cantidad",
      COALESCE(SUM(COALESCE(e.precio_final, e.precio_calculado)), 0) as "fleteTotal"
    FROM tbl_manifiestos_encomienda m
    JOIN tbl_usuarios u ON u.id = m.id_usuario_emision
    LEFT JOIN tbl_manifiesto_encomienda_items mi ON mi.id_manifiesto = m.id
    LEFT JOIN tbl_encomiendas e ON e.id = mi.id_encomienda
    GROUP BY m.id, u.nombres
    ORDER BY m.id DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const [{ total }] = await prisma.$queryRaw`
    SELECT COUNT(*)::int as total FROM tbl_manifiestos_encomienda
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
 * @returns {Promise<Map<number, {id: number, numeroCompleto: string}>>}
 */
const obtenerManifiestosDeEncomiendas = async (idsEncomiendas) => {
  if (idsEncomiendas.length === 0) {
    return new Map();
  }

  const filas = await prisma.$queryRaw`
    SELECT id_encomienda as "idEncomienda", id_manifiesto as "idManifiesto"
    FROM tbl_manifiesto_encomienda_items
    WHERE id_encomienda = ANY(${idsEncomiendas})
  `;

  return new Map(filas.map((f) => [
    f.idEncomienda,
    { id: f.idManifiesto, numeroCompleto: formatearNumeroManifiesto(f.idManifiesto) }
  ]));
};

module.exports = {
  ManifiestoError,
  formatearNumeroManifiesto,
  normalizarIdsEncomiendas,
  validarEncomiendasParaManifiesto,
  calcularResumenManifiesto,
  combinarDatosEmpresa,
  crearManifiesto,
  obtenerManifiesto,
  listarManifiestos,
  obtenerManifiestosDeEncomiendas
};
