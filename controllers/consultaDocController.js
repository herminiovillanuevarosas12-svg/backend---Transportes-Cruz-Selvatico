/**
 * Consulta Documento Controller
 * Controlador para consultas de DNI y RUC via apiperu.dev
 * Endpoints publicos (solo requieren autenticacion, sin permiso especifico)
 */

const apiPeruService = require('../services/apiPeruService');

/**
 * Consultar DNI
 * GET /api/consulta-doc/dni/:dni
 */
const consultarDni = async (req, res) => {
  try {
    const { dni } = req.params;

    // Validar formato basico
    if (!dni || dni.length !== 8) {
      return res.status(400).json({
        success: false,
        error: 'DNI inválido. Debe tener exactamente 8 dígitos.'
      });
    }

    // Validar que sean solo numeros
    if (!/^\d{8}$/.test(dni)) {
      return res.status(400).json({
        success: false,
        error: 'DNI inválido. Solo debe contener números.'
      });
    }

    const resultado = await apiPeruService.consultarDni(dni);

    if (resultado.success) {
      return res.json({
        success: true,
        data: resultado.data,
        source: resultado.source
      });
    }

    return res.status(404).json({
      success: false,
      error: resultado.message || 'No se encontraron datos para el DNI proporcionado'
    });
  } catch (error) {
    console.error('Error consultando DNI:', error);
    return res.status(500).json({
      success: false,
      error: 'Error interno al consultar DNI'
    });
  }
};

/**
 * Consultar RUC
 * GET /api/consulta-doc/ruc/:ruc
 */
const consultarRuc = async (req, res) => {
  try {
    const { ruc } = req.params;

    // Validar formato basico
    if (!ruc || ruc.length !== 11) {
      return res.status(400).json({
        success: false,
        error: 'RUC inválido. Debe tener exactamente 11 dígitos.'
      });
    }

    // Validar que sean solo numeros
    if (!/^\d{11}$/.test(ruc)) {
      return res.status(400).json({
        success: false,
        error: 'RUC inválido. Solo debe contener números.'
      });
    }

    const resultado = await apiPeruService.consultarRuc(ruc);

    if (resultado.success) {
      return res.json({
        success: true,
        data: resultado.data,
        source: resultado.source
      });
    }

    return res.status(404).json({
      success: false,
      error: resultado.message || 'No se encontraron datos para el RUC proporcionado'
    });
  } catch (error) {
    console.error('Error consultando RUC:', error);
    return res.status(500).json({
      success: false,
      error: 'Error interno al consultar RUC'
    });
  }
};

module.exports = {
  consultarDni,
  consultarRuc
};
