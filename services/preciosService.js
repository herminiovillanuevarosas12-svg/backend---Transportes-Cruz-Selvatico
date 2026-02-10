/**
 * Precios Service
 * Servicio para calculo de precios
 */

const prisma = require('../config/prisma');

/**
 * Calcular precio de encomienda
 * Formula: precio_base_seleccionado + (peso * precio_por_kg) + (volumen * precio_por_cm3)
 * donde volumen = alto * ancho * largo
 *
 * @param {number} peso - Peso en kg
 * @param {number} alto - Alto en cm
 * @param {number} ancho - Ancho en cm
 * @param {number} largo - Largo en cm
 * @param {number} idPrecioBase - ID del precio base seleccionado
 * @returns {Promise<{precio: number, precioBase: object}|null>} Precio calculado o null si no hay config
 */
const calcularPrecioEncomienda = async (peso, alto, ancho, largo, idPrecioBase) => {
  try {
    // Obtener configuracion de precios por kg/cm3
    const config = await prisma.configuracionPreciosEncomienda.findFirst({
      where: { activo: true }
    });

    if (!config) {
      return null;
    }

    // Obtener precio base seleccionado
    const precioBaseRows = await prisma.$queryRaw`
      SELECT id, nombre, monto FROM tbl_precios_base_encomienda
      WHERE id = ${parseInt(idPrecioBase)} AND activo = true
    `;

    if (!precioBaseRows || precioBaseRows.length === 0) {
      return null;
    }

    const precioBase = precioBaseRows[0];
    const volumen = alto * ancho * largo;

    const precio =
      parseFloat(precioBase.monto) +
      (parseFloat(peso) * parseFloat(config.precioPorKg)) +
      (volumen * parseFloat(config.precioPorCm3));

    return {
      precio: Math.round(precio * 100) / 100,
      precioBase
    };
  } catch (error) {
    console.error('Error calculando precio:', error);
    throw error;
  }
};

module.exports = {
  calcularPrecioEncomienda
};
