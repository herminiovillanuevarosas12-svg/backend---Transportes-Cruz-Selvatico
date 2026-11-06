/**
 * Nombre impreso como "USUARIO" en el ticket de KEYFACIL
 * Ejecutar: npm test (node --test)
 *
 * KEYFACIL imprime el campo opcional vendedor_nombre como "USUARIO" y, si no se envía,
 * muestra "ERP". Ahí debe ir la persona del servicio, nunca el usuario del sistema:
 * - Pasajes: el pasajero.
 * - Encomiendas: el remitente.
 * - Emisión manual: el pasajero registrado en el formulario (opcional).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { construirPayloadKeyfacil } = require('../services/facturacionService');

describe('construirPayloadKeyfacil: vendedor_nombre', () => {
  const base = {
    tipoComprobante: '01',
    serie: 'FT74',
    numero: 25,
    fechaEmision: new Date('2026-11-05T20:15:00Z'),
    cliente: { tipoDoc: '6', numDoc: '20131257750', razonSocial: 'SEGURO SOCIAL DE SALUD', direccion: 'AV. DOMINGO CUETO NRO. 120' },
    items: [{ codigo: 'PAS-1', descripcion: 'Pasaje Terminal Oxapampa - Terminal Pozuzo', unidadMedida: 'ZZ', cantidad: 1, precioUnitario: 30, tipoIGV: '20' }],
    totales: {}
  };

  test('envía el nombre de la persona del ticket (pasajero o remitente)', () => {
    const payload = construirPayloadKeyfacil({}, { ...base, nombreUsuarioTicket: 'Juan Pérez Rojas' });
    assert.equal(payload.vendedor_nombre, 'Juan Pérez Rojas');
  });

  test('recorta espacios del nombre', () => {
    const payload = construirPayloadKeyfacil({}, { ...base, nombreUsuarioTicket: '  Juan Pérez Rojas  ' });
    assert.equal(payload.vendedor_nombre, 'Juan Pérez Rojas');
  });

  test('sin nombre no envía el campo', () => {
    for (const nombreUsuarioTicket of [undefined, null, '', '   ']) {
      const payload = construirPayloadKeyfacil({}, { ...base, nombreUsuarioTicket });
      assert.equal(Object.hasOwn(payload, 'vendedor_nombre'), false, `valor: ${JSON.stringify(nombreUsuarioTicket)}`);
    }
  });
});
