/**
 * KEYFACIL Response Parser
 *
 * El manual de integración de KEYFACIL documenta el JSON de envío y consulta,
 * pero NO el cuerpo de la respuesta. Este módulo localiza de forma tolerante
 * los archivos (PDF, XML, CDR), el ID del comprobante, el hash y el QR dentro
 * de cualquier respuesta, sin depender de un nombre de campo exacto ni de si
 * el contenido viene como URL, base64, data URI o texto plano.
 */

const PROFUNDIDAD_MAXIMA = 4;

const TIPOS_ARCHIVO = {
  pdf: {
    clave: /pdf/i,
    excluir: /incluir|include|formato|format|tamano|tamaño|size|nombre|name/i,
    validarBuffer: (buf) => buf.length >= 4 && buf.subarray(0, 4).toString('latin1') === '%PDF',
    permiteTexto: false
  },
  xml: {
    clave: /xml/i,
    excluir: /incluir|include|nombre|name|hash/i,
    validarBuffer: (buf) => sinBom(buf.toString('utf-8', 0, Math.min(buf.length, 64))).trimStart().startsWith('<'),
    permiteTexto: true
  },
  cdr: {
    clave: /cdr/i,
    excluir: /incluir|include|nombre|name|hash|estado|status|codigo|code|mensaje|message|descripcion|description/i,
    validarBuffer: (buf) => {
      if (buf.length < 2) return false;
      const inicio = buf.subarray(0, 2).toString('latin1');
      return inicio === 'PK' || sinBom(buf.toString('utf-8', 0, Math.min(buf.length, 64))).trimStart().startsWith('<');
    },
    permiteTexto: false
  }
};

const CLAVES_ID = [
  'id', 'uuid', '_id', 'external_id', 'externalId', 'comprobante_id', 'comprobanteId',
  'invoice_id', 'invoiceId', 'documento_id', 'documentoId', 'guia_id', 'guiaId',
  'despatch_id', 'despatchId', 'codigo_unico', 'codigoUnico'
];

const PATRON_HASH = /hash|digest|resumen/i;
const PATRON_QR = /qr/i;

const sinBom = (texto) => texto.replace(/^﻿/, '');

const esObjetoPlano = (valor) =>
  valor !== null && typeof valor === 'object' && !Array.isArray(valor) && !Buffer.isBuffer(valor);

const esUrl = (texto) => /^https?:\/\/\S+$/i.test(texto);

const limpiarBase64 = (texto) =>
  texto.replace(/^data:[^;,]+;base64,/i, '').replace(/\s+/g, '');

const pareceBase64 = (texto) => texto.length >= 16 && /^[A-Za-z0-9+/]+={0,2}$/.test(texto);

/**
 * Clasifica un valor string como url / base64 / texto para un tipo de archivo.
 * Devuelve null si el valor no representa ese archivo.
 */
const clasificarValor = (valorCrudo, tipo) => {
  if (typeof valorCrudo !== 'string') return null;
  const valor = valorCrudo.trim();
  if (!valor) return null;

  const definicion = TIPOS_ARCHIVO[tipo];

  if (esUrl(valor)) {
    return { url: valor };
  }

  if (definicion.permiteTexto && sinBom(valor).startsWith('<')) {
    return { texto: sinBom(valor) };
  }

  const base64 = limpiarBase64(valor);
  if (pareceBase64(base64)) {
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length > 0 && definicion.validarBuffer(buffer)) {
      return { base64 };
    }
  }

  return null;
};

const archivoVacio = (tipo) => ({
  url: null,
  base64: null,
  ...(TIPOS_ARCHIVO[tipo].permiteTexto ? { texto: null } : {})
});

const esEscalarNoVacio = (valor) =>
  (typeof valor === 'string' && valor.trim() !== '') || (typeof valor === 'number' && Number.isFinite(valor));

/**
 * Recorre la respuesta (objetos anidados, sin entrar en arrays) por niveles.
 */
const recorrerNiveles = (raiz, visitar) => {
  let nivel = [raiz];
  for (let profundidad = 0; profundidad < PROFUNDIDAD_MAXIMA && nivel.length > 0; profundidad++) {
    const siguiente = [];
    for (const objeto of nivel) {
      for (const [clave, valor] of Object.entries(objeto)) {
        visitar(clave, valor, profundidad);
        if (esObjetoPlano(valor)) siguiente.push(valor);
      }
    }
    nivel = siguiente;
  }
};

/**
 * Extrae archivos e identificadores de una respuesta de KEYFACIL.
 * @param {any} respuesta - Cuerpo JSON devuelto por KEYFACIL (envío o consulta)
 * @returns {{
 *   id: string|null, hash: string|null, qr: string|null,
 *   pdf: {url: string|null, base64: string|null},
 *   xml: {url: string|null, base64: string|null, texto: string|null},
 *   cdr: {url: string|null, base64: string|null},
 *   claves: string[]
 * }}
 */
const extraerArchivos = (respuesta) => {
  const resultado = {
    id: null,
    hash: null,
    qr: null,
    pdf: archivoVacio('pdf'),
    xml: archivoVacio('xml'),
    cdr: archivoVacio('cdr'),
    claves: []
  };

  if (!esObjetoPlano(respuesta)) return resultado;

  resultado.claves = Object.keys(respuesta);

  // ID: primer candidato encontrado, priorizando el orden de CLAVES_ID en cada nivel
  const candidatosIdPorNivel = [];
  const archivosEncontrados = { pdf: false, xml: false, cdr: false };

  recorrerNiveles(respuesta, (clave, valor, profundidad) => {
    if (CLAVES_ID.includes(clave) && esEscalarNoVacio(valor)) {
      candidatosIdPorNivel.push({ profundidad, orden: CLAVES_ID.indexOf(clave), valor: String(valor).trim() });
    }

    if (typeof valor === 'string') {
      if (!resultado.hash && PATRON_HASH.test(clave) && valor.trim().length >= 8) {
        resultado.hash = valor.trim();
      }
      if (!resultado.qr && PATRON_QR.test(clave) && valor.trim() !== '') {
        resultado.qr = valor.trim();
      }
    }

    for (const tipo of Object.keys(TIPOS_ARCHIVO)) {
      if (archivosEncontrados[tipo]) continue;
      const definicion = TIPOS_ARCHIVO[tipo];
      if (!definicion.clave.test(clave) || definicion.excluir.test(clave)) continue;
      const clasificado = clasificarValor(valor, tipo);
      if (clasificado) {
        resultado[tipo] = { ...archivoVacio(tipo), ...clasificado };
        archivosEncontrados[tipo] = true;
      }
    }
  });

  if (candidatosIdPorNivel.length > 0) {
    candidatosIdPorNivel.sort((a, b) => a.profundidad - b.profundidad || a.orden - b.orden);
    resultado.id = candidatosIdPorNivel[0].valor;
  }

  return resultado;
};

/**
 * Convierte un archivo extraído (base64 o texto) a Buffer. Null si solo hay URL o nada.
 */
const archivoABuffer = (archivo) => {
  if (!archivo) return null;
  if (archivo.base64) return Buffer.from(archivo.base64, 'base64');
  if (archivo.texto) return Buffer.from(archivo.texto, 'utf-8');
  return null;
};

const validarBufferTipo = (buffer, tipo) =>
  Buffer.isBuffer(buffer) && !!TIPOS_ARCHIVO[tipo] && TIPOS_ARCHIVO[tipo].validarBuffer(buffer);

module.exports = {
  extraerArchivos,
  archivoABuffer,
  validarBufferTipo,
  TIPOS_ARCHIVO
};
