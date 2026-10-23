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
  combinarDatosEmpresa,
  normalizarDatosViaje,
  formatearViaje,
  esManifiestoVisible
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

  test('responde 400 si las encomiendas tienen distinto origen', () => {
    const resultado = validarEncomiendasParaManifiesto({
      ids: [1, 2],
      encomiendas: [
        encomienda({ id: 1, idPuntoOrigen: 10 }),
        encomienda({ id: 2, codigoTracking: 'ENC-00000002', idPuntoOrigen: 30 })
      ],
      idPuntoUsuario: null,
      idPuntoDestino: 20
    });
    assert.equal(resultado.status, 400);
    assert.match(resultado.error, /mismo origen/);
  });

  test('responde 403 si un usuario con punto incluye encomiendas que no salen de su punto', () => {
    const resultado = validarEncomiendasParaManifiesto({
      ids: [1, 2],
      encomiendas: [
        encomienda({ id: 1, idPuntoOrigen: 10, idPuntoDestino: 20 }),
        encomienda({ id: 2, codigoTracking: 'ENC-00000002', idPuntoOrigen: 10, idPuntoDestino: 20 })
      ],
      idPuntoUsuario: 20,
      idPuntoDestino: 30
    });
    assert.equal(resultado.status, 403);
  });

  test('con punto, una encomienda ajena responde 403 sin revelar su código, estado ni manifiesto', () => {
    const resultado = validarEncomiendasParaManifiesto({
      ids: [1, 2],
      encomiendas: [
        encomienda({ id: 1, idPuntoOrigen: 10 }),
        encomienda({ id: 2, codigoTracking: 'ENC-00000002', idPuntoOrigen: 30, estadoActual: 'LLEGO_A_DESTINO', idManifiesto: 12 })
      ],
      idPuntoUsuario: 10,
      idPuntoDestino: 20
    });
    assert.equal(resultado.status, 403);
    assert.doesNotMatch(resultado.error, /ENC-00000002|MAN-000012|LLEGO/);
  });

  test('un usuario con punto genera el manifiesto de lo que sale de su punto', () => {
    const resultado = validarEncomiendasParaManifiesto({
      ids: [1, 2],
      encomiendas: [
        encomienda({ id: 1, idPuntoOrigen: 10, idPuntoDestino: 20 }),
        encomienda({ id: 2, codigoTracking: 'ENC-00000002', idPuntoOrigen: 10, idPuntoDestino: 40 })
      ],
      idPuntoUsuario: 10,
      idPuntoDestino: 40
    });
    assert.equal(resultado, null);
  });

  test('responde 400 si el destino final es el mismo origen', () => {
    const resultado = validarEncomiendasParaManifiesto({
      ids: [1],
      encomiendas: [encomienda({ id: 1, idPuntoOrigen: 10 })],
      idPuntoUsuario: null,
      idPuntoDestino: 10
    });
    assert.equal(resultado.status, 400);
    assert.match(resultado.error, /destino/);
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
    direccion: 'Cal. Ingobert Witting Nro. 270',
    departamento: 'PASCO',
    provincia: 'OXAPAMPA',
    distrito: 'POZUZO'
  };
  const sistema = {
    nombreEmpresa: 'CRUZ SELVATICO',
    ruc: '20111111111',
    direccion: 'Av. Comercial 100'
  };

  test('arma el domicilio fiscal con dirección y departamento-provincia-distrito de SUNAT', () => {
    assert.deepEqual(combinarDatosEmpresa(sunat, sistema), {
      razonSocial: 'EMPRESA DE TURISMO CRUZ SELVATICO S.A.C.',
      ruc: '20600812727',
      domicilioFiscal: 'Cal. Ingobert Witting Nro. 270 PASCO-OXAPAMPA-POZUZO'
    });
  });

  test('omite las partes de la ubicación que no existen', () => {
    const { domicilioFiscal } = combinarDatosEmpresa({ ...sunat, departamento: null, distrito: '' }, null);
    assert.equal(domicilioFiscal, 'Cal. Ingobert Witting Nro. 270 OXAPAMPA');
  });

  test('usa la configuración del sistema cuando no hay configuración SUNAT', () => {
    assert.deepEqual(combinarDatosEmpresa(null, sistema), {
      razonSocial: 'CRUZ SELVATICO',
      ruc: '20111111111',
      domicilioFiscal: 'Av. Comercial 100'
    });
  });

  test('deja null lo que no existe en ninguna configuración', () => {
    assert.deepEqual(combinarDatosEmpresa({ razonSocial: 'RAZON SAC', ruc: '', direccion: null }, null), {
      razonSocial: 'RAZON SAC',
      ruc: null,
      domicilioFiscal: null
    });
  });
});

