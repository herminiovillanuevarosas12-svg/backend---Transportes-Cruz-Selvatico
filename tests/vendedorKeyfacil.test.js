/**
 * Usuario que emite el comprobante en KEYFACIL
 * Ejecutar: npm test (node --test)
 *
 * Evidencia (BT74-0000010): el ticket impreso por KEYFACIL mostraba "USUARIO: ERP" porque
 * no se enviaba el campo opcional vendedor_nombre ("Nombre del vendedor o el que realiza
 * el comprobante", Manual de Integración KEYFACIL). Ahora se envía el nombre del usuario
 * que registró el comprobante.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { construirPayloadKeyfacil } = require('../services/facturacionService');

describe('construirPayloadKeyfacil: vendedor_nombre', () => {
  const base = {
    tipoComprobante: '03',
    serie: 'BT74',
    numero: 10,
    fechaEmision: new Date('2026-11-04T12:50:00Z'),
    cliente: { tipoDoc: '6', numDoc: '20131257750', razonSocial: 'SEGURO SOCIAL DE SALUD', direccion: '' },
    items: [{ codigo: 'PAS-1', descripcion: 'Pasaje Terminal Oxapampa - Terminal Pozuzo', unidadMedida: 'ZZ', cantidad: 1, precioUnitario: 30, tipoIGV: '20' }],
    totales: {}
  };

  test('envía el nombre del usuario que registró el comprobante', () => {
    const payload = construirPayloadKeyfacil({}, { ...base, vendedorNombre: 'María López' });
    assert.equal(payload.vendedor_nombre, 'María López');
  });

  test('recorta espacios del nombre', () => {
    const payload = construirPayloadKeyfacil({}, { ...base, vendedorNombre: '  María López  ' });
    assert.equal(payload.vendedor_nombre, 'María López');
  });

  test('sin nombre no envía el campo (KEYFACIL usa su valor por defecto)', () => {
    for (const vendedorNombre of [undefined, null, '', '   ']) {
      const payload = construirPayloadKeyfacil({}, { ...base, vendedorNombre });
      assert.equal(Object.hasOwn(payload, 'vendedor_nombre'), false, `valor: ${JSON.stringify(vendedorNombre)}`);
    }
  });
});
