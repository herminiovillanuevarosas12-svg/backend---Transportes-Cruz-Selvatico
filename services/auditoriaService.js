/**
 * Auditoria Service
 * Servicio para registro de auditoria
 */

const prisma = require('../config/prisma');

/**
 * Registrar evento de auditoria
 * @param {number|null} idUsuarioActor - ID del usuario que realiza la accion (null para acciones publicas)
 * @param {string} accion - Accion realizada
 * @param {string} tipoEntidad - Tipo de entidad afectada
 * @param {string|number} idEntidad - ID de la entidad afectada
 * @param {Object} payload - Datos adicionales
 */
const registrarAuditoria = async (idUsuarioActor, accion, tipoEntidad, idEntidad, payload = null) => {
  try {
    await prisma.logAuditoria.create({
      data: {
        idUsuarioActor: idUsuarioActor ? parseInt(idUsuarioActor) : null,
        accion,
        tipoEntidad,
        idEntidad: String(idEntidad),
        payloadJson: payload
      }
    });
  } catch (error) {
    // No fallar la operacion principal por error de auditoria
    console.error('Error registrando auditoria:', error);
  }
};

module.exports = {
  registrarAuditoria
};
