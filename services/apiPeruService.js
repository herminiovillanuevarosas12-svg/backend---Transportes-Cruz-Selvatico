/**
 * API Peru Service
 * Servicio de comunicación con apiperu.dev para consultas de DNI y RUC
 * Incluye sistema de cache en BD para optimizar limite de consultas (100/mes)
 *
 * Endpoints:
 * - POST /api/dni - Consultar datos de persona por DNI
 * - POST /api/ruc - Consultar datos de empresa por RUC
 */

const prisma = require('../config/prisma');

// URL base de API Peru
const APIPERU_BASE_URL = 'https://apiperu.dev/api';

// TTL del cache en dias
const CACHE_TTL_DNI = 30; // DNI no cambia frecuentemente
const CACHE_TTL_RUC = 7;  // RUC puede cambiar (estado, direccion)

/**
 * Obtener token de API Peru desde variables de entorno
 * @returns {string} Token de autenticación
 */
const getToken = () => {
  const token = process.env.APIPERU_TOKEN;
  if (!token) {
    throw new Error('APIPERU_TOKEN no configurado en variables de entorno');
  }
  return token;
};

/**
 * Buscar en cache de BD
 * @param {string} tipo - 'DNI' o 'RUC'
 * @param {string} numero - Numero del documento
 * @returns {Object|null} Datos cacheados o null si no existe/expirado
 */
const buscarEnCache = async (tipo, numero) => {
  try {
    const resultado = await prisma.$queryRaw`
      SELECT datos_respuesta, fecha_expiracion
      FROM tbl_cache_consulta_doc
      WHERE tipo_documento = ${tipo}
        AND numero_documento = ${numero}
        AND fecha_expiracion > NOW()
    `;

    if (resultado && resultado.length > 0) {
      // Incrementar contador de hits
      await prisma.$executeRaw`
        UPDATE tbl_cache_consulta_doc
        SET consultas_count = consultas_count + 1
        WHERE tipo_documento = ${tipo} AND numero_documento = ${numero}
      `;
      return resultado[0].datos_respuesta;
    }
    return null;
  } catch (error) {
    console.error('Error buscando en cache:', error);
    return null;
  }
};

/**
 * Guardar resultado en cache
 * @param {string} tipo - 'DNI' o 'RUC'
 * @param {string} numero - Numero del documento
 * @param {Object} datos - Datos a cachear
 */
const guardarEnCache = async (tipo, numero, datos) => {
  try {
    const ttlDias = tipo === 'DNI' ? CACHE_TTL_DNI : CACHE_TTL_RUC;
    const datosJson = JSON.stringify(datos);

    await prisma.$executeRaw`
      INSERT INTO tbl_cache_consulta_doc (tipo_documento, numero_documento, datos_respuesta, fecha_expiracion)
      VALUES (${tipo}, ${numero}, ${datosJson}::jsonb, NOW() + ${ttlDias + ' days'}::interval)
      ON CONFLICT (tipo_documento, numero_documento)
      DO UPDATE SET
        datos_respuesta = ${datosJson}::jsonb,
        fecha_consulta = NOW(),
        fecha_expiracion = NOW() + ${ttlDias + ' days'}::interval,
        consultas_count = tbl_cache_consulta_doc.consultas_count + 1
    `;
  } catch (error) {
    console.error('Error guardando en cache:', error);
  }
};

/**
 * Realizar petición HTTP a API Peru
 * @param {string} endpoint - Endpoint relativo (/dni o /ruc)
 * @param {Object} body - Body de la petición
 * @returns {Object} Respuesta de API Peru
 */
const makeRequest = async (endpoint, body) => {
  const url = `${APIPERU_BASE_URL}${endpoint}`;
  const token = getToken();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });

    // Leer respuesta como texto primero para diagnosticar
    const responseText = await response.text();

    // Detectar si es HTML en lugar de JSON
    if (responseText.startsWith('<!DOCTYPE') || responseText.startsWith('<html')) {
      console.error(`[API Peru] ERROR: Recibido HTML en lugar de JSON. Status: ${response.status}`);
      console.error(`[API Peru] Primeros 200 chars: ${responseText.substring(0, 200)}`);
      return {
        success: false,
        status: response.status,
        data: null,
        message: 'Error del servidor API Peru - respuesta inesperada'
      };
    }

    // Intentar parsear como JSON
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (parseError) {
      console.error('[API Peru] Error parseando respuesta JSON');
      return {
        success: false,
        status: response.status,
        data: null,
        message: 'Respuesta inválida de API Peru'
      };
    }

    return {
      success: response.ok && responseData.success,
      status: response.status,
      data: responseData.data || null,
      message: responseData.message || null
    };
  } catch (error) {
    console.error(`[API Peru] Error de red llamando a ${endpoint}:`, error.message);
    return {
      success: false,
      status: 0,
      data: null,
      message: `Error de conexión: ${error.message}`
    };
  }
};

/**
 * Consultar DNI con cache
 * @param {string} dni - DNI de 8 digitos
 * @returns {Object} { success, data, source: 'cache'|'api' }
 */
const consultarDni = async (dni) => {
  // Validar formato
  if (!dni || !/^\d{8}$/.test(dni)) {
    return {
      success: false,
      data: null,
      message: 'DNI inválido. Debe tener exactamente 8 dígitos.'
    };
  }

  // Buscar en cache
  const cacheado = await buscarEnCache('DNI', dni);
  if (cacheado) {
    return {
      success: true,
      data: cacheado,
      source: 'cache'
    };
  }

  // Consultar API
  const resultado = await makeRequest('/dni', { dni });

  if (resultado.success && resultado.data) {
    // Guardar en cache
    await guardarEnCache('DNI', dni, resultado.data);
    return {
      success: true,
      data: resultado.data,
      source: 'api'
    };
  }

  return {
    success: false,
    data: null,
    message: resultado.message || 'No se encontraron datos para el DNI proporcionado'
  };
};

/**
 * Consultar RUC con cache
 * @param {string} ruc - RUC de 11 digitos
 * @returns {Object} { success, data, source: 'cache'|'api' }
 */
const consultarRuc = async (ruc) => {
  // Validar formato
  if (!ruc || !/^\d{11}$/.test(ruc)) {
    return {
      success: false,
      data: null,
      message: 'RUC inválido. Debe tener exactamente 11 dígitos.'
    };
  }

  // Buscar en cache
  const cacheado = await buscarEnCache('RUC', ruc);
  if (cacheado) {
    return {
      success: true,
      data: cacheado,
      source: 'cache'
    };
  }

  // Consultar API
  const resultado = await makeRequest('/ruc', { ruc });

  if (resultado.success && resultado.data) {
    // Guardar en cache
    await guardarEnCache('RUC', ruc, resultado.data);
    return {
      success: true,
      data: resultado.data,
      source: 'api'
    };
  }

  return {
    success: false,
    data: null,
    message: resultado.message || 'No se encontraron datos para el RUC proporcionado'
  };
};

/**
 * Limpiar cache expirado (para mantenimiento)
 * @returns {number} Registros eliminados
 */
const limpiarCacheExpirado = async () => {
  try {
    const resultado = await prisma.$executeRaw`
      DELETE FROM tbl_cache_consulta_doc
      WHERE fecha_expiracion < NOW()
    `;
    return resultado;
  } catch (error) {
    console.error('Error limpiando cache expirado:', error);
    return 0;
  }
};

module.exports = {
  consultarDni,
  consultarRuc,
  limpiarCacheExpirado
};
