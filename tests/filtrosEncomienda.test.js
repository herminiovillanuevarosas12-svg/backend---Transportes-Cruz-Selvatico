/**
 * Pruebas de utils/filtrosEncomienda (lógica pura, sin BD)
 * Ejecutar: npm test (node --test)
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { filtroRuta } = require('../utils/filtrosEncomienda');

describe('filtroRuta', () => {
  test('sin origen ni destino no filtra', () => {
    assert.deepEqual(filtroRuta({}), { filtro: {} });
    assert.deepEqual(filtroRuta({ idPuntoOrigen: '', idPuntoDestino: '' }), { filtro: {} });
    assert.deepEqual(filtroRuta(), { filtro: {} });
  });

  test('filtra por origen y destino convertidos a número', () => {
    assert.deepEqual(
      filtroRuta({ idPuntoOrigen: '3', idPuntoDestino: '7' }),
      { filtro: { idPuntoOrigen: 3, idPuntoDestino: 7 } }
    );
  });

  test('admite solo el origen o solo el destino', () => {
    assert.deepEqual(filtroRuta({ idPuntoOrigen: '3' }), { filtro: { idPuntoOrigen: 3 } });
    assert.deepEqual(filtroRuta({ idPuntoDestino: '7' }), { filtro: { idPuntoDestino: 7 } });
  });

  test('ignora los demás parámetros de la consulta', () => {
    assert.deepEqual(
      filtroRuta({ idPuntoOrigen: '3', estado: 'EN_RUTA', page: '2' }),
      { filtro: { idPuntoOrigen: 3 } }
    );
  });

  test('rechaza ids que no son enteros positivos', () => {
    for (const valor of ['abc', '0', '-1', '2.5', '3x', ' ']) {
      assert.equal(filtroRuta({ idPuntoOrigen: valor }).error, 'El origen del filtro no es válido', valor);
      assert.equal(filtroRuta({ idPuntoDestino: valor }).error, 'El destino del filtro no es válido', valor);
    }
  });

  test('rechaza el parámetro repetido', () => {
    assert.equal(filtroRuta({ idPuntoOrigen: ['3', '4'] }).error, 'El origen del filtro no es válido');
  });
});
