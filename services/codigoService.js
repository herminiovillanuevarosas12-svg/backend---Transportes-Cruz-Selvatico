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
 * Formato: ENC-YYYYMMDD-NNNNN
 * @param {PrismaClient} tx - Cliente Prisma (transaccion)
 * @returns {Promise<string>} Codigo generado
 */
const generarCodigoTracking = async (tx) => {
  // Usar zona horaria Peru (UTC-5) para la fecha
  const fecha = getFechaPeruYYYYMMDD();

  // Obtener la ultima encomienda del dia
  const ultimaEncomienda = await tx.encomienda.findFirst({
    where: {
      codigoTracking: {
        startsWith: `ENC-${fecha}`
      }
    },
    orderBy: {
      codigoTracking: 'desc'
    }
  });

  let secuencial = 1;
  if (ultimaEncomienda) {
    const partes = ultimaEncomienda.codigoTracking.split('-');
    secuencial = parseInt(partes[2]) + 1;
  }

  return `ENC-${fecha}-${String(secuencial).padStart(5, '0')}`;
};

module.exports = {
  generarCodigoTicket,
  generarCodigoTracking
};
