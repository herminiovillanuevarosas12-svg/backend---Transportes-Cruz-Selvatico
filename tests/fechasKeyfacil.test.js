/**
 * Fechas enviadas a KEYFACIL
 * Ejecutar: npm test (node --test)
 *
 * Evidencia del bug (FT74-00000015): se envió fecha_emision "2026-09-04" (solo fecha);
 * KEYFACIL la interpretó como medianoche UTC y la convirtió a hora de Lima, generando
 * en el XML IssueDate 2026-09-03 e IssueTime 19:00:00 (un día antes).
 * Solución: enviar siempre un instante ISO 8601 completo en UTC ("Z"), que KEYFACIL
 * convierte correctamente a la fecha y hora civil de Lima.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { toIsoInstant, civilDatePeruToIsoInstant } = require('../utils/dateUtils');
const { construirPayloadKeyfacil } = require('../services/facturacionService');
const { construirPayloadGuia } = require('../services/guiaRemisionService');

const PATRON_INSTANTE_Z = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

describe('toIsoInstant', () => {
  test('formatea un Date como ISO 8601 UTC sin milisegundos', () => {
    assert.equal(toIsoInstant(new Date('2026-09-04T15:15:42.987Z')), '2026-09-04T15:15:42Z');
  });

  test('acepta string ISO y epoch', () => {
    assert.equal(toIsoInstant('2026-09-04T10:15:00-05:00'), '2026-09-04T15:15:00Z');
    assert.equal(toIsoInstant(Date.UTC(2026, 8, 4, 15, 15, 0)), '2026-09-04T15:15:00Z');
  });

  test('null o inválido devuelve null', () => {
    assert.equal(toIsoInstant(null), null);
    assert.equal(toIsoInstant('no-es-fecha'), null);
  });
});

describe('civilDatePeruToIsoInstant', () => {
  test('una fecha civil de Perú se convierte al instante de su medianoche en Lima (UTC-5)', () => {
    assert.equal(civilDatePeruToIsoInstant('2026-09-04'), '2026-09-04T05:00:00Z');
  });

  test('acepta un Date a medianoche UTC (como devuelve parseCivilDate)', () => {
    assert.equal(civilDatePeruToIsoInstant(new Date('2026-09-04T00:00:00.000Z')), '2026-09-04T05:00:00Z');
  });

  test('un string ISO con hora se respeta como instante', () => {
    assert.equal(civilDatePeruToIsoInstant('2026-09-04T10:00:00-05:00'), '2026-09-04T15:00:00Z');
  });

  test('vacío o inválido devuelve null', () => {
    assert.equal(civilDatePeruToIsoInstant(''), null);
    assert.equal(civilDatePeruToIsoInstant('04/09/2026'), null);
  });
});

describe('construirPayloadKeyfacil: fecha_emision', () => {
  const base = {
    tipoComprobante: '01',
    serie: 'FT74',
    numero: 15,
    cliente: { tipoDoc: '6', numDoc: '20489252270', razonSocial: 'GOBIERNO REGIONAL DE PASCO', direccion: '' },
    items: [{ codigo: 'SERV-001', descripcion: 'PASAJE', unidadMedida: 'ZZ', cantidad: 1, precioUnitario: 40, tipoIGV: '10' }],
    totales: {}
  };

  test('con un Date envía el instante completo en UTC (Z), no solo la fecha', () => {
    const payload = construirPayloadKeyfacil({}, { ...base, fechaEmision: new Date('2026-09-04T15:15:42.100Z') });
    assert.equal(payload.fecha_emision, '2026-09-04T15:15:42Z');
    assert.match(payload.fecha_emision, PATRON_INSTANTE_Z);
  });

  test('emitido a las 20:30 de Lima del 4/09 conserva el día 4 (antes se enviaba la fecha UTC del 5)', () => {
    // 20:30 Lima = 01:30Z del día siguiente
    const payload = construirPayloadKeyfacil({}, { ...base, fechaEmision: new Date('2026-09-05T01:30:00Z') });
    assert.equal(payload.fecha_emision, '2026-09-05T01:30:00Z');
    // KEYFACIL convertirá el instante a Lima: 2026-09-04 20:30:00
    const lima = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(new Date(payload.fecha_emision));
    assert.equal(lima, '2026-09-04');
  });

  test('con una fecha civil YYYY-MM-DD envía la medianoche de Lima como instante', () => {
    const payload = construirPayloadKeyfacil({}, { ...base, fechaEmision: '2026-09-04' });
    assert.equal(payload.fecha_emision, '2026-09-04T05:00:00Z');
  });
});

describe('construirPayloadGuia: envio_fecha', () => {
  const base = {
    serie: 'TZ74',
    numero: 1,
    motivoTraslado: '01',
    transporteTipo: '02',
    pesoBrutoTotal: 10,
    numeroBultos: 1,
    ubigeoPartida: '190301',
    direccionPartida: 'Terminal Pozuzo',
    ubigeoLlegada: '190301',
    direccionLlegada: 'Terminal Oxapampa',
    destinatario: { tipoDoc: '1', numDoc: '10738155900', razonSocial: 'RUBIO BONILLA' },
    transportista: { tipoDoc: '6', documento: '20600812727', nombre: 'CRUZ SELVATICO' },
    conductor: { tipoDoc: '1', documento: '12345678', nombre: 'CONDUCTOR' },
    vehiculo: { placa: 'ABC-123' },
    items: [{ codigo: 'P1', descripcion: 'ENCOMIENDA', unidadMedida: 'ZZ', cantidad: 1 }]
  };

  test('la fecha civil de inicio de traslado se envía como instante de medianoche en Lima', () => {
    const payload = construirPayloadGuia({}, { ...base, fechaInicioTraslado: '2026-09-04' });
    assert.equal(payload.envio_fecha, '2026-09-04T05:00:00Z');
  });

  test('acepta Date a medianoche UTC', () => {
    const payload = construirPayloadGuia({}, { ...base, fechaInicioTraslado: new Date('2026-09-04T00:00:00.000Z') });
    assert.equal(payload.envio_fecha, '2026-09-04T05:00:00Z');
  });
});
