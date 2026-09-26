/**
 * Pruebas de services/keyfacilService (resolución de URL según configuración)
 * Ejecutar: npm test (node --test)
 *
 * Manual de Integración KEYFACIL (marzo 2026):
 * - PRUEBAS:    https://api.vitekey.com/keyfact/integra-demo/v1
 * - PRODUCCION: https://api.vitekey.com/keyfact/integra/v1
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { resolverBaseUrl, KEYFACIL_BASE_URL, KEYFACIL_DEMO_URL } = require('../services/keyfacilService');

describe('resolverBaseUrl', () => {
  test('modo producción usa integra/v1', () => {
    assert.equal(resolverBaseUrl({ modoProduccion: true, keyfacilUrl: KEYFACIL_BASE_URL }), KEYFACIL_BASE_URL);
  });

  test('modo pruebas usa integra-demo aunque keyfacil_url tenga la URL de producción', () => {
    assert.equal(resolverBaseUrl({ modoProduccion: false, keyfacilUrl: KEYFACIL_BASE_URL }), KEYFACIL_DEMO_URL);
    assert.equal(resolverBaseUrl({ modoProduccion: false, keyfacilUrl: null }), KEYFACIL_DEMO_URL);
  });

  test('flag nulo o ausente se asume producción (comportamiento previo)', () => {
    assert.equal(resolverBaseUrl({ modoProduccion: null, keyfacilUrl: null }), KEYFACIL_BASE_URL);
    assert.equal(resolverBaseUrl({}), KEYFACIL_BASE_URL);
    assert.equal(resolverBaseUrl(), KEYFACIL_BASE_URL);
  });

  test('URL personalizada (ej. mock local) tiene prioridad y se le quita la barra final', () => {
    assert.equal(resolverBaseUrl({ modoProduccion: true, keyfacilUrl: 'http://localhost:4010/' }), 'http://localhost:4010');
    assert.equal(resolverBaseUrl({ modoProduccion: false, keyfacilUrl: 'http://localhost:4010' }), 'http://localhost:4010');
  });
});
