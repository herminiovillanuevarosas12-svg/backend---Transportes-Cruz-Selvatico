/**
 * Pruebas de services/flotaService (lógica pura, sin BD)
 * Ejecutar: npm test (node --test)
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizarConductor,
  normalizarBus,
  formatearConductor,
  formatearBus,
  aColumnas
} = require('../services/flotaService');

const conductor = (datos = {}) => ({
  tipoDocumento: '1',
  numeroDocumento: '45678912',
  nombres: '  Samuel Elias ',
  apellidos: 'Sedano Torres',
  licencia: 'q44460662',
  ...datos
});

const bus = (datos = {}) => ({
  idTipoCarro: '3',
  numeroInterno: ' 0100 ',
  placa: 'cay715',
  marca: 'Mercedes Benz',
  certificadoInscripcion: '15m24045621e',
  ...datos
});

describe('normalizarConductor', () => {
  test('limpia espacios y pone la licencia en mayúsculas', () => {
    assert.deepEqual(normalizarConductor(conductor()), {
      datos: {
        tipoDocumento: '1',
        numeroDocumento: '45678912',
        nombres: 'Samuel Elias',
        apellidos: 'Sedano Torres',
        licencia: 'Q44460662'
      }
    });
  });

  test('acepta carnet de extranjería', () => {
    const { datos, error } = normalizarConductor(conductor({ tipoDocumento: '4', numeroDocumento: 'AB1234567' }));
    assert.equal(error, undefined);
    assert.equal(datos.tipoDocumento, '4');
  });

  test('rechaza un DNI inválido mencionando al conductor', () => {
    const { error } = normalizarConductor(conductor({ numeroDocumento: '123' }));
    assert.match(error, /conductor/);
  });

  test('rechaza un RUC: el conductor es una persona', () => {
    assert.ok(normalizarConductor(conductor({ tipoDocumento: '6', numeroDocumento: '20600812727' })).error);
  });

  test('exige nombres, apellidos y licencia', () => {
    assert.ok(normalizarConductor(conductor({ nombres: '  ' })).error);
    assert.ok(normalizarConductor(conductor({ apellidos: undefined })).error);
    assert.ok(normalizarConductor(conductor({ licencia: '' })).error);
  });

  test('rechaza textos más largos que la columna', () => {
    assert.ok(normalizarConductor(conductor({ licencia: 'X'.repeat(21) })).error);
    assert.ok(normalizarConductor(conductor({ nombres: 'X'.repeat(151) })).error);
  });
});

describe('normalizarBus', () => {
  test('limpia espacios y pone placa y certificado en mayúsculas', () => {
    assert.deepEqual(normalizarBus(bus()), {
      datos: {
        idTipoCarro: 3,
        numeroInterno: '0100',
        placa: 'CAY715',
        marca: 'Mercedes Benz',
        certificadoInscripcion: '15M24045621E'
      }
    });
  });

  test('exige todos los campos', () => {
    for (const campo of ['numeroInterno', 'placa', 'marca', 'certificadoInscripcion']) {
      assert.ok(normalizarBus(bus({ [campo]: ' ' })).error, campo);
    }
  });

  test('rechaza una placa de más de 10 caracteres', () => {
    assert.ok(normalizarBus(bus({ placa: 'ABC-1234567' })).error);
  });

  test('exige un tipo de vehículo válido', () => {
    for (const idTipoCarro of [undefined, '', 'abc', 0, -1, 1.5]) {
      assert.equal(normalizarBus(bus({ idTipoCarro })).error, 'Seleccione el tipo de vehículo', String(idTipoCarro));
    }
  });
});

describe('formatear', () => {
  test('conductor en camelCase con nombre completo', () => {
    assert.deepEqual(
      formatearConductor({
        id: 3, tipo_documento: '1', numero_documento: '45678912',
        nombres: 'Samuel Elias', apellidos: 'Sedano Torres', licencia: 'Q44460662', estado: 1
      }),
      {
        id: 3, tipoDocumento: '1', numeroDocumento: '45678912', nombres: 'Samuel Elias',
        apellidos: 'Sedano Torres', nombreCompleto: 'Samuel Elias Sedano Torres', licencia: 'Q44460662', estado: 1
      }
    );
  });

  test('bus en camelCase con el nombre de su tipo de vehículo', () => {
    assert.deepEqual(
      formatearBus({
        id: 2, id_tipo_carro: 3, numero_interno: '0100', placa: 'CAY715', marca: 'Mercedes Benz',
        certificado_inscripcion: '15M24045621E', estado: 1, tbl_tipos_carro: { nombre: 'Bus Estándar' }
      }),
      {
        id: 2, idTipoCarro: 3, tipoCarro: 'Bus Estándar', numeroInterno: '0100', placa: 'CAY715',
        marca: 'Mercedes Benz', certificadoInscripcion: '15M24045621E', estado: 1
      }
    );
  });
});

describe('formatearBus sin la relación', () => {
  test('una fila leída con SQL directo (copia al manifiesto) no trae el tipo de vehículo', () => {
    const resultado = formatearBus({
      id: 2, id_tipo_carro: 3, numero_interno: '0100', placa: 'CAY715', marca: 'Mercedes Benz',
      certificado_inscripcion: '15M24045621E', estado: 1
    });
    assert.equal(resultado.tipoCarro, null);
    assert.equal(resultado.placa, 'CAY715');
  });
});

describe('aColumnas', () => {
  test('convierte los datos normalizados a columnas snake_case', () => {
    assert.deepEqual(
      aColumnas({ idTipoCarro: 3, numeroInterno: '0100', placa: 'CAY715', certificadoInscripcion: '15M' }),
      { id_tipo_carro: 3, numero_interno: '0100', placa: 'CAY715', certificado_inscripcion: '15M' }
    );
  });
});
