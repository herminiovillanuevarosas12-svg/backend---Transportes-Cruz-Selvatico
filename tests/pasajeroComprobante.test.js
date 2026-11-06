/**
 * Pasajero opcional en la emisión manual de comprobantes
 * Ejecutar: npm test (node --test)
 *
 * En Facturación → Emitir Factura/Boleta el pasajero es opcional: o se envían nombre,
 * documento y teléfono completos, o ninguno (se emite sin pasajero, previa confirmación).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { normalizarPasajeroComprobante } = require('../utils/pasajeroComprobante');

describe('normalizarPasajeroComprobante', () => {
  test('sin pasajero devuelve null', () => {
    assert.equal(normalizarPasajeroComprobante(undefined), null);
    assert.equal(normalizarPasajeroComprobante(null), null);
  });

  test('con los tres campos vacíos devuelve null (emisión sin pasajero)', () => {
    assert.equal(normalizarPasajeroComprobante({ tipoDocumento: '1', documentoIdentidad: '', nombreCompleto: '  ', telefono: '' }), null);
  });

  test('normaliza un pasajero completo con DNI', () => {
    const pasajero = normalizarPasajeroComprobante({
      tipoDocumento: '1',
      documentoIdentidad: ' 45678912 ',
      nombreCompleto: '  Juan   Pérez  Rojas ',
      telefono: '987 654 321'
    });
    assert.deepEqual(pasajero, {
      tipoDocumento: '1',
      documentoIdentidad: '45678912',
      nombreCompleto: 'Juan Pérez Rojas',
      telefono: '987654321'
    });
  });

  test('acepta carnet de extranjería y lo pasa a mayúsculas', () => {
    const pasajero = normalizarPasajeroComprobante({
      tipoDocumento: '4',
      documentoIdentidad: 'ab1234567',
      nombreCompleto: 'Ana Gómez',
      telefono: '912345678'
    });
    assert.equal(pasajero.tipoDocumento, '4');
    assert.equal(pasajero.documentoIdentidad, 'AB1234567');
  });

  test('datos incompletos: exige completar los tres o dejarlos vacíos', () => {
    assert.throws(
      () => normalizarPasajeroComprobante({ tipoDocumento: '1', documentoIdentidad: '45678912', nombreCompleto: 'Juan Pérez', telefono: '' }),
      /nombre, documento y teléfono del pasajero/i
    );
    assert.throws(
      () => normalizarPasajeroComprobante({ nombreCompleto: 'Juan Pérez' }),
      /nombre, documento y teléfono del pasajero/i
    );
  });

  test('documento con formato inválido', () => {
    assert.throws(
      () => normalizarPasajeroComprobante({ tipoDocumento: '1', documentoIdentidad: '1234', nombreCompleto: 'Juan', telefono: '987654321' }),
      /DNI del pasajero debe tener 8 dígitos/
    );
  });

  test('teléfono debe tener 9 dígitos', () => {
    assert.throws(
      () => normalizarPasajeroComprobante({ tipoDocumento: '1', documentoIdentidad: '45678912', nombreCompleto: 'Juan', telefono: '98765' }),
      /teléfono del pasajero debe tener 9 dígitos/i
    );
  });

  test('recorta el nombre al tamaño de tbl_pasajeros.nombre_completo (150)', () => {
    const pasajero = normalizarPasajeroComprobante({
      tipoDocumento: '1', documentoIdentidad: '45678912', nombreCompleto: 'A'.repeat(200), telefono: '987654321'
    });
    assert.equal(pasajero.nombreCompleto.length, 150);
  });
});
