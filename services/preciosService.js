/**
 * Precios Service
 * Servicio para calculo de precios
 */

const prisma = require('../config/prisma');

/**
 * Calcular precio de encomienda
 * Formula: tarifa_base + (peso * precio_por_kg) + (volumen * precio_por_cm3)
 * donde volumen = alto * ancho * largo
 *
 * @param {number} peso - Peso en kg
 * @param {number} alto - Alto en cm
 * @param {number} ancho - Ancho en cm
 * @param {number} largo - Largo en cm
 * @returns {Promise<number|null>} Precio calculado o null si no hay config
 */
const calcularPrecioEncomienda = async (peso, alto, ancho, largo) => {
  try {
    // Obtener configuracion activa
    const config = await prisma.configuracionPreciosEncomienda.findFirst({
      where: { activo: true }
    });

    if (!config) {
      return null;
    }

    const volumen = alto * ancho * largo; // cm3

    const precio =
      parseFloat(config.tarifaBase) +
      (parseFloat(peso) * parseFloat(config.precioPorKg)) +
      (volumen * parseFloat(config.precioPorCm3));

    // Redondear a 2 decimales
    return Math.round(precio * 100) / 100;
  } catch (error) {
    console.error('Error calculando precio:', error);
    throw error;
  }
};

module.exports = {
  calcularPrecioEncomienda
};
