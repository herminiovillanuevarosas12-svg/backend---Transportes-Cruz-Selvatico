/**
 * Flota Service
 * Validación y formato de las listas de conductores y buses
 * que se eligen al generar el manifiesto de encomiendas.
 */

const { CODIGO_DNI, CODIGO_CE, validarDocumento } = require('../utils/documentoIdentidad');

// El conductor es una persona: DNI o carnet de extranjería
const TIPOS_DOCUMENTO_CONDUCTOR = [CODIGO_DNI, CODIGO_CE];

/**
 * Normalizar los campos de texto según su definición
 * @param {Object} body - Datos recibidos
 * @param {Array<{campo: string, etiqueta: string, maximo: number, mayusculas?: boolean}>} campos
 * @returns {{datos: Object} | {error: string}}
 */
const normalizarCampos = (body, campos) => {
  const datos = {};
  for (const { campo, etiqueta, maximo, mayusculas } of campos) {
    const valor = String(body?.[campo] ?? '').trim();
    if (!valor) {
      return { error: `${etiqueta} es requerido` };
    }
    if (valor.length > maximo) {
      return { error: `${etiqueta} admite como máximo ${maximo} caracteres` };
    }
    datos[campo] = mayusculas ? valor.toUpperCase() : valor;
  }
  return { datos };
};

/**
 * @param {Object} body - { tipoDocumento, numeroDocumento, nombres, apellidos, licencia }
 * @returns {{datos: Object} | {error: string}}
 */
const normalizarConductor = (body) => {
  const documento = validarDocumento({ tipo: body?.tipoDocumento, numero: body?.numeroDocumento, rol: 'conductor' });
  if (documento.error) {
    return { error: documento.error };
  }
  if (!TIPOS_DOCUMENTO_CONDUCTOR.includes(documento.tipo)) {
    return { error: 'El documento del conductor debe ser DNI o carnet de extranjería' };
  }

  const { datos, error } = normalizarCampos(body, [
    { campo: 'nombres', etiqueta: 'Los nombres', maximo: 150 },
    { campo: 'apellidos', etiqueta: 'Los apellidos', maximo: 150 },
    { campo: 'licencia', etiqueta: 'La licencia', maximo: 20, mayusculas: true }
  ]);
  if (error) {
    return { error };
  }

  return {
    datos: {
      tipoDocumento: documento.tipo,
      numeroDocumento: documento.numero,
      ...datos
    }
  };
};

/**
 * @param {Object} body - { idTipoCarro, numeroInterno, placa, marca, certificadoInscripcion }
 * @returns {{datos: Object} | {error: string}}
 */
const normalizarBus = (body) => {
  // Uno de los tipos de carro registrados; el controlador verifica que siga activo
  const idTipoCarro = Number(body?.idTipoCarro);
  if (!body?.idTipoCarro || !Number.isInteger(idTipoCarro) || idTipoCarro <= 0) {
    return { error: 'Seleccione el tipo de vehículo' };
  }

  const { datos, error } = normalizarCampos(body, [
    { campo: 'numeroInterno', etiqueta: 'El número del bus', maximo: 20 },
    { campo: 'placa', etiqueta: 'La placa', maximo: 10, mayusculas: true },
    { campo: 'marca', etiqueta: 'La marca', maximo: 50 },
    { campo: 'certificadoInscripcion', etiqueta: 'El certificado de inscripción', maximo: 30, mayusculas: true }
  ]);
  if (error) {
    return { error };
  }

  return { datos: { idTipoCarro, ...datos } };
};

/**
 * Datos normalizados (camelCase) a columnas de la tabla (snake_case)
 * @param {Object} datos
 * @returns {Object}
 */
const aColumnas = (datos) => Object.fromEntries(
  Object.entries(datos).map(([campo, valor]) => [campo.replace(/[A-Z]/g, (letra) => `_${letra.toLowerCase()}`), valor])
);

const formatearConductor = (fila) => ({
  id: fila.id,
  tipoDocumento: fila.tipo_documento,
  numeroDocumento: fila.numero_documento,
  nombres: fila.nombres,
  apellidos: fila.apellidos,
  nombreCompleto: `${fila.nombres} ${fila.apellidos}`,
  licencia: fila.licencia,
  estado: fila.estado
});

// tipoCarro solo viene si la fila incluye la relación tbl_tipos_carro (listado y CRUD);
// la copia al manifiesto lee la fila con SQL directo y no lo necesita
const formatearBus = (fila) => ({
  id: fila.id,
  idTipoCarro: fila.id_tipo_carro,
  tipoCarro: fila.tbl_tipos_carro?.nombre ?? null,
  numeroInterno: fila.numero_interno,
  placa: fila.placa,
  marca: fila.marca,
  certificadoInscripcion: fila.certificado_inscripcion,
  estado: fila.estado
});

module.exports = {
  normalizarConductor,
  normalizarBus,
  formatearConductor,
  formatearBus,
  aColumnas
};
