/**
 * KEYFACIL Archivos Service
 *
 * Resuelve el PDF/XML de un comprobante o guía emitido en KEYFACIL, en este orden:
 *   1. Contenido incluido en la respuesta de emisión guardada en BD (keyfacil_response)
 *   2. URL conocida (en la respuesta guardada o en pdf_url/xml_url), descargada en servidor
 *   3. Consulta a KEYFACIL (incluir_pdf / incluir_xml) y, si devuelve URL, se persiste
 *
 * Siempre entrega bytes al cliente desde nuestro backend: nunca redirige al
 * navegador a un dominio externo (evita bloqueos CORS y enlaces caducados).
 */

const { extraerArchivos, archivoABuffer, validarBufferTipo } = require('./keyfacilResponseParser');
const keyfacilService = require('./keyfacilService');

const TIPOS = {
  pdf: { contentType: 'application/pdf', extension: 'pdf', etiqueta: 'PDF' },
  xml: { contentType: 'application/xml; charset=utf-8', extension: 'xml', etiqueta: 'XML' }
};

const TIMEOUT_DESCARGA_MS = 20000;
const LONGITUD_MAX_ID = 100;
const LONGITUD_MAX_HASH = 100;

class ArchivoKeyfacilError extends Error {
  constructor(mensaje, status = 404, detalles = undefined) {
    super(mensaje);
    this.name = 'ArchivoKeyfacilError';
    this.status = status;
    this.detalles = detalles;
  }
}

const limitar = (valor, maximo) =>
  typeof valor === 'string' && valor.length > 0 && valor.length <= maximo ? valor : null;

/**
 * Mapea la respuesta de emisión de KEYFACIL a las columnas de BD.
 * @param {any} respuesta - Cuerpo devuelto por KEYFACIL al emitir
 * @returns {{keyfacilId: string|null, hash: string|null, qr: string|null, pdfUrl: string|null, xmlUrl: string|null, cdrUrl: string|null, claves: string[]}}
 */
const mapearRespuestaEmision = (respuesta) => {
  const datos = extraerArchivos(respuesta);
  return {
    keyfacilId: limitar(datos.id, LONGITUD_MAX_ID),
    hash: limitar(datos.hash, LONGITUD_MAX_HASH),
    qr: datos.qr,
    pdfUrl: datos.pdf.url,
    xmlUrl: datos.xml.url,
    cdrUrl: datos.cdr.url,
    claves: datos.claves
  };
};

const nombreArchivo = (numeroCompleto, tipo) =>
  `${String(numeroCompleto || 'comprobante').replace(/[^A-Za-z0-9_-]/g, '_')}.${TIPOS[tipo].extension}`;

const construirResultado = (buffer, tipo, numeroCompleto, origen) => ({
  buffer,
  contentType: TIPOS[tipo].contentType,
  nombre: nombreArchivo(numeroCompleto, tipo),
  origen
});

/**
 * Descarga un archivo desde una URL en el servidor y valida que sea del tipo esperado.
 * Si la URL pertenece a KEYFACIL, adjunta el token de la configuración.
 */
const descargarDesdeUrl = async (url, tipo) => {
  const headers = {};
  try {
    if (/(^|\.)vitekey\.com$/i.test(new URL(url).hostname)) {
      const config = await keyfacilService.getConfig();
      if (config.keyfacilToken) headers.Authorization = `Bearer ${config.keyfacilToken}`;
    }
  } catch (_) {
    // URL inválida o sin configuración: se intenta sin cabeceras
  }

  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_DESCARGA_MS);
  try {
    const respuesta = await fetch(url, { headers, signal: controlador.signal });
    if (!respuesta.ok) {
      throw new Error(`HTTP ${respuesta.status}`);
    }
    const buffer = Buffer.from(await respuesta.arrayBuffer());
    if (!validarBufferTipo(buffer, tipo)) {
      throw new Error(`el contenido no es un ${TIPOS[tipo].etiqueta} válido`);
    }
    return buffer;
  } finally {
    clearTimeout(temporizador);
  }
};

/**
 * Resuelve el archivo (PDF/XML) de un documento emitido en KEYFACIL.
 *
 * @param {Object} params
 * @param {'pdf'|'xml'} params.tipo
 * @param {Object} params.registro - { keyfacilId, keyfacilResponse, urlGuardada, numeroCompleto, etiqueta }
 * @param {Function} params.consultar - (keyfacilId) => Promise<{success:boolean, status:number, data:any}> (consulta a KEYFACIL)
 * @param {Function} [params.guardarUrl] - (url) => Promise<void>, persiste una URL nueva devuelta por KEYFACIL
 * @param {Function} [params.guardarKeyfacilId] - (id) => Promise<void>, persiste un ID recuperado de la respuesta guardada
 * @param {Function} [params.descargar] - (url, tipo) => Promise<Buffer> (inyectable para pruebas)
 * @returns {Promise<{buffer: Buffer, contentType: string, nombre: string, origen: string}>}
 */
