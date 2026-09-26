/**
 * Tests de resolución de archivos PDF/XML de KEYFACIL
 * Ejecutar: node --test tests/
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { resolverArchivo, mapearRespuestaEmision, ArchivoKeyfacilError } = require('../services/keyfacilArchivosService');

const b64 = (s) => Buffer.from(s, 'utf-8').toString('base64');
const PDF_TEXTO = '%PDF-1.4\n%%EOF';
const PDF_B64 = b64(PDF_TEXTO);
const XML_TEXTO = '<?xml version="1.0"?><Invoice/>';
const XML_B64 = b64(XML_TEXTO);

const registroBase = (extra = {}) => ({
  keyfacilId: 'KF-1',
  keyfacilResponse: null,
  urlGuardada: null,
  numeroCompleto: 'FT74-00000016',
  etiqueta: 'comprobante',
  ...extra
});

const consultaNoEsperada = async () => {
  throw new Error('No debería consultar a KEYFACIL');
};

const descargaNoEsperada = async () => {
  throw new Error('No debería descargar por URL');
};

test('usa el contenido guardado en keyfacil_response sin consultar', async () => {
  const r = await resolverArchivo({
    tipo: 'pdf',
    registro: registroBase({ keyfacilResponse: { id: 'KF-1', pdf_base64: PDF_B64 } }),
    consultar: consultaNoEsperada,
    descargar: descargaNoEsperada
  });
  assert.equal(r.origen, 'respuesta_almacenada');
  assert.equal(r.contentType, 'application/pdf');
  assert.equal(r.nombre, 'FT74-00000016.pdf');
  assert.equal(r.buffer.toString('utf-8'), PDF_TEXTO);
});

test('descarga desde la URL guardada en BD', async () => {
  let urlPedida = null;
  const r = await resolverArchivo({
    tipo: 'xml',
    registro: registroBase({ urlGuardada: 'https://cdn.keyfacil.com/a.xml' }),
    consultar: consultaNoEsperada,
    descargar: async (url) => { urlPedida = url; return Buffer.from(XML_TEXTO); }
  });
  assert.equal(urlPedida, 'https://cdn.keyfacil.com/a.xml');
  assert.equal(r.origen, 'url_guardada');
  assert.equal(r.nombre, 'FT74-00000016.xml');
});

test('si la URL guardada falla, consulta a KEYFACIL', async () => {
  let consultado = false;
  const r = await resolverArchivo({
    tipo: 'xml',
    registro: registroBase({ urlGuardada: 'https://cdn.keyfacil.com/caducado.xml' }),
    consultar: async () => { consultado = true; return { success: true, status: 200, data: { xml: XML_B64 } }; },
    descargar: async () => { throw new Error('HTTP 404'); }
  });
  assert.equal(consultado, true);
  assert.equal(r.origen, 'consulta');
  assert.equal(r.buffer.toString('utf-8'), XML_TEXTO);
});

test('sin keyfacil_id ni contenido: error 404 claro', async () => {
  await assert.rejects(
    resolverArchivo({ tipo: 'pdf', registro: registroBase({ keyfacilId: null }), consultar: consultaNoEsperada }),
    (e) => e instanceof ArchivoKeyfacilError && e.status === 404 && /ID de KEYFACIL/.test(e.message)
  );
});

test('consulta devuelve URL: se persiste y se descarga', async () => {
  let urlGuardada = null;
  const r = await resolverArchivo({
    tipo: 'pdf',
    registro: registroBase(),
    consultar: async () => ({ success: true, status: 200, data: { data: { enlace_pdf: 'https://cdn.keyfacil.com/b.pdf' } } }),
    guardarUrl: async (url) => { urlGuardada = url; },
    descargar: async () => Buffer.from(PDF_TEXTO)
  });
  assert.equal(urlGuardada, 'https://cdn.keyfacil.com/b.pdf');
  assert.equal(r.origen, 'consulta_url');
});

test('consulta con error de KEYFACIL: 502 con el mensaje del proveedor', async () => {
  await assert.rejects(
    resolverArchivo({
      tipo: 'pdf',
      registro: registroBase(),
      consultar: async () => ({ success: false, status: 400, data: { code: 400, message: 'Comprobante no encontrado' } })
    }),
    (e) => e.status === 502 && /Comprobante no encontrado/.test(e.message)
  );
});

test('consulta sin el archivo: 404 con claves recibidas para diagnóstico', async () => {
  await assert.rejects(
    resolverArchivo({
      tipo: 'xml',
      registro: registroBase(),
      consultar: async () => ({ success: true, status: 200, data: { id: 'KF-1', estado: 'ACEPTADO' } })
    }),
    (e) => e.status === 404 && Array.isArray(e.detalles?.clavesRespuesta) && e.detalles.clavesRespuesta.includes('estado')
  );
});

test('contenido guardado inválido (no es PDF) se ignora y se consulta', async () => {
  const r = await resolverArchivo({
    tipo: 'pdf',
    registro: registroBase({ keyfacilResponse: { pdf: b64('<html>error</html>') } }),
    consultar: async () => ({ success: true, status: 200, data: { pdf: PDF_B64 } })
  });
  assert.equal(r.origen, 'consulta');
});

test('keyfacil_id vacío: recupera el ID de la respuesta guardada, lo persiste y consulta con él', async () => {
  let idConsultado = null;
  let idGuardado = null;
  const r = await resolverArchivo({
    tipo: 'pdf',
    registro: registroBase({ keyfacilId: null, keyfacilResponse: { data: { uuid: 'U-RECUPERADO', estado: 'ACEPTADO' } } }),
    consultar: async (id) => { idConsultado = id; return { success: true, status: 200, data: { pdf: PDF_B64 } }; },
    guardarKeyfacilId: async (id) => { idGuardado = id; }
  });
  assert.equal(idConsultado, 'U-RECUPERADO');
  assert.equal(idGuardado, 'U-RECUPERADO');
  assert.equal(r.origen, 'consulta');
});

test('keyfacil_id presente: no intenta persistirlo de nuevo', async () => {
  let guardadas = 0;
  await resolverArchivo({
    tipo: 'pdf',
    registro: registroBase({ keyfacilResponse: { id: 'KF-1' } }),
    consultar: async () => ({ success: true, status: 200, data: { pdf: PDF_B64 } }),
    guardarKeyfacilId: async () => { guardadas++; }
  });
  assert.equal(guardadas, 0);
});

test('tipo no soportado', async () => {
  await assert.rejects(
    resolverArchivo({ tipo: 'zip', registro: registroBase(), consultar: consultaNoEsperada }),
    (e) => e.status === 400
  );
});

test('mapearRespuestaEmision limita longitudes y expone claves', () => {
  const m = mapearRespuestaEmision({ id: 'X'.repeat(101), hash: 'H'.repeat(40), pdf_url: 'https://x/a.pdf', qr: 'QR' });
  assert.equal(m.keyfacilId, null);
  assert.equal(m.hash, 'H'.repeat(40));
  assert.equal(m.pdfUrl, 'https://x/a.pdf');
  assert.equal(m.xmlUrl, null);
  assert.equal(m.qr, 'QR');
  assert.deepEqual(m.claves, ['id', 'hash', 'pdf_url', 'qr']);
});
