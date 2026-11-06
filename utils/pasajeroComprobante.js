/**
 * Pasajero de un comprobante emitido manualmente (Facturación → Emitir Factura/Boleta)
 *
 * Es opcional: se envían nombre, documento y teléfono completos o ninguno.
 * Cuando viene, se registra en tbl_pasajeros y su nombre se imprime como "USUARIO"
 * en el ticket de KEYFACIL.
 */

const { validarDocumento } = require('./documentoIdentidad');

const MAX_NOMBRE = 150; // tbl_pasajeros.nombre_completo VARCHAR(150)

const limpiarTexto = (valor) => String(valor ?? '').replace(/\s+/g, ' ').trim();

/**
 * @param {Object|null} pasajero - { tipoDocumento, documentoIdentidad, nombreCompleto, telefono }
 * @returns {{ tipoDocumento: string, documentoIdentidad: string, nombreCompleto: string, telefono: string }|null}
 *          null cuando no se envió pasajero
 * @throws {Error} con mensaje legible cuando los datos están incompletos o no son válidos
 */
const normalizarPasajeroComprobante = (pasajero) => {
  if (!pasajero || typeof pasajero !== 'object') return null;

  const nombreCompleto = limpiarTexto(pasajero.nombreCompleto).slice(0, MAX_NOMBRE);
  const documento = String(pasajero.documentoIdentidad ?? '').trim();
  const telefono = String(pasajero.telefono ?? '').replace(/\D/g, '');

  if (!nombreCompleto && !documento && !telefono) return null;

  if (!nombreCompleto || !documento || !telefono) {
    throw new Error('Complete nombre, documento y teléfono del pasajero, o deje los tres vacíos para emitir sin pasajero');
  }

  const doc = validarDocumento({ tipo: pasajero.tipoDocumento, numero: documento, rol: 'pasajero' });
  if (doc.error) throw new Error(doc.error);

  if (!/^\d{9}$/.test(telefono)) {
    throw new Error('El teléfono del pasajero debe tener 9 dígitos');
  }

  return {
    tipoDocumento: doc.tipo,
    documentoIdentidad: doc.numero,
    nombreCompleto,
    telefono
  };
};

module.exports = {
  normalizarPasajeroComprobante
};
