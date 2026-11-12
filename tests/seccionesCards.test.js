/**
 * Pruebas de utils/seccionesCards (secciones de cards de /encomiendas-info)
 * Ejecutar: npm test (node --test)
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  TITULO_MAX,
  validarTitulo,
  validarIdsOrden,
  construirCambiosCard,
  agruparSecciones,
  esErrorEsquemaPendiente
} = require('../utils/seccionesCards');

describe('validarTitulo', () => {
  test('recorta espacios y acepta', () => {
    assert.deepEqual(validarTitulo('  Hola '), { titulo: 'Hola', error: null });
  });

  test('rechaza vacío, solo espacios, null y undefined', () => {
    for (const valor of ['', '   ', null, undefined]) {
      const r = validarTitulo(valor);
      assert.ok(r.error, `debería rechazar ${JSON.stringify(valor)}`);
      assert.equal(r.titulo, null);
    }
  });

  test('rechaza títulos más largos que TITULO_MAX', () => {
    assert.ok(validarTitulo('x'.repeat(TITULO_MAX + 1)).error);
    assert.equal(validarTitulo('x'.repeat(TITULO_MAX)).error, null);
  });
});

describe('validarIdsOrden', () => {
  test('acepta enteros positivos únicos', () => {
    assert.equal(validarIdsOrden([3, 1, 2]), true);
  });

  test('rechaza vacíos, duplicados, no enteros y no arrays', () => {
    for (const valor of [[], [1, 1], [1, '2'], [0], [-1], [1.5], null, 'x', undefined]) {
      assert.equal(validarIdsOrden(valor), false, `debería rechazar ${JSON.stringify(valor)}`);
    }
  });
});

describe('construirCambiosCard', () => {
  test('solo incluye los campos enviados (edición inline de un campo)', () => {
    const r = construirCambiosCard({ titulo: ' Nuevo ' });
    assert.deepEqual(r.cambios, { titulo: 'Nuevo' });
    assert.equal('descripcion' in r.cambios, false);
    assert.equal(r.quitarImagen, false);
    assert.equal(r.error, null);
  });

  test('descripción o ícono vacíos se guardan como null', () => {
    assert.deepEqual(
      construirCambiosCard({ descripcion: '  ', icono: '' }).cambios,
      { descripcion: null, icono: null }
    );
  });

  test('título vacío es error', () => {
    assert.ok(construirCambiosCard({ titulo: ' ' }).error);
  });

  test('quitarImagen acepta "true" (multipart) y true', () => {
    assert.equal(construirCambiosCard({ quitarImagen: 'true' }).quitarImagen, true);
    assert.equal(construirCambiosCard({ quitarImagen: true }).quitarImagen, true);
    assert.equal(construirCambiosCard({ quitarImagen: 'false' }).quitarImagen, false);
  });

  test('body vacío o nulo no produce cambios', () => {
    assert.deepEqual(construirCambiosCard({}).cambios, {});
    assert.deepEqual(construirCambiosCard(undefined).cambios, {});
  });
});

describe('agruparSecciones', () => {
  const secciones = [{ id: 1, titulo: 'A' }, { id: 2, titulo: 'B' }];
  const cards = [{ id: 10, idSeccion: 2 }, { id: 11, idSeccion: 1 }, { id: 12, idSeccion: 2 }];

  test('asocia las cards a su sección respetando el orden recibido', () => {
    const r = agruparSecciones(secciones, cards);
    assert.deepEqual(r.map(s => s.id), [1, 2]);
    assert.deepEqual(r.map(s => s.cards.map(c => c.id)), [[11], [10, 12]]);
  });

  test('conserva las secciones vacías por defecto', () => {
    assert.deepEqual(agruparSecciones(secciones, [cards[0]]).map(s => s.cards.length), [0, 1]);
  });

  test('omite las secciones vacías si se pide', () => {
    assert.deepEqual(agruparSecciones(secciones, [cards[0]], { omitirVacias: true }).map(s => s.id), [2]);
  });
});

describe('esErrorEsquemaPendiente', () => {
  test('detecta tabla o columna inexistente (directo o envuelto por Prisma)', () => {
    assert.equal(esErrorEsquemaPendiente({ code: '42P01' }), true);
    assert.equal(esErrorEsquemaPendiente({ code: 'P2010', meta: { code: '42703' } }), true);
  });

  test('no confunde otros errores', () => {
    assert.equal(esErrorEsquemaPendiente({ code: 'P2002' }), false);
    assert.equal(esErrorEsquemaPendiente(null), false);
  });
});
