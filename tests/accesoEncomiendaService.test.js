/**
 * Pruebas de services/accesoEncomiendaService (lógica pura, sin BD)
 * Ejecutar: npm test (node --test)
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  SIGUIENTE_ESTADO,
  rolDelPunto,
  filtroListado,
  puedeConsultar,
  evaluarTransicion
} = require('../services/accesoEncomiendaService');

const ORIGEN = 10;
const DESTINO = 20;
const AJENO = 30;

const encomienda = (estadoActual, datos = {}) => ({
  idPuntoOrigen: ORIGEN,
  idPuntoDestino: DESTINO,
  estadoActual,
  puntoOrigen: { nombre: 'Terminal Pozuzo' },
  puntoDestino: { nombre: 'Agencia Huánuco' },
  ...datos
});

describe('SIGUIENTE_ESTADO', () => {
  test('sigue el flujo registrado → almacén → ruta → destino → retirado', () => {
    assert.deepEqual(SIGUIENTE_ESTADO, {
      REGISTRADO: 'EN_ALMACEN',
      EN_ALMACEN: 'EN_RUTA',
      EN_RUTA: 'LLEGO_A_DESTINO',
      LLEGO_A_DESTINO: 'RETIRADO'
    });
  });
});

describe('rolDelPunto', () => {
  test('identifica origen, destino o ninguno', () => {
    assert.equal(rolDelPunto(ORIGEN, encomienda('REGISTRADO')), 'ORIGEN');
    assert.equal(rolDelPunto(DESTINO, encomienda('REGISTRADO')), 'DESTINO');
    assert.equal(rolDelPunto(AJENO, encomienda('REGISTRADO')), null);
  });
});

describe('filtroListado', () => {
  test('sin punto no filtra', () => {
    assert.equal(filtroListado(null), null);
    assert.equal(filtroListado(undefined), null);
  });

  test('con punto: lo registrado siempre y lo recibido desde que llegó', () => {
    assert.deepEqual(filtroListado(7), {
      OR: [
        { idPuntoOrigen: 7 },
        { idPuntoDestino: 7, estadoActual: { in: ['LLEGO_A_DESTINO', 'RETIRADO'] } }
      ]
    });
  });
});

describe('puedeConsultar', () => {
  test('el origen consulta en cualquier estado', () => {
    for (const estado of ['REGISTRADO', 'EN_ALMACEN', 'EN_RUTA', 'LLEGO_A_DESTINO', 'RETIRADO']) {
      assert.equal(puedeConsultar(ORIGEN, encomienda(estado)), true, estado);
    }
  });

  test('el destino no la encuentra antes de que salga en ruta', () => {
    assert.equal(puedeConsultar(DESTINO, encomienda('REGISTRADO')), false);
    assert.equal(puedeConsultar(DESTINO, encomienda('EN_ALMACEN')), false);
  });

  test('el destino la encuentra desde En ruta', () => {
    for (const estado of ['EN_RUTA', 'LLEGO_A_DESTINO', 'RETIRADO']) {
      assert.equal(puedeConsultar(DESTINO, encomienda(estado)), true, estado);
    }
  });

  test('un punto ajeno nunca la ve y un usuario sin punto siempre', () => {
    assert.equal(puedeConsultar(AJENO, encomienda('LLEGO_A_DESTINO')), false);
    assert.equal(puedeConsultar(null, encomienda('REGISTRADO')), true);
  });
});

describe('evaluarTransicion', () => {
  test('el origen pasa una registrada a almacén', () => {
    assert.deepEqual(evaluarTransicion(ORIGEN, encomienda('REGISTRADO')), {
      siguienteEstado: 'EN_ALMACEN',
      permitida: true,
      motivo: null
    });
  });

  test('el destino no puede mover una encomienda que aún está en el origen', () => {
    const resultado = evaluarTransicion(DESTINO, encomienda('EN_ALMACEN'));
    assert.equal(resultado.siguienteEstado, 'EN_RUTA');
    assert.equal(resultado.permitida, false);
    assert.match(resultado.motivo, /Terminal Pozuzo/);
  });

  test('origen y destino pueden marcar la llegada', () => {
    assert.equal(evaluarTransicion(ORIGEN, encomienda('EN_RUTA')).permitida, true);
    const destino = evaluarTransicion(DESTINO, encomienda('EN_RUTA'));
    assert.equal(destino.siguienteEstado, 'LLEGO_A_DESTINO');
    assert.equal(destino.permitida, true);
  });

  test('solo el destino registra la entrega', () => {
    const origen = evaluarTransicion(ORIGEN, encomienda('LLEGO_A_DESTINO'));
    assert.equal(origen.siguienteEstado, 'RETIRADO');
    assert.equal(origen.permitida, false);
    assert.match(origen.motivo, /Solo el punto de destino "Agencia Huánuco"/);
    assert.equal(evaluarTransicion(DESTINO, encomienda('LLEGO_A_DESTINO')).permitida, true);
  });

  test('una encomienda retirada no tiene siguiente estado', () => {
    const resultado = evaluarTransicion(null, encomienda('RETIRADO'));
    assert.equal(resultado.siguienteEstado, null);
    assert.equal(resultado.permitida, false);
    assert.ok(resultado.motivo);
  });

  test('un punto ajeno no puede cambiarla', () => {
    assert.deepEqual(evaluarTransicion(AJENO, encomienda('EN_RUTA')), {
      siguienteEstado: 'LLEGO_A_DESTINO',
      permitida: false,
      motivo: 'La encomienda no pertenece a su punto de operación'
    });
  });

  test('un usuario sin punto puede avanzar cualquier estado', () => {
    assert.equal(evaluarTransicion(null, encomienda('EN_ALMACEN')).permitida, true);
    assert.equal(evaluarTransicion(undefined, encomienda('LLEGO_A_DESTINO')).permitida, true);
  });

  test('sin nombres de punto el motivo no queda con "undefined"', () => {
    const resultado = evaluarTransicion(ORIGEN, encomienda('LLEGO_A_DESTINO', { puntoDestino: undefined }));
    assert.doesNotMatch(resultado.motivo, /undefined/);
  });
});
