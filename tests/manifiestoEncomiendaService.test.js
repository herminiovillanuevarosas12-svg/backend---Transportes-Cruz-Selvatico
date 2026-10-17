/**
 * Pruebas de services/manifiestoEncomiendaService (lógica pura, sin BD)
 * Ejecutar: npm test (node --test)
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizarIdsEncomiendas,
  validarEncomiendasParaManifiesto,
  calcularResumenManifiesto,
  formatearNumeroManifiesto,
  combinarDatosEmpresa
} = require('../services/manifiestoEncomiendaService');

// Fila tal como la devuelve la consulta de candidatas del servicio
const encomienda = (datos = {}) => ({
  id: 1,
  codigoTracking: 'ENC-00000001',
  estadoActual: 'EN_RUTA',
  idPuntoOrigen: 10,
  idPuntoDestino: 20,
  idManifiesto: null,
  peso: '1.00',
  precioCalculado: '10.00',
  precioFinal: null,
  pagoAlRecojo: false,
  ...datos
});

describe('normalizarIdsEncomiendas', () => {
  test('convierte a enteros y elimina duplicados conservando el orden', () => {
    assert.deepEqual(normalizarIdsEncomiendas([3, '1', 3, 2]), { ids: [3, 1, 2] });
  });

  test('rechaza una selección vacía o que no es lista', () => {
    assert.ok(normalizarIdsEncomiendas([]).error);
    assert.ok(normalizarIdsEncomiendas(undefined).error);
    assert.ok(normalizarIdsEncomiendas('1,2').error);
  });

  test('rechaza ids que no son enteros positivos', () => {
    assert.ok(normalizarIdsEncomiendas([1, 0]).error);
    assert.ok(normalizarIdsEncomiendas([1, -4]).error);
    assert.ok(normalizarIdsEncomiendas([1.5]).error);
    assert.ok(normalizarIdsEncomiendas(['abc']).error);
    assert.ok(normalizarIdsEncomiendas([null]).error);
  });
});

describe('validarEncomiendasParaManifiesto', () => {
  test('acepta encomiendas En ruta que no tienen manifiesto', () => {
    const resultado = validarEncomiendasParaManifiesto({
      ids: [1, 2],
      encomiendas: [encomienda({ id: 1 }), encomienda({ id: 2, codigoTracking: 'ENC-00000002' })],
      idPuntoUsuario: null
    });
    assert.equal(resultado, null);
  });

  test('responde 404 indicando los ids que no existen', () => {
    const resultado = validarEncomiendasParaManifiesto({
      ids: [1, 7],
      encomiendas: [encomienda({ id: 1 })],
      idPuntoUsuario: null
    });
    assert.equal(resultado.status, 404);
    assert.match(resultado.error, /7/);
  });

  test('responde 400 si alguna encomienda no está En ruta, nombrando su código', () => {
    const resultado = validarEncomiendasParaManifiesto({
      ids: [1, 2],
      encomiendas: [
        encomienda({ id: 1 }),
        encomienda({ id: 2, codigoTracking: 'ENC-00000002', estadoActual: 'LLEGO_A_DESTINO' })
      ],
      idPuntoUsuario: null
    });
    assert.equal(resultado.status, 400);
    assert.match(resultado.error, /ENC-00000002/);
    assert.doesNotMatch(resultado.error, /ENC-00000001/);
  });

  test('responde 409 si alguna encomienda ya pertenece a un manifiesto, nombrando código y manifiesto', () => {
    const resultado = validarEncomiendasParaManifiesto({
      ids: [1, 2],
      encomiendas: [
        encomienda({ id: 1 }),
        encomienda({ id: 2, codigoTracking: 'ENC-00000002', idManifiesto: 12 })
      ],
      idPuntoUsuario: null
    });
    assert.equal(resultado.status, 409);
    assert.match(resultado.error, /ENC-00000002/);
    assert.match(resultado.error, /MAN-000012/);
  });

  test('responde 403 si un usuario con punto incluye encomiendas ajenas a su punto', () => {
    const resultado = validarEncomiendasParaManifiesto({
      ids: [1, 2],
      encomiendas: [
        encomienda({ id: 1, idPuntoOrigen: 10, idPuntoDestino: 20 }),
        encomienda({ id: 2, codigoTracking: 'ENC-00000002', idPuntoOrigen: 30, idPuntoDestino: 40 })
      ],
      idPuntoUsuario: 20
    });
    assert.equal(resultado.status, 403);
    assert.match(resultado.error, /ENC-00000002/);
  });

  test('un usuario con punto puede incluir encomiendas cuyo origen o destino es su punto', () => {
    const resultado = validarEncomiendasParaManifiesto({
      ids: [1, 2],
      encomiendas: [
        encomienda({ id: 1, idPuntoOrigen: 10, idPuntoDestino: 20 }),
        encomienda({ id: 2, codigoTracking: 'ENC-00000002', idPuntoOrigen: 20, idPuntoDestino: 40 })
      ],
      idPuntoUsuario: 20
    });
    assert.equal(resultado, null);
  });
});

describe('calcularResumenManifiesto', () => {
  test('separa lo pagado de lo que se cobra en destino y suma peso y flete', () => {
    const resumen = calcularResumenManifiesto([
      encomienda({ peso: '4.00', precioCalculado: '34.50', pagoAlRecojo: false }),
      encomienda({ peso: '0.50', precioCalculado: '30.00', pagoAlRecojo: false }),
      encomienda({ peso: '8.00', precioCalculado: '40.00', pagoAlRecojo: true })
    ]);
    assert.deepEqual(resumen, {
      cantidad: 3,
      pesoTotal: 12.5,
      fleteTotal: 104.5,
      pagado: { cantidad: 2, monto: 64.5 },
      porCobrar: { cantidad: 1, monto: 40 }
    });
  });

  test('usa el precio final (con descuento por puntos) cuando existe', () => {
    const resumen = calcularResumenManifiesto([
      encomienda({ precioCalculado: '50.00', precioFinal: '45.00', pagoAlRecojo: true })
    ]);
    assert.equal(resumen.fleteTotal, 45);
    assert.equal(resumen.porCobrar.monto, 45);
  });

  test('redondea los totales a dos decimales', () => {
    const resumen = calcularResumenManifiesto([
      encomienda({ peso: '0.10', precioCalculado: '0.10' }),
      encomienda({ peso: '0.20', precioCalculado: '0.20' })
    ]);
    assert.equal(resumen.pesoTotal, 0.3);
    assert.equal(resumen.fleteTotal, 0.3);
  });
});

describe('combinarDatosEmpresa', () => {
  const sunat = {
    razonSocial: 'EMPRESA DE TURISMO CRUZ SELVATICO S.A.C.',
    ruc: '20600812727',
    direccion: 'Cal. Fiscal 270'
  };
  const sistema = {
    nombreEmpresa: 'CRUZ SELVATICO',
    ruc: '20111111111',
    direccion: 'Av. Comercial 100',
    telefono: '991075959'
  };

  test('prioriza los datos fiscales de SUNAT y toma el teléfono de la configuración del sistema', () => {
    assert.deepEqual(combinarDatosEmpresa(sunat, sistema), {
      razonSocial: 'EMPRESA DE TURISMO CRUZ SELVATICO S.A.C.',
      ruc: '20600812727',
      direccion: 'Cal. Fiscal 270',
      telefono: '991075959'
    });
  });

  test('usa la configuración del sistema cuando no hay configuración SUNAT', () => {
    assert.deepEqual(combinarDatosEmpresa(null, sistema), {
      razonSocial: 'CRUZ SELVATICO',
      ruc: '20111111111',
      direccion: 'Av. Comercial 100',
      telefono: '991075959'
    });
  });

  test('completa con el sistema los campos SUNAT vacíos y deja null lo que no existe', () => {
    assert.deepEqual(combinarDatosEmpresa({ razonSocial: 'RAZON SAC', ruc: '', direccion: null }, null), {
      razonSocial: 'RAZON SAC',
      ruc: null,
      direccion: null,
      telefono: null
    });
  });
});

describe('formatearNumeroManifiesto', () => {
  test('antepone MAN- y completa con ceros a seis dígitos', () => {
    assert.equal(formatearNumeroManifiesto(13), 'MAN-000013');
    assert.equal(formatearNumeroManifiesto(1234567), 'MAN-1234567');
  });
});
