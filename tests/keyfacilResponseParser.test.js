/**
 * Tests del parser tolerante de respuestas KEYFACIL
 * Ejecutar: node --test tests/
 *
 * El manual de integración de KEYFACIL no documenta el cuerpo de la respuesta,
 * por lo que el parser debe reconocer los archivos (PDF/XML/CDR) y el ID sin
 * depender de un nombre de campo exacto.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { extraerArchivos, archivoABuffer } = require('../services/keyfacilResponseParser');

const b64 = (s) => Buffer.from(s, 'utf-8').toString('base64');
const PDF_B64 = b64('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF');
const XML_TEXTO = '<?xml version="1.0" encoding="UTF-8"?><Invoice><ID>FT74-1</ID></Invoice>';
const XML_B64 = b64(XML_TEXTO);
const ZIP_B64 = b64('PK\u0003\u0004contenido-cdr-simulado-0123456789');

test('URLs planas en snake_case', () => {
  const r = extraerArchivos({
    id: 123,
    hash: 'HASHCPE==',
    qr: '20123456789|01|FT74|1|...',
    pdf_url: 'https://cdn.keyfacil.com/a.pdf',
    xml_url: 'https://cdn.keyfacil.com/a.xml',
    cdr_url: 'https://cdn.keyfacil.com/a.zip'
  });
  assert.equal(r.id, '123');
  assert.equal(r.hash, 'HASHCPE==');
  assert.equal(r.qr, '20123456789|01|FT74|1|...');
  assert.equal(r.pdf.url, 'https://cdn.keyfacil.com/a.pdf');
  assert.equal(r.xml.url, 'https://cdn.keyfacil.com/a.xml');
  assert.equal(r.cdr.url, 'https://cdn.keyfacil.com/a.zip');
});

test('URLs planas en camelCase (supuesto original del código)', () => {
  const r = extraerArchivos({ id: 'abc', pdfUrl: 'https://x/a.pdf', xmlUrl: 'https://x/a.xml', cdrUrl: 'https://x/a.zip' });
  assert.equal(r.id, 'abc');
  assert.equal(r.pdf.url, 'https://x/a.pdf');
  assert.equal(r.xml.url, 'https://x/a.xml');
  assert.equal(r.cdr.url, 'https://x/a.zip');
});

test('contenido base64 plano; ignora incluir_pdf y formato_pdf', () => {
  const r = extraerArchivos({ id: 'u-1', pdf: PDF_B64, xml: XML_B64, incluir_pdf: true, incluir_xml: true, formato_pdf: 'A4' });
  assert.equal(r.pdf.base64, PDF_B64);
  assert.equal(r.pdf.url, null);
  assert.equal(r.xml.base64, XML_B64);
  assert.equal(archivoABuffer(r.pdf).toString('utf-8').startsWith('%PDF-'), true);
  assert.equal(archivoABuffer(r.xml).toString('utf-8'), XML_TEXTO);
});

test('respuesta anidada (data/archivos/sunat)', () => {
  const r = extraerArchivos({
    success: true,
    data: {
      id: 7,
      archivos: { pdf_base64: PDF_B64, xml_base64: XML_B64 },
      sunat: { hash_cpe: 'HASH1234567890abcdef', codigo_qr: 'QRDATA', cdr: ZIP_B64 }
    }
  });
  assert.equal(r.id, '7');
  assert.equal(r.hash, 'HASH1234567890abcdef');
  assert.equal(r.qr, 'QRDATA');
  assert.equal(r.pdf.base64, PDF_B64);
  assert.equal(r.xml.base64, XML_B64);
  assert.equal(r.cdr.base64, ZIP_B64);
});

test('XML como texto plano', () => {
  const r = extraerArchivos({ xml: XML_TEXTO });
  assert.equal(r.xml.texto, XML_TEXTO);
  assert.equal(r.xml.base64, null);
  assert.equal(archivoABuffer(r.xml).toString('utf-8'), XML_TEXTO);
});

test('PDF como data URI', () => {
  const r = extraerArchivos({ pdf: `data:application/pdf;base64,${PDF_B64}` });
  assert.equal(r.pdf.base64, PDF_B64);
});

test('valores que no son archivos se ignoran y se listan las claves', () => {
  const r = extraerArchivos({ pdf: 'A4', xml: true, incluir_pdf: true, estado: 'ACEPTADO' });
  assert.equal(r.pdf.url, null);
  assert.equal(r.pdf.base64, null);
  assert.equal(r.xml.url, null);
  assert.equal(r.xml.base64, null);
  assert.equal(r.xml.texto, null);
  assert.deepEqual(r.claves, ['pdf', 'xml', 'incluir_pdf', 'estado']);
});

test('respuesta de error de KEYFACIL no produce archivos ni id', () => {
  const r = extraerArchivos({ code: 400, type: 1001, message: 'La empresa no cuenta con un plan activo' });
  assert.equal(r.id, null);
  assert.equal(r.pdf.url, null);
  assert.equal(r.xml.url, null);
});

test('id alternativo (external_id / uuid anidado) y no toma ids de arrays', () => {
  assert.equal(extraerArchivos({ external_id: 'E1' }).id, 'E1');
  assert.equal(extraerArchivos({ data: { uuid: 'U1' } }).id, 'U1');
  assert.equal(extraerArchivos({ items: [{ id: 5 }] }).id, null);
});

test('base64 con saltos de línea y espacios', () => {
  const conSaltos = PDF_B64.replace(/(.{20})/g, '$1\n');
  const r = extraerArchivos({ pdf_base64: conSaltos });
  assert.equal(archivoABuffer(r.pdf).toString('utf-8').startsWith('%PDF-'), true);
});

test('entrada nula o no objeto', () => {
  const r = extraerArchivos(null);
  assert.equal(r.id, null);
  assert.equal(r.pdf.url, null);
  assert.deepEqual(r.claves, []);
  assert.equal(archivoABuffer(r.pdf), null);
});
