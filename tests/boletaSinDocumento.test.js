/**
 * Boleta sin documento del cliente (tipo "-", VARIOS) y cliente de boleta elegido en el formulario
 * Ejecutar: npm test (node --test)
 *
 * Prisma y KEYFACIL simulados: no toca la BD ni emite comprobantes reales.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// La auditoría se desestructura al cargar los controladores: se simula antes de requerirlos
const auditoriaService = require('../services/auditoriaService');
auditoriaService.registrarAuditoria = async () => {};

const prisma = require('../config/prisma');
const keyfacilService = require('../services/keyfacilService');
const facturacionService = require('../services/facturacionService');
const ticketsController = require('../controllers/ticketsController');
const encomiendasController = require('../controllers/encomiendasController');

const crearRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
};

const sqlDe = (strings) => (Array.isArray(strings) ? strings.join('?') : String(strings));

describe('facturacionService.emitirComprobante: boleta sin documento', () => {
  let enviados;
  let inserts;

  beforeEach(() => {
    enviados = [];
    inserts = 0;
    keyfacilService.getConfig = async () => ({ igvPorcentaje: '18.00', exoneradoIgv: false });
    keyfacilService.enviarComprobante = async (payload) => {
      enviados.push(payload);
      return { success: true, data: { id: 'KF-1' } };
    };
    prisma.$executeRaw = async () => 1;
    prisma.$queryRaw = async (strings) => {
      const sql = sqlDe(strings);
      if (sql.includes('UPDATE tbl_series_factura')) return [{ numero_actual: 15 }];
      if (sql.includes('INSERT INTO tbl_comprobantes')) { inserts++; return [{ id: 501, numero_completo: 'BT74-00000015' }]; }
      if (sql.includes('FROM tbl_comprobantes')) return [{ id: 501, numeroCompleto: 'BT74-00000015' }];
      return [];
    };
  });

  const emitir = (cliente, precioUnitario) => facturacionService.emitirComprobante({
    tipoComprobante: '03',
    serie: 'BT74',
    cliente,
    items: [{ descripcion: 'Pasaje Oxapampa - Pozuzo', cantidad: 1, precioUnitario }],
    userId: 1,
    incluyeIgv: false
  });

  test('envía a KEYFACIL cliente_tipo "-", documento "-" y CLIENTES VARIOS', async () => {
    await emitir({ tipoDoc: '-', numDoc: '', razonSocial: '', direccion: '' }, 35);
    assert.equal(enviados.length, 1);
    assert.equal(enviados[0].cliente_tipo, '-');
    assert.equal(enviados[0].cliente_documento, '-');
    assert.equal(enviados[0].cliente_nombre, 'CLIENTES VARIOS');
  });

  test('conserva el nombre escrito a mano', async () => {
    await emitir({ tipoDoc: '-', razonSocial: 'Maria Lopez', direccion: 'Jr. Lima 123' }, 35);
    assert.equal(enviados[0].cliente_nombre, 'Maria Lopez');
    assert.equal(enviados[0].cliente_direccion, 'Jr. Lima 123');
  });

  test('sobre S/ 700 se rechaza antes de numerar, guardar o enviar', async () => {
    await assert.rejects(
      emitir({ tipoDoc: '-', razonSocial: '' }, 700.5),
      /mayores a S\/ 700/
    );
    assert.equal(inserts, 0);
    assert.equal(enviados.length, 0);
  });

  test('S/ 700 exactos sí se emiten sin documento', async () => {
    await emitir({ tipoDoc: '-', razonSocial: '' }, 700);
    assert.equal(enviados.length, 1);
  });
});

describe('controladores: cliente de boleta inválido se rechaza antes de vender o retirar', () => {
  beforeEach(() => {
    // Si un controlador llegara a la BD, la prueba falla
    const prohibido = async () => { throw new Error('No debe consultar la BD'); };
    prisma.$queryRaw = prohibido;
    prisma.$executeRaw = prohibido;
    prisma.$transaction = prohibido;
  });

  const pasajero = { nombreCompleto: 'JUAN PEREZ', documentoIdentidad: '12345678', tipoDocumento: '1', telefono: '987654321' };
  const clienteInvalido = { tipoDoc: '1', numDoc: '123', razonSocial: 'X' };

  test('venta de pasaje', async () => {
    const res = crearRes();
    await ticketsController.vender({
      user: { id: 1 },
      body: { idRuta: 1, idHorario: 1, fechaViaje: '2026-11-12', pasajero: { ...pasajero }, metodoPago: 'EFECTIVO', tipoDocumento: 'BOLETA', clienteBoleta: clienteInvalido }
    }, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /DNI del cliente/);
  });

  test('venta instantánea', async () => {
    const res = crearRes();
    await ticketsController.venderInstantaneo({
      user: { id: 1 },
      body: { idRuta: 1, pasajero: { ...pasajero }, metodoPago: 'EFECTIVO', tipoDocumento: 'BOLETA', clienteBoleta: { tipoDoc: '6', numDoc: '20609654547', razonSocial: '' } }
    }, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /razón social del cliente/);
  });

  test('registro de encomienda', async () => {
    const res = crearRes();
    await encomiendasController.registrar({
      user: { id: 1, id_punto: 1 },
      body: {
        idPuntoOrigen: 1,
        idPuntoDestino: 2,
        remitente: { nombre: 'ANA', dni: '12345678', tipoDocumento: '1', telefono: '987654321' },
        destinatario: { nombre: 'LUIS', telefono: '912345678' },
        tipoDocumento: 'BOLETA',
        clienteBoleta: clienteInvalido
      }
    }, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /DNI del cliente/);
  });

  test('retiro con pago al recojo', async () => {
    const res = crearRes();
    await encomiendasController.retirar({
      user: { id: 1, id_punto: 2 },
      params: { id: '10' },
      body: { dniRetiro: '87654321', tipoDocRetiro: '1', nombreRetiro: 'LUIS', tipoComprobante: 'BOLETA', clienteBoleta: { tipoDoc: '9', numDoc: '1', razonSocial: 'X' } }
    }, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /Tipo de documento del cliente inválido/);
  });
});