describe('normalizarDatosViaje', () => {
  const viaje = (datos = {}) => ({
    idPuntoDestino: '20',
    fechaSalida: '2026-10-15',
    horaSalida: '7:05',
    idConductor: 3,
    idBus: '2',
    ...datos
  });

  test('convierte ids a enteros y completa la hora con ceros', () => {
    assert.deepEqual(normalizarDatosViaje(viaje()), {
      viaje: { idPuntoDestino: 20, fechaSalida: '2026-10-15', horaSalida: '07:05', idConductor: 3, idBus: 2 }
    });
  });

  test('exige los cinco datos del viaje', () => {
    for (const campo of ['idPuntoDestino', 'fechaSalida', 'horaSalida', 'idConductor', 'idBus']) {
      assert.ok(normalizarDatosViaje(viaje({ [campo]: '' })).error, campo);
    }
  });

  test('rechaza una fecha que no existe', () => {
    assert.ok(normalizarDatosViaje(viaje({ fechaSalida: '2026-02-31' })).error);
    assert.ok(normalizarDatosViaje(viaje({ fechaSalida: '15/10/2026' })).error);
  });

  test('rechaza una hora fuera de rango', () => {
    assert.ok(normalizarDatosViaje(viaje({ horaSalida: '25:00' })).error);
    assert.ok(normalizarDatosViaje(viaje({ horaSalida: '10pm' })).error);
  });

  test('rechaza ids que no son enteros positivos', () => {
    assert.ok(normalizarDatosViaje(viaje({ idConductor: 'abc' })).error);
    assert.ok(normalizarDatosViaje(viaje({ idBus: -1 })).error);
    assert.ok(normalizarDatosViaje(viaje({ idPuntoDestino: 1.5 })).error);
  });

  test('rechaza un cuerpo vacío', () => {
    assert.ok(normalizarDatosViaje(undefined).error);
  });
});

describe('formatearViaje', () => {
  test('agrupa oficina, destino, salida, conductor y bus', () => {
    assert.deepEqual(formatearViaje({
      oficinaNombre: 'Terminal Pozuzo', oficinaCiudad: 'Pozuzo', oficinaDireccion: 'Jr. Principal 1',
      destinoNombre: 'Agencia Huánuco', destinoCiudad: 'Huánuco', destinoDireccion: 'Av. Central 2',
      fechaSalida: '2026-10-15', horaSalida: '22:00',
      conductorNombre: 'Samuel Sedano', conductorLicencia: 'Q44460662',
      busNumeroInterno: '0100', busPlaca: 'CAY715', busMarca: 'Mercedes Benz', busCertificadoInscripcion: '15M24045621E'
    }), {
      oficina: { nombre: 'Terminal Pozuzo', ciudad: 'Pozuzo', direccion: 'Jr. Principal 1' },
      destino: { nombre: 'Agencia Huánuco', ciudad: 'Huánuco', direccion: 'Av. Central 2' },
      fechaSalida: '2026-10-15',
      horaSalida: '22:00',
      conductor: { nombre: 'Samuel Sedano', licencia: 'Q44460662' },
      bus: { numeroInterno: '0100', placa: 'CAY715', marca: 'Mercedes Benz', certificadoInscripcion: '15M24045621E' }
    });
  });

  test('un manifiesto antiguo sin datos del viaje queda con nulls', () => {
    assert.deepEqual(formatearViaje({}), {
      oficina: null,
      destino: null,
      fechaSalida: null,
      horaSalida: null,
      conductor: { nombre: null, licencia: null },
      bus: { numeroInterno: null, placa: null, marca: null, certificadoInscripcion: null }
    });
  });
});

describe('esManifiestoVisible', () => {
  test('un usuario sin punto ve todos los manifiestos', () => {
    assert.equal(esManifiestoVisible(null, 10), true);
    assert.equal(esManifiestoVisible(null, null), true);
  });

  test('un usuario con punto ve solo los que salen de su punto', () => {
    assert.equal(esManifiestoVisible(10, 10), true);
    assert.equal(esManifiestoVisible(20, 10), false);
    assert.equal(esManifiestoVisible(10, null), false);
  });
});

describe('formatearNumeroManifiesto', () => {
  test('antepone MAN- y completa con ceros a seis dígitos', () => {
    assert.equal(formatearNumeroManifiesto(13), 'MAN-000013');
    assert.equal(formatearNumeroManifiesto(1234567), 'MAN-1234567');
  });
});
