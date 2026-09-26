/**
 * Pruebas de utils/clienteComprobante
 * Ejecutar: npm test (node --test)
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizarClienteComprobante,
  MAX_RAZON_SOCIAL
} = require('../utils/clienteComprobante');

describe('normalizarClienteComprobante', () => {
  test('boleta con DNI válido devuelve datos normalizados', () => {
    const r = normalizarClienteComprobante(
      { tipoDoc: '1', numDoc: ' 12345678 ', razonSocial: '  LEVANO   NOLAZCO, LUCIANA ', direccion: undefined },
      '03'
    );
    assert.deepEqual(r, {
      tipoDoc: '1',
      numDoc: '12345678',
      razonSocial: 'LEVANO NOLAZCO, LUCIANA',
      direccion: ''
    });
  });

  test('factura exige RUC (tipo 6)', () => {
    assert.throws(
      () => normalizarClienteComprobante({ tipoDoc: '1', numDoc: '12345678', razonSocial: 'JUAN' }, '01'),
      /RUC \(tipo documento 6\)/
    );
  });

  test('factura con RUC de 11 dígitos es válida y conserva la dirección', () => {
    const r = normalizarClienteComprobante(
      { tipoDoc: '6', numDoc: '20609654547', razonSocial: 'ESTILO 19 E.I.R.L.', direccion: 'CAL. CELENDIN NRO. 296' },
      '01'
    );
    assert.equal(r.numDoc, '20609654547');
    assert.equal(r.direccion, 'CAL. CELENDIN NRO. 296');
  });

  test('rechaza número que no cumple el formato del tipo', () => {
    assert.throws(
      () => normalizarClienteComprobante({ tipoDoc: '6', numDoc: '12345678', razonSocial: 'EMPRESA' }, '01'),
      /RUC del cliente debe tener 11 dígitos/
    );
    assert.throws(
      () => normalizarClienteComprobante({ tipoDoc: '1', numDoc: '20609654547', razonSocial: 'JUAN' }, '03'),
      /DNI del cliente debe tener 8 dígitos/
    );
  });

  test('rechaza tipos fuera del catálogo (incluido "-" sin documento)', () => {
    assert.throws(
      () => normalizarClienteComprobante({ tipoDoc: '-', numDoc: '00000000', razonSocial: 'VARIOS' }, '03'),
      /Tipo de documento del cliente inválido/
    );
    assert.throws(
      () => normalizarClienteComprobante({ numDoc: '12345678', razonSocial: 'JUAN' }, '03'),
      /Tipo de documento del cliente inválido/
    );
  });

  test('exige nombre o razón social no vacía', () => {
    assert.throws(
      () => normalizarClienteComprobante({ tipoDoc: '1', numDoc: '12345678', razonSocial: '   ' }, '03'),
      /nombre completo del cliente es requerido/
    );
    assert.throws(
      () => normalizarClienteComprobante({ tipoDoc: '6', numDoc: '20609654547', razonSocial: '' }, '01'),
      /razón social del cliente es requerida/
    );
  });

  test('acepta carnet de extranjería en boleta y lo pone en mayúsculas', () => {
    const r = normalizarClienteComprobante({ tipoDoc: '4', numDoc: 'ab1234567', razonSocial: 'JOHN DOE' }, '03');
    assert.equal(r.numDoc, 'AB1234567');
  });

  test('recorta la razón social al tamaño de la columna', () => {
    const larga = 'A'.repeat(MAX_RAZON_SOCIAL + 50);
    const r = normalizarClienteComprobante({ tipoDoc: '1', numDoc: '12345678', razonSocial: larga }, '03');
    assert.equal(r.razonSocial.length, MAX_RAZON_SOCIAL);
  });

  test('sin objeto cliente lanza error', () => {
    assert.throws(() => normalizarClienteComprobante(null, '03'), /datos del cliente/);
  });
});
