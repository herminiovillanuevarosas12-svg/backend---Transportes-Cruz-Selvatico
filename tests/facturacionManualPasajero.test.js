/**
 * Emisión manual (POST /api/facturacion/comprobantes) con pasajero opcional
 * Ejecutar: npm test (node --test)
 *
 * Servicios simulados: no toca la BD ni KEYFACIL.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// La auditoría se desestructura al cargar el controlador: se simula antes de requerirlo
const auditoriaService = require('../services/auditoriaService');
auditoriaService.registrarAuditoria = async () => {};

const facturacionService = require('../services/facturacionService');
const { emitirComprobante } = require('../controllers/facturacionController');

const crearRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
};

const bodyBase = () => ({
  tipoComprobante: '01',
  serie: 'FT74',
  cliente: { tipoDoc: '6', numDoc: '20131257750', razonSocial: 'SEGURO SOCIAL DE SALUD', direccion: '' },
  items: [{ descripcion: 'Pasaje Terminal Oxapampa - Terminal Pozuzo', cantidad: 1, precioUnitario: 30 }],
  incluyeIgv: false
});

describe('facturacionController.emitirComprobante: pasajero', () => {
  let llamadas;

  beforeEach(() => {
    llamadas = { registrar: [], emitir: [] };
    facturacionService.registrarPasajeroComprobante = async (pasajero, userId) => {
      llamadas.registrar.push({ pasajero, userId });
      return { id: 1, ...pasajero };
    };
    facturacionService.emitirComprobante = async (params) => {
      llamadas.emitir.push(params);
      return { id: 99, numeroCompleto: 'FT74-00000026', total: 30 };
    };
  });

  test('con pasajero: lo registra y envía su nombre (no el del usuario del sistema)', async () => {
    const req = {
      user: { id: 7 },
      body: {
        ...bodyBase(),
        pasajero: { tipoDocumento: '1', documentoIdentidad: '45678912', nombreCompleto: 'Juan Pérez Rojas', telefono: '987654321' }
      }
    };
    const res = crearRes();
    await emitirComprobante(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(llamadas.registrar.length, 1);
    assert.equal(llamadas.registrar[0].pasajero.documentoIdentidad, '45678912');
    assert.equal(llamadas.registrar[0].userId, 7);
    assert.equal(llamadas.emitir[0].nombreUsuarioTicket, 'Juan Pérez Rojas');
  });

  test('sin pasajero: no registra nada y no envía nombre', async () => {
    const req = { user: { id: 7 }, body: bodyBase() };
    const res = crearRes();
    await emitirComprobante(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(llamadas.registrar.length, 0);
    assert.equal(llamadas.emitir[0].nombreUsuarioTicket, null);
  });

  test('pasajero incompleto: 400 y no emite', async () => {
    const req = {
      user: { id: 7 },
      body: { ...bodyBase(), pasajero: { tipoDocumento: '1', documentoIdentidad: '45678912', nombreCompleto: 'Juan', telefono: '' } }
    };
    const res = crearRes();
    await emitirComprobante(req, res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /teléfono del pasajero/);
    assert.equal(llamadas.registrar.length, 0);
    assert.equal(llamadas.emitir.length, 0);
  });
});
