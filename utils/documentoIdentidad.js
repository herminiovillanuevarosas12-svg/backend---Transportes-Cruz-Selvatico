/**
 * Documento de identidad
 * Catálogo SUNAT (tabla 06) de los tipos de documento que acepta el sistema
 * y reglas de formato para validar el número recibido del frontend.
 *
 * Mismo catálogo que el frontend (src/utils/documentoIdentidad.js).
 */

const CODIGO_DNI = '1';
const CODIGO_CE = '4';
const CODIGO_RUC = '6';

const TIPOS_DOCUMENTO = Object.freeze([
  { codigo: CODIGO_DNI, sigla: 'DNI', nombre: 'DNI', minimo: 8, maximo: 8, alfanumerico: false },
  { codigo: CODIGO_CE, sigla: 'CE', nombre: 'Carnet de extranjería', minimo: 9, maximo: 12, alfanumerico: true },
  { codigo: CODIGO_RUC, sigla: 'RUC', nombre: 'RUC', minimo: 11, maximo: 11, alfanumerico: false }
]);

// Para deducir el tipo se prueban primero los numéricos (DNI, RUC) porque
// el patrón alfanumérico del CE también acepta un número de 11 dígitos.
const ORDEN_DETECCION = [
  ...TIPOS_DOCUMENTO.filter(t => !t.alfanumerico),
  ...TIPOS_DOCUMENTO.filter(t => t.alfanumerico)
];

const obtenerTipoDocumento = (codigo) => TIPOS_DOCUMENTO.find(t => t.codigo === String(codigo));

const patronDe = (tipo) =>
  new RegExp(`^${tipo.alfanumerico ? '[A-Z0-9]' : '\\d'}{${tipo.minimo},${tipo.maximo}}$`);

const esTipoDocumentoValido = (codigo) => Boolean(obtenerTipoDocumento(codigo));

const esDocumentoValido = (codigo, numero) => {
  if (!numero) return false;
  const tipo = obtenerTipoDocumento(codigo);
  if (!tipo) return false;
  return patronDe(tipo).test(String(numero));
};

/**
 * Deduce el tipo cuando el cliente no lo envía. Si no encaja con ninguno, DNI.
 */
const detectarTipoDocumento = (numero = '') => {
  const tipo = ORDEN_DETECCION.find(t => esDocumentoValido(t.codigo, numero));
  return tipo ? tipo.codigo : CODIGO_DNI;
};

const mensajeErrorDocumento = (codigo, rol) => {
  const tipo = obtenerTipoDocumento(codigo);
  if (!tipo) return `El tipo de documento del ${rol} no es válido`;
  const regla = tipo.minimo === tipo.maximo
    ? `${tipo.maximo} ${tipo.alfanumerico ? 'caracteres' : 'dígitos'}`
    : `entre ${tipo.minimo} y ${tipo.maximo} caracteres alfanuméricos`;
  return `El ${tipo.nombre} del ${rol} debe tener ${regla}`;
};

module.exports = {
  CODIGO_DNI,
  CODIGO_CE,
  CODIGO_RUC,
  TIPOS_DOCUMENTO,
  obtenerTipoDocumento,
  esTipoDocumentoValido,
  esDocumentoValido,
  detectarTipoDocumento,
  mensajeErrorDocumento
};
