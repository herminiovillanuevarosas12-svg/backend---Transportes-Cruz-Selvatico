/**
 * Cliente de comprobante electrónico
 * Normaliza y valida los datos del cliente (tipo y número de documento,
 * nombre o razón social, dirección) antes de guardarlos en tbl_comprobantes
 * y de enviarlos a KEYFACIL (cliente_tipo, cliente_documento, cliente_nombre).
 *
 * Reglas:
 * - Factura (01): el cliente debe identificarse con RUC (tipo 6) de 11 dígitos.
 * - Boleta (03): DNI (1), carnet de extranjería (4) o RUC (6) con el formato del catálogo.
 * - El nombre o razón social es obligatorio; se recortan espacios repetidos y se limita
 *   al tamaño de la columna.
 */

const {
  CODIGO_RUC,
  esTipoDocumentoValido,
  esDocumentoValido,
  mensajeErrorDocumento
} = require('./documentoIdentidad');

const MAX_RAZON_SOCIAL = 200; // tbl_comprobantes.cliente_razon_social VARCHAR(200)
const MAX_DIRECCION = 300;    // tbl_comprobantes.cliente_direccion VARCHAR(300)

const limpiarTexto = (valor) => String(valor ?? '').replace(/\s+/g, ' ').trim();

/**
 * @param {Object} cliente - { tipoDoc, numDoc, razonSocial, direccion }
 * @param {string} tipoComprobante - '01' factura | '03' boleta
 * @returns {{ tipoDoc: string, numDoc: string, razonSocial: string, direccion: string }}
 * @throws {Error} con mensaje legible cuando los datos no son válidos
 */
const normalizarClienteComprobante = (cliente, tipoComprobante) => {
  if (!cliente || typeof cliente !== 'object') {
    throw new Error('Se requieren los datos del cliente');
  }

  const tipoDoc = String(cliente.tipoDoc ?? '').trim();
  const numDoc = String(cliente.numDoc ?? '').replace(/\s+/g, '').toUpperCase();
  const razonSocial = limpiarTexto(cliente.razonSocial);
  const direccion = limpiarTexto(cliente.direccion).slice(0, MAX_DIRECCION);

  if (!esTipoDocumentoValido(tipoDoc)) {
    throw new Error('Tipo de documento del cliente inválido. Use 1 (DNI), 4 (Carnet de extranjería) o 6 (RUC)');
  }

  if (tipoComprobante === '01' && tipoDoc !== CODIGO_RUC) {
    throw new Error('Para facturas se requiere RUC (tipo documento 6)');
  }

  if (!esDocumentoValido(tipoDoc, numDoc)) {
    throw new Error(mensajeErrorDocumento(tipoDoc, 'cliente'));
  }

  if (!razonSocial) {
    throw new Error(tipoDoc === CODIGO_RUC
      ? 'La razón social del cliente es requerida'
      : 'El nombre completo del cliente es requerido');
  }

  return {
    tipoDoc,
    numDoc,
    razonSocial: razonSocial.slice(0, MAX_RAZON_SOCIAL),
    direccion
  };
};

module.exports = {
  normalizarClienteComprobante,
  MAX_RAZON_SOCIAL,
  MAX_DIRECCION
};
