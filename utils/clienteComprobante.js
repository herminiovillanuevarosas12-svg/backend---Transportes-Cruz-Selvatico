/**
 * Cliente de comprobante electrónico
 * Normaliza y valida los datos del cliente (tipo y número de documento,
 * nombre o razón social, dirección) antes de guardarlos en tbl_comprobantes
 * y de enviarlos a KEYFACIL (cliente_tipo, cliente_documento, cliente_nombre).
 *
 * Reglas:
 * - Factura (01): el cliente debe identificarse con RUC (tipo 6) de 11 dígitos.
 * - Boleta (03): DNI (1), carnet de extranjería (4) o RUC (6) con el formato del catálogo,
 *   o "Sin documento" (tipo "-", VARIOS en la tabla de KEYFACIL) si el total no pasa de S/ 700.
 * - El nombre o razón social es obligatorio; se recortan espacios repetidos y se limita
 *   al tamaño de la columna. Sin documento, si no se escribe, va "CLIENTES VARIOS".
 */

const {
  CODIGO_RUC,
  esTipoDocumentoValido,
  esDocumentoValido,
  mensajeErrorDocumento
} = require('./documentoIdentidad');

const MAX_RAZON_SOCIAL = 200; // tbl_comprobantes.cliente_razon_social VARCHAR(200)
const MAX_DIRECCION = 300;    // tbl_comprobantes.cliente_direccion VARCHAR(300)

// Tabla "TIPOS DE CLIENTE" del manual KEYFACIL: "- VARIOS - VENTAS MENORES A S/.700.00 Y OTROS"
const CODIGO_SIN_DOCUMENTO = '-';
// El manual no documenta qué número espera para VARIOS: se envía el mismo guion.
// Si KEYFACIL lo rechazara, este es el único valor a cambiar (el frontend no lo envía).
const NUMERO_SIN_DOCUMENTO = '-';
const NOMBRE_SIN_DOCUMENTO = 'CLIENTES VARIOS';
// SUNAT: si el total de la boleta supera S/ 700 se debe identificar al adquirente
const MONTO_MAXIMO_SIN_DOCUMENTO = 700;

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

  if (tipoDoc === CODIGO_SIN_DOCUMENTO) {
    if (tipoComprobante !== '03') {
      throw new Error('Solo las boletas se pueden emitir sin documento del cliente');
    }
    return {
      tipoDoc,
      numDoc: NUMERO_SIN_DOCUMENTO,
      razonSocial: (razonSocial || NOMBRE_SIN_DOCUMENTO).slice(0, MAX_RAZON_SOCIAL),
      direccion
    };
  }

  if (!esTipoDocumentoValido(tipoDoc)) {
    throw new Error('Tipo de documento del cliente inválido. Use 1 (DNI), 4 (Carnet de extranjería), 6 (RUC) o "-" (sin documento, solo boletas)');
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

/**
 * Una boleta sin documento solo es válida hasta S/ 700 (total con IGV).
 * @param {{ tipoDoc: string }} cliente - cliente ya normalizado
 * @param {number} total - total del comprobante
 * @throws {Error} si el cliente no tiene documento y el total supera el máximo
 */
const validarMontoClienteSinDocumento = (cliente, total) => {
  if (cliente?.tipoDoc === CODIGO_SIN_DOCUMENTO && Number(total) > MONTO_MAXIMO_SIN_DOCUMENTO) {
    throw new Error(`Las boletas mayores a S/ ${MONTO_MAXIMO_SIN_DOCUMENTO} deben identificar al cliente con DNI, carnet de extranjería o RUC`);
  }
};

/**
 * Cliente de boleta elegido en la sección "Datos del cliente" del formulario.
 * Se valida antes de registrar la venta para no dejar un pasaje o encomienda sin comprobante.
 * Devuelve null si no se envió (versión anterior del frontend): en ese caso cada flujo usa su
 * cliente por defecto (pasajero, remitente o quien retira).
 * @param {Object|undefined|null} clienteBoleta - { tipoDoc, numDoc, razonSocial, direccion }
 * @returns {Object|null} cliente normalizado para emitirComprobante
 * @throws {Error} si los datos enviados no son válidos
 */
const normalizarClienteBoletaElegido = (clienteBoleta) =>
  clienteBoleta ? normalizarClienteComprobante(clienteBoleta, '03') : null;

module.exports = {
  normalizarClienteComprobante,
  validarMontoClienteSinDocumento,
  normalizarClienteBoletaElegido,
  CODIGO_SIN_DOCUMENTO,
  NUMERO_SIN_DOCUMENTO,
  NOMBRE_SIN_DOCUMENTO,
  MONTO_MAXIMO_SIN_DOCUMENTO,
  MAX_RAZON_SOCIAL,
  MAX_DIRECCION
};
