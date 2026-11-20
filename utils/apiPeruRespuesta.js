/**
 * Clasificación de las respuestas fallidas de apiperu.dev
 *
 * Distingue "el documento no existe" de los problemas del servicio (cuota del plan
 * agotada, token inválido, API caída). Antes todo se respondía como 404 y el
 * usuario veía "DNI no encontrado" con DNIs válidos cuando se agotaba la cuota.
 *
 * Ningún fallo usa HTTP 401: el interceptor del frontend lo interpreta como sesión
 * vencida y cerraría la sesión del usuario.
 */

// Mensajes para el usuario: qué pasó, cómo seguir trabajando y, si no se arregla
// solo, qué debe hacer el administrador.
const FALLOS_API_PERU = {
  NO_ENCONTRADO: {
    httpStatus: 404,
    mensaje: null // se usa el mensaje propio de cada consulta
  },
  CUOTA_AGOTADA: {
    httpStatus: 429,
    mensaje: 'Se acabaron las consultas de DNI/RUC del mes. Escriba los datos a mano para continuar y avise al administrador para que renueve el plan de API Perú (apiperu.dev).'
  },
  TOKEN_INVALIDO: {
    httpStatus: 503,
    mensaje: 'La búsqueda de DNI/RUC no está configurada. Escriba los datos a mano para continuar y avise al administrador para que revise el token de API Perú en el servidor.'
  },
  SERVICIO_NO_DISPONIBLE: {
    httpStatus: 503,
    mensaje: 'El servicio de búsqueda de DNI/RUC (API Perú) no responde. Escriba los datos a mano o vuelva a intentar en unos minutos.'
  }
};

/**
 * Tipo de fallo de una respuesta de apiperu.dev que no trajo datos
 * @param {Object} params
 * @param {number} params.status - HTTP de apiperu.dev (0 si no hubo respuesta)
 * @param {string} [params.code] - Campo `code` del JSON de apiperu.dev
 * @param {boolean} [params.respuestaInvalida] - La respuesta no era JSON (p. ej. HTML)
 * @returns {string} Clave de FALLOS_API_PERU
 */
const clasificarFalloApiPeru = ({ status, code, respuestaInvalida = false }) => {
  if (status === 429 || code === 'PLAN_LIMIT_REACHED') return 'CUOTA_AGOTADA';
  if (respuestaInvalida) return 'SERVICIO_NO_DISPONIBLE';
  if (status === 401 || status === 403) return 'TOKEN_INVALIDO';
  if (!status || status >= 500) return 'SERVICIO_NO_DISPONIBLE';
  return 'NO_ENCONTRADO';
};

/**
 * Respuesta HTTP para un fallo de consulta
 * @param {string} [tipo] - Clave de FALLOS_API_PERU (sin tipo = NO_ENCONTRADO)
 * @param {string} mensajeNoEncontrado - Mensaje cuando el documento no existe
 * @returns {{ httpStatus: number, codigo: string, mensaje: string }}
 */
const describirFalloApiPeru = (tipo, mensajeNoEncontrado) => {
  const codigo = FALLOS_API_PERU[tipo] ? tipo : 'NO_ENCONTRADO';
  const fallo = FALLOS_API_PERU[codigo];
  return {
    httpStatus: fallo.httpStatus,
    codigo,
    mensaje: fallo.mensaje || mensajeNoEncontrado
  };
};

module.exports = {
  FALLOS_API_PERU,
  clasificarFalloApiPeru,
  describirFalloApiPeru
};
