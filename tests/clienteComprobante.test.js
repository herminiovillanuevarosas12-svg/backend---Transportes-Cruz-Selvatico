/**
 * Pruebas de utils/clienteComprobante
 * Ejecutar: npm test (node --test)
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizarClienteComprobante,
  validarMontoClienteSinDocumento,
  normalizarClienteBoletaElegido,
  NUMERO_SIN_DOCUMENTO,
  NOMBRE_SIN_DOCUMENTO,
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

  test('rechaza tipos fuera del catálogo', () => {
    assert.throws(
      () => normalizarClienteComprobante({ tipoDoc: '7', numDoc: '12345678', razonSocial: 'JUAN' }, '03'),
      /Tipo de documento del cliente inválido/
    );
    assert.throws(
      () => normalizarClienteComprobante({ numDoc: '12345678', razonSocial: 'JUAN' }, '03'),
      /Tipo de documento del cliente inválido/
    );
  });

  test('boleta sin documento: ignora el número enviado y conserva nombre y dirección', () => {
    const r = normalizarClienteComprobante(
      { tipoDoc: '-', numDoc: '00000000', razonSocial: '  maria   perez ', direccion: ' Jr. Lima 123 ' },
      '03'
    );
    assert.deepEqual(r, {
      tipoDoc: '-',
      numDoc: NUMERO_SIN_DOCUMENTO,
      razonSocial: 'maria perez',
      direccion: 'Jr. Lima 123'
    });
  });

  test('boleta sin documento y sin nombre usa CLIENTES VARIOS', () => {
    const r = normalizarClienteComprobante({ tipoDoc: '-', razonSocial: '   ' }, '03');
    assert.equal(r.razonSocial, NOMBRE_SIN_DOCUMENTO);
  });

  test('factura no acepta cliente sin documento', () => {
    assert.throws(
      () => normalizarClienteComprobante({ tipoDoc: '-', razonSocial: 'X' }, '01'),
      /Solo las boletas se pueden emitir sin documento/
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

describe('validarMontoClienteSinDocumento', () => {
  const sinDoc = { tipoDoc: '-' };

  test('permite sin documento hasta S/ 700 inclusive', () => {
    assert.doesNotThrow(() => validarMontoClienteSinDocumento(sinDoc, 700));
    assert.doesNotThrow(() => validarMontoClienteSinDocumento(sinDoc, 35.5));
  });

  test('rechaza sin documento por encima de S/ 700', () => {
    assert.throws(() => validarMontoClienteSinDocumento(sinDoc, 700.01), /mayores a S\/ 700/);
  });

  test('no limita a clientes identificados', () => {
    assert.doesNotThrow(() => validarMontoClienteSinDocumento({ tipoDoc: '1' }, 5000));
  });
});

describe('normalizarClienteBoletaElegido', () => {
  test('normaliza el cliente enviado por el formulario', () => {
    const r = normalizarClienteBoletaElegido({ tipoDoc: '6', numDoc: '20609654547', razonSocial: 'ESTILO 19 E.I.R.L.' });
    assert.equal(r.numDoc, '20609654547');
  });

  test('sin cliente enviado devuelve null (el flujo usa su cliente por defecto)', () => {
    assert.equal(normalizarClienteBoletaElegido(undefined), null);
    assert.equal(normalizarClienteBoletaElegido(null), null);
  });

  test('valida el cliente enviado', () => {
    assert.throws(() => normalizarClienteBoletaElegido({ tipoDoc: '1', numDoc: '123', razonSocial: 'X' }), /DNI del cliente/);
  });
});
