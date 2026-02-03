/**
 * KEYFACIL Service
 * Servicio de comunicación con la API KEYFACIL para facturación electrónica
 *
 * Endpoints:
 * - POST /invoices - Enviar comprobante
 * - POST /invoices/{id} - Consultar estado
 * - POST /invoices/{id}/void - Anular comprobante
 * - POST /despatch-documents - Enviar guía de remisión
 */

const prisma = require('../config/prisma');

// URL base de KEYFACIL
const KEYFACIL_BASE_URL = 'https://api.vitekey.com/keyfact/integra/v1';

/**
 * Obtener configuración de facturación desde la BD
 * @returns {Object} Configuración activa
 */
const getConfig = async () => {
  const config = await prisma.$queryRaw`
    SELECT
      id,
      ruc_emisor as "rucEmisor",
      razon_social as "razonSocial",
      nombre_comercial as "nombreComercial",
      direccion_fiscal as "direccionFiscal",
      ubigeo,
      departamento,
      provincia,
      distrito,
      keyfacil_token as "keyfacilToken",
      keyfacil_url as "keyfacilUrl",
      modo_produccion as "modoProduccion",
      igv_porcentaje as "igvPorcentaje"
    FROM tbl_configuracion_sunat
    WHERE activo = true
    LIMIT 1
  `;

  if (!config || config.length === 0) {
    throw new Error('No hay configuración de facturación activa');
  }

  return config[0];
};

/**
 * Registrar log de comunicación con KEYFACIL
 * @param {Object} params - Parámetros del log
 */
const logRequest = async ({
  endpoint,
  metodo,
  requestBody,
  responseStatus,
  responseBody,
  tiempoRespuestaMs,
  idComprobante = null,
  idGuia = null
}) => {
  try {
    await prisma.$executeRaw`
      INSERT INTO tbl_log_keyfacil (
        endpoint, metodo, request_body, response_status, response_body,
        tiempo_respuesta_ms, id_comprobante, id_guia
      ) VALUES (
        ${endpoint}, ${metodo}, ${JSON.stringify(requestBody)}::jsonb,
        ${responseStatus}, ${JSON.stringify(responseBody)}::jsonb,
        ${tiempoRespuestaMs}, ${idComprobante}, ${idGuia}
      )
    `;
  } catch (error) {
    console.error('Error registrando log KEYFACIL:', error);
  }
};

/**
 * Realizar petición HTTP a KEYFACIL
 * @param {string} endpoint - Endpoint relativo
 * @param {string} method - Método HTTP
 * @param {Object} body - Body de la petición
 * @param {string} token - Token de autenticación
 * @param {number|null} idComprobante - ID del comprobante para log
 * @param {number|null} idGuia - ID de la guía para log
 * @returns {Object} Respuesta de KEYFACIL
 */
const makeRequest = async (endpoint, method, body, token, idComprobante = null, idGuia = null) => {
  const config = await getConfig();
  const baseUrl = config.keyfacilUrl || KEYFACIL_BASE_URL;
  const url = `${baseUrl}${endpoint}`;

  const startTime = Date.now();
  let responseStatus = 0;
  let responseBody = {};

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token || config.keyfacilToken}`
      },
      body: body ? JSON.stringify(body) : undefined
    });

    responseStatus = response.status;
    responseBody = await response.json();

    const tiempoRespuestaMs = Date.now() - startTime;

    // Registrar log
    await logRequest({
      endpoint,
      metodo: method,
      requestBody: body,
      responseStatus,
      responseBody,
      tiempoRespuestaMs,
      idComprobante,
      idGuia
    });

    return {
      success: response.ok,
      status: responseStatus,
      data: responseBody
    };
  } catch (error) {
    const tiempoRespuestaMs = Date.now() - startTime;

    // Registrar log de error
    await logRequest({
      endpoint,
      metodo: method,
      requestBody: body,
      responseStatus: 0,
      responseBody: { error: error.message },
      tiempoRespuestaMs,
      idComprobante,
      idGuia
    });

    return {
      success: false,
      status: 0,
      data: { error: error.message }
    };
  }
};

/**
 * Enviar comprobante (Factura/Boleta) a KEYFACIL
 * @param {Object} payload - Payload del comprobante en formato KEYFACIL
 * @param {number|null} idComprobante - ID del comprobante en BD
 * @returns {Object} Respuesta de KEYFACIL
 */
const enviarComprobante = async (payload, idComprobante = null) => {
  return await makeRequest('/invoices', 'POST', payload, null, idComprobante);
};

/**
 * Consultar estado de un comprobante
 * @param {string} keyfacilId - ID del comprobante en KEYFACIL
 * @param {number|null} idComprobante - ID del comprobante en BD
 * @returns {Object} Respuesta de KEYFACIL
 */
const consultarComprobante = async (keyfacilId, idComprobante = null) => {
  return await makeRequest(`/invoices/${keyfacilId}`, 'POST', null, null, idComprobante);
};

/**
 * Anular comprobante
 * @param {string} keyfacilId - ID del comprobante en KEYFACIL
 * @param {string} motivo - Motivo de anulación
 * @param {number|null} idComprobante - ID del comprobante en BD
 * @returns {Object} Respuesta de KEYFACIL
 */
const anularComprobante = async (keyfacilId, motivo, idComprobante = null) => {
  return await makeRequest(`/invoices/${keyfacilId}/void`, 'POST', { motivo }, null, idComprobante);
};

/**
 * Enviar guía de remisión a KEYFACIL
 * @param {Object} payload - Payload de la guía en formato KEYFACIL
 * @param {number|null} idGuia - ID de la guía en BD
 * @returns {Object} Respuesta de KEYFACIL
 */
const enviarGuiaRemision = async (payload, idGuia = null) => {
  return await makeRequest('/despatch-documents', 'POST', payload, null, null, idGuia);
};

/**
 * Consultar estado de una guía de remisión
 * @param {string} keyfacilId - ID de la guía en KEYFACIL
 * @param {number|null} idGuia - ID de la guía en BD
 * @returns {Object} Respuesta de KEYFACIL
 */
const consultarGuiaRemision = async (keyfacilId, idGuia = null) => {
  return await makeRequest(`/despatch-documents/${keyfacilId}`, 'POST', { incluir_pdf: true, incluir_xml: false }, null, null, idGuia);
};

/**
 * Anular guía de remisión
 * @param {string} keyfacilId - ID de la guía en KEYFACIL
 * @param {string} motivo - Motivo de anulación
 * @param {number|null} idGuia - ID de la guía en BD
 * @returns {Object} Respuesta de KEYFACIL
 */
const anularGuiaRemision = async (keyfacilId, motivo, idGuia = null) => {
  return await makeRequest(`/despatch-documents/${keyfacilId}/void`, 'POST', { motivo }, null, null, idGuia);
};

module.exports = {
  getConfig,
  logRequest,
  enviarComprobante,
  consultarComprobante,
  anularComprobante,
  enviarGuiaRemision,
  consultarGuiaRemision,
  anularGuiaRemision
};
