/**
 * Pruebas de utils/apiPeruRespuesta
 * Ejecutar: npm test (node --test)
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  clasificarFalloApiPeru,
  describirFalloApiPeru,
  FALLOS_API_PERU
} = require('../utils/apiPeruRespuesta');

describe('clasificarFalloApiPeru', () => {
  test('cuota del plan agotada (respuesta real de apiperu.dev: 429 PLAN_LIMIT_REACHED)', () => {
    assert.equal(clasificarFalloApiPeru({ status: 429, code: 'PLAN_LIMIT_REACHED' }), 'CUOTA_AGOTADA');
  });

  test('el código PLAN_LIMIT_REACHED basta aunque el HTTP no sea 429', () => {
    assert.equal(clasificarFalloApiPeru({ status: 200, code: 'PLAN_LIMIT_REACHED' }), 'CUOTA_AGOTADA');
  });

  test('401 y 403 con JSON son token inválido', () => {
    assert.equal(clasificarFalloApiPeru({ status: 401 }), 'TOKEN_INVALIDO');
    assert.equal(clasificarFalloApiPeru({ status: 403 }), 'TOKEN_INVALIDO');
  });

  test('error de red (status 0) y errores 5xx son servicio no disponible', () => {
    assert.equal(clasificarFalloApiPeru({ status: 0 }), 'SERVICIO_NO_DISPONIBLE');
    assert.equal(clasificarFalloApiPeru({ status: 500 }), 'SERVICIO_NO_DISPONIBLE');
    assert.equal(clasificarFalloApiPeru({ status: 502 }), 'SERVICIO_NO_DISPONIBLE');
  });

  test('respuesta que no es JSON (HTML de Cloudflare) es servicio no disponible aunque sea 403', () => {
    assert.equal(clasificarFalloApiPeru({ status: 403, respuestaInvalida: true }), 'SERVICIO_NO_DISPONIBLE');
  });

  test('API Perú respondió sin datos: el documento no se encontró', () => {
    assert.equal(clasificarFalloApiPeru({ status: 200 }), 'NO_ENCONTRADO');
    assert.equal(clasificarFalloApiPeru({ status: 404 }), 'NO_ENCONTRADO');
    assert.equal(clasificarFalloApiPeru({ status: 422 }), 'NO_ENCONTRADO');
  });
});

describe('describirFalloApiPeru', () => {
  test('cuota agotada responde 429 con un mensaje que lo dice, no "no encontrado"', () => {
    const fallo = describirFalloApiPeru('CUOTA_AGOTADA', 'No se encontraron datos');
    assert.equal(fallo.httpStatus, 429);
    assert.equal(fallo.codigo, 'CUOTA_AGOTADA');
    assert.match(fallo.mensaje, /se acabaron las consultas/i);
    assert.doesNotMatch(fallo.mensaje, /no se encontraron/i);
  });

  test('cada fallo del servicio le dice al usuario cómo continuar', () => {
    for (const tipo of ['CUOTA_AGOTADA', 'TOKEN_INVALIDO', 'SERVICIO_NO_DISPONIBLE']) {
      assert.match(describirFalloApiPeru(tipo, 'x').mensaje, /escriba los datos a mano/i, tipo);
    }
  });

  test('cuota agotada y token inválido piden avisar al administrador con lo que debe hacer', () => {
    assert.match(describirFalloApiPeru('CUOTA_AGOTADA', 'x').mensaje, /avise al administrador.*renueve el plan/i);
    assert.match(describirFalloApiPeru('TOKEN_INVALIDO', 'x').mensaje, /avise al administrador.*revise el token/i);
  });

  test('API caída sugiere reintentar', () => {
    assert.match(describirFalloApiPeru('SERVICIO_NO_DISPONIBLE', 'x').mensaje, /vuelva a intentar/i);
  });

  test('no encontrado responde 404 con el mensaje recibido', () => {
    const fallo = describirFalloApiPeru('NO_ENCONTRADO', 'No se encontraron resultados.');
    assert.deepEqual(fallo, { httpStatus: 404, codigo: 'NO_ENCONTRADO', mensaje: 'No se encontraron resultados.' });
  });

  test('sin tipo de fallo se trata como no encontrado', () => {
    const fallo = describirFalloApiPeru(undefined, 'DNI sin datos');
    assert.equal(fallo.httpStatus, 404);
    assert.equal(fallo.codigo, 'NO_ENCONTRADO');
    assert.equal(fallo.mensaje, 'DNI sin datos');
  });

  test('ningún fallo responde 401: el frontend cerraría la sesión del usuario', () => {
    for (const tipo of Object.keys(FALLOS_API_PERU)) {
      assert.notEqual(describirFalloApiPeru(tipo, 'x').httpStatus, 401, tipo);
    }
  });
});
