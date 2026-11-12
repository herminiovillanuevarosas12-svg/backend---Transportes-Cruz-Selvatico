/**
 * Codigo Service
 * Servicio para generacion de codigos unicos
 */

const { getFechaPeruYYYYMMDD } = require('../utils/dateUtils');

/**
 * Generar codigo de ticket
 * Formato: TKT-YYYYMMDD-NNNNN
 * @param {PrismaClient} tx - Cliente Prisma (transaccion)
 * @returns {Promise<string>} Codigo generado
 */
const generarCodigoTicket = async (tx) => {
  // Usar zona horaria Peru (UTC-5) para la fecha
  const fecha = getFechaPeruYYYYMMDD();

  // Obtener el ultimo ticket del dia
  const ultimoTicket = await tx.ticket.findFirst({
    where: {
      codigoInterno: {
        startsWith: `TKT-${fecha}`
      }
    },
    orderBy: {
      codigoInterno: 'desc'
    }
  });

  let secuencial = 1;
  if (ultimoTicket) {
    const partes = ultimoTicket.codigoInterno.split('-');
    secuencial = parseInt(partes[2]) + 1;
  }

  return `TKT-${fecha}-${String(secuencial).padStart(5, '0')}`;
};

/**
 * Generar codigo de tracking para encomienda
 * Formato: ENC-NNNNNNNN (correlativo global de 8 digitos)
 * @param {PrismaClient} tx - Cliente Prisma (transaccion)
 * @returns {Promise<string>} Codigo generado
 */
const generarCodigoTracking = async (tx) => {
  // Buscar el ultimo correlativo con el nuevo formato ENC-NNNNNNNN
  // Se filtra por regex para ignorar encomiendas con el formato antiguo ENC-YYYYMMDD-NNNNN
  const resultado = await tx.$queryRaw`
    SELECT codigo_tracking
    FROM tbl_encomiendas
    WHERE codigo_tracking ~ '^ENC-[0-9]{8}$'
    ORDER BY codigo_tracking DESC
    LIMIT 1
  `;

  let secuencial = 1;
  if (resultado && resultado.length > 0) {
    const partes = resultado[0].codigo_tracking.split('-');
    secuencial = parseInt(partes[1], 10) + 1;
  }

  return `ENC-${String(secuencial).padStart(8, '0')}`;
};

/**
 * Normalizar un codigo de tracking ingresado por el usuario
 * Acepta solo numeros ("245"), prefijo incompleto ("ENC-245", "enc245")
 * o el codigo completo, y devuelve siempre ENC-NNNNNNNN.
 * El formato antiguo ENC-YYYYMMDD-NNNNN y cualquier otra cadena se devuelven sin cambios.
 * @param {string} entrada - Texto ingresado
 * @returns {string} Codigo normalizado (cadena vacia si la entrada es vacia)
 */
const normalizarCodigoTracking = (entrada) => {
  if (!entrada) return '';

  const limpio = String(entrada).trim().toUpperCase();
  if (!limpio) return '';

  const coincidencia = limpio.match(/^(?:ENC-?)?(\d{1,8})$/);
  if (!coincidencia) return limpio;

  return `ENC-${coincidencia[1].padStart(8, '0')}`;
};

// El codigo de rastreo lo genera la BD (fn_generar_codigo_rastreo, DEFAULT de
// tbl_encomiendas.codigo_rastreo): 6 caracteres en mayuscula que mezclan letras,
// numeros y simbolos. Ver scripts/codigo_rastreo_encomiendas.sql
const LONGITUD_CODIGO_RASTREO = 6;

/**
 * Normalizar un codigo de rastreo ingresado por el usuario
 * Quita espacios y pasa a mayusculas (los codigos se generan en mayuscula).
 * @param {string} entrada - Texto ingresado
 * @returns {string} Codigo normalizado, o cadena vacia si no tiene 6 caracteres
 */
const normalizarCodigoRastreo = (entrada) => {
  if (!entrada) return '';

  const limpio = String(entrada).replace(/\s+/g, '').toUpperCase();
  return limpio.length === LONGITUD_CODIGO_RASTREO ? limpio : '';
};

module.exports = {
  generarCodigoTicket,
  generarCodigoTracking,
  normalizarCodigoTracking,
  normalizarCodigoRastreo
};
