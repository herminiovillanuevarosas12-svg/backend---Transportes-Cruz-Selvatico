/**
 * Pruebas de utils/dateUtils (fecha civil en Perú)
 * Ejecutar: npm test (node --test)
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { getFechaPeruISO, getFechaPeruYYYYMMDD } = require('../utils/dateUtils');

describe('getFechaPeruISO', () => {
  test('devuelve YYYY-MM-DD', () => {
    assert.match(getFechaPeruISO(), /^\d{4}-\d{2}-\d{2}$/);
  });

  test('coincide con la fecha Perú compacta usada para códigos', () => {
    assert.equal(getFechaPeruISO().replace(/-/g, ''), getFechaPeruYYYYMMDD());
  });
});