const resolverArchivo = async ({ tipo, registro, consultar, guardarUrl, guardarKeyfacilId, descargar = descargarDesdeUrl }) => {
  if (!TIPOS[tipo]) {
    throw new ArchivoKeyfacilError(`Tipo de archivo no soportado: ${tipo}`, 400);
  }

  const etiquetaArchivo = TIPOS[tipo].etiqueta;
  const etiquetaDocumento = registro.etiqueta || 'comprobante';

  // 1. Contenido ya incluido en la respuesta de emisión guardada
  const extraidoGuardado = extraerArchivos(registro.keyfacilResponse);
  const almacenado = extraidoGuardado[tipo];
  const bufferAlmacenado = archivoABuffer(almacenado);
  if (bufferAlmacenado && validarBufferTipo(bufferAlmacenado, tipo)) {
    return construirResultado(bufferAlmacenado, tipo, registro.numeroCompleto, 'respuesta_almacenada');
  }

  // 2. URL conocida (respuesta guardada o columna *_url)
  const urlConocida = almacenado.url || registro.urlGuardada || null;
  if (urlConocida) {
    try {
      return construirResultado(await descargar(urlConocida, tipo), tipo, registro.numeroCompleto, 'url_guardada');
    } catch (error) {
      console.warn(`[KEYFACIL] No se pudo descargar ${etiquetaArchivo} desde ${urlConocida}: ${error.message}`);
    }
  }

  // 3. Consultar a KEYFACIL. Si keyfacil_id quedó vacío en emisiones antiguas
  //    (el campo de ID no se llamaba "id"), se recupera de la respuesta guardada.
  const keyfacilId = limitar(registro.keyfacilId, LONGITUD_MAX_ID) || limitar(extraidoGuardado.id, LONGITUD_MAX_ID);
  if (!keyfacilId) {
    throw new ArchivoKeyfacilError(
      `Este ${etiquetaDocumento} no tiene ID de KEYFACIL, no es posible obtener el ${etiquetaArchivo}`,
      404
    );
  }
  if (!registro.keyfacilId && guardarKeyfacilId) {
    try {
      await guardarKeyfacilId(keyfacilId);
    } catch (error) {
      console.warn(`[KEYFACIL] No se pudo guardar el ID recuperado ${keyfacilId}: ${error.message}`);
    }
  }

  const respuesta = await consultar(keyfacilId);
  if (!respuesta || !respuesta.success) {
    const mensaje = respuesta?.data?.message || respuesta?.data?.error || `HTTP ${respuesta?.status ?? 0}`;
    throw new ArchivoKeyfacilError(`KEYFACIL no devolvió el ${etiquetaArchivo}: ${mensaje}`, 502);
  }

  const consultado = extraerArchivos(respuesta.data);
  const archivo = consultado[tipo];

  const bufferConsultado = archivoABuffer(archivo);
  if (bufferConsultado && validarBufferTipo(bufferConsultado, tipo)) {
    return construirResultado(bufferConsultado, tipo, registro.numeroCompleto, 'consulta');
  }

  if (archivo.url) {
    if (guardarUrl && archivo.url !== registro.urlGuardada) {
      try {
        await guardarUrl(archivo.url);
      } catch (error) {
        console.warn(`[KEYFACIL] No se pudo guardar URL de ${etiquetaArchivo}: ${error.message}`);
      }
    }
    try {
      return construirResultado(await descargar(archivo.url, tipo), tipo, registro.numeroCompleto, 'consulta_url');
    } catch (error) {
      throw new ArchivoKeyfacilError(
        `No se pudo descargar el ${etiquetaArchivo} desde la URL entregada por KEYFACIL: ${error.message}`,
        502
      );
    }
  }

  throw new ArchivoKeyfacilError(
    `KEYFACIL no incluyó el ${etiquetaArchivo} en su respuesta`,
    404,
    { clavesRespuesta: consultado.claves }
  );
};

module.exports = {
  TIPOS,
  ArchivoKeyfacilError,
  mapearRespuestaEmision,
  resolverArchivo,
  descargarDesdeUrl
};
