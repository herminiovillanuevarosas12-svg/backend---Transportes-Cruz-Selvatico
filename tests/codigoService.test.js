/**
 * Pruebas de services/codigoService
 * Ejecutar: npm test (node --test)
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { normalizarCodigoTracking } = require('../services/codigoService');

describe('normalizarCodigoTracking', () => {
  test('convierte solo numeros al formato ENC-NNNNNNNN', () => {
    assert.equal(normalizarCodigoTracking('1'), 'ENC-00000001');
    assert.equal(normalizarCodigoTracking('245'), 'ENC-00000245');
    assert.equal(normalizarCodigoTracking('00000245'), 'ENC-00000245');
  });

  test('completa el correlativo cuando viene con prefijo ENC incompleto', () => {
    assert.equal(normalizarCodigoTracking('ENC-1'), 'ENC-00000001');
    assert.equal(normalizarCodigoTracking('enc-245'), 'ENC-00000245');
    assert.equal(normalizarCodigoTracking('ENC00000245'), 'ENC-00000245');
  });

  test('limpia espacios y pasa a mayusculas', () => {
    assert.equal(normalizarCodigoTracking('  enc-00000001  '), 'ENC-00000001');
  });

  test('deja intacto el formato antiguo ENC-YYYYMMDD-NNNNN', () => {
    assert.equal(normalizarCodigoTracking('ENC-20260118-00005'), 'ENC-20260118-00005');
  });

  test('devuelve cadena vacia para entradas vacias o nulas', () => {
    assert.equal(normalizarCodigoTracking(''), '');
    assert.equal(normalizarCodigoTracking('   '), '');
    assert.equal(normalizarCodigoTracking(null), '');
    assert.equal(normalizarCodigoTracking(undefined), '');
  });

  test('no altera cadenas que no siguen ningun formato conocido', () => {
    assert.equal(normalizarCodigoTracking('ABC-123'), 'ABC-123');
    assert.equal(normalizarCodigoTracking('123456789'), '123456789');
  });
});
