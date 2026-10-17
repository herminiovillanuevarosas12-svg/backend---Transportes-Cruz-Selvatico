/**
 * Pruebas de utils/documentoIdentidad
 * Ejecutar: npm test (node --test)
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  TIPOS_DOCUMENTO,
  CODIGO_DNI,
  CODIGO_CE,
  CODIGO_RUC,
  esTipoDocumentoValido,
  esDocumentoValido,
  detectarTipoDocumento,
  mensajeErrorDocumento
} = require('../utils/documentoIdentidad');

describe('catálogo', () => {
  test('incluye DNI, carnet de extranjería y RUC con códigos SUNAT', () => {
    assert.deepEqual(TIPOS_DOCUMENTO.map(t => t.codigo), ['1', '4', '6']);
    assert.equal(CODIGO_DNI, '1');
    assert.equal(CODIGO_CE, '4');
    assert.equal(CODIGO_RUC, '6');
  });

  test('esTipoDocumentoValido solo acepta códigos del catálogo', () => {
    assert.equal(esTipoDocumentoValido('4'), true);
    assert.equal(esTipoDocumentoValido('9'), false);
    assert.equal(esTipoDocumentoValido(undefined), false);
  });
});

describe('esDocumentoValido', () => {
  test('DNI exige 8 dígitos y RUC 11 dígitos', () => {
    assert.equal(esDocumentoValido(CODIGO_DNI, '12345678'), true);
    assert.equal(esDocumentoValido(CODIGO_DNI, '1234567'), false);
    assert.equal(esDocumentoValido(CODIGO_RUC, '20123456789'), true);
    assert.equal(esDocumentoValido(CODIGO_RUC, '2012345678'), false);
  });

  test('carnet de extranjería acepta de 9 a 12 caracteres alfanuméricos en mayúscula', () => {
    assert.equal(esDocumentoValido(CODIGO_CE, '001234567'), true);
    assert.equal(esDocumentoValido(CODIGO_CE, 'AB1234567890'), true);
    assert.equal(esDocumentoValido(CODIGO_CE, '12345678'), false);
    assert.equal(esDocumentoValido(CODIGO_CE, 'ABCDEFGHIJKLM'), false);
    assert.equal(esDocumentoValido(CODIGO_CE, 'ab1234567'), false);
  });

  test('tipo desconocido o valor vacío no son válidos', () => {
    assert.equal(esDocumentoValido('9', '12345678'), false);
    assert.equal(esDocumentoValido(CODIGO_DNI, ''), false);
    assert.equal(esDocumentoValido(CODIGO_DNI, null), false);
  });
});

describe('detectarTipoDocumento', () => {
  test('deduce el tipo cuando el cliente no lo envía', () => {
    assert.equal(detectarTipoDocumento('12345678'), CODIGO_DNI);
    assert.equal(detectarTipoDocumento('20123456789'), CODIGO_RUC);
    assert.equal(detectarTipoDocumento('001234567'), CODIGO_CE);
    assert.equal(detectarTipoDocumento('123'), CODIGO_DNI);
  });
});

describe('mensajeErrorDocumento', () => {
  test('describe el tipo, el rol y la regla de formato', () => {
    assert.match(mensajeErrorDocumento(CODIGO_CE, 'remitente'), /carnet de extranjería del remitente.*9 y 12/i);
    assert.match(mensajeErrorDocumento(CODIGO_DNI, 'destinatario'), /DNI del destinatario.*8 dígitos/);
    assert.match(mensajeErrorDocumento(CODIGO_RUC, 'remitente'), /RUC del remitente.*11 dígitos/);
  });
});

describe('validarDocumento', () => {
  const { validarDocumento } = require('../utils/documentoIdentidad');

  test('normaliza espacios y mayúsculas y conserva el tipo enviado', () => {
    assert.deepEqual(
      validarDocumento({ tipo: CODIGO_DNI, numero: ' 12345678 ', rol: 'pasajero' }),
      { tipo: CODIGO_DNI, numero: '12345678', error: null }
    );
    assert.deepEqual(
      validarDocumento({ tipo: CODIGO_CE, numero: 'ab 1234567', rol: 'pasajero' }),
      { tipo: CODIGO_CE, numero: 'AB1234567', error: null }
    );
  });

  test('deduce el tipo cuando no se envía o llega vacío', () => {
    assert.equal(validarDocumento({ numero: '20123456789' }).tipo, CODIGO_RUC);
    assert.equal(validarDocumento({ tipo: '', numero: '001234567' }).tipo, CODIGO_CE);
    assert.equal(validarDocumento({ tipo: null, numero: '12345678' }).error, null);
  });

  test('devuelve el mensaje de error del catálogo cuando el formato no cumple', () => {
    const dniCorto = validarDocumento({ tipo: CODIGO_DNI, numero: '1234', rol: 'pasajero' });
    assert.match(dniCorto.error, /DNI del pasajero.*8 dígitos/);
    const ceLargo = validarDocumento({ tipo: CODIGO_CE, numero: 'ABCDEFGHIJKLM', rol: 'quien retira' });
    assert.match(ceLargo.error, /carnet de extranjería del quien retira.*9 y 12/i);
  });

  test('rechaza tipos fuera del catálogo y números vacíos', () => {
    assert.match(validarDocumento({ tipo: '9', numero: '12345678', rol: 'cliente' }).error, /tipo de documento del cliente no es válido/i);
    assert.match(validarDocumento({ tipo: CODIGO_DNI, numero: '   ', rol: 'cliente' }).error, /documento del cliente es requerido/i);
    assert.match(validarDocumento({ numero: undefined, rol: 'cliente' }).error, /documento del cliente es requerido/i);
  });
});
