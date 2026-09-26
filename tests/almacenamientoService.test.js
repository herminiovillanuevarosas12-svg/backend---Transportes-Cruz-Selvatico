/**
 * Pruebas de services/almacenamientoService
 * Ejecutar: npm test (node --test)
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const s3Service = require('../services/s3Service');
const { eliminarArchivo, extraerKey } = require('../services/almacenamientoService');

describe('extraerKey', () => {
  test('devuelve la key tal cual cuando ya es una ruta relativa', () => {
    assert.equal(extraerKey('Fotos_banner/banner_1.jpg'), 'Fotos_banner/banner_1.jpg');
  });

  test('extrae la key de una URL de Wasabi, decodificando caracteres especiales', () => {
    assert.equal(
      extraerKey('https://s3.us-east-1.wasabisys.com/cruz-selvatico-uploads/Fotos_galer%C3%ADa/gallery_1.jpeg'),
      'Fotos_galería/gallery_1.jpeg'
    );
  });
});

describe('eliminarArchivo', () => {
  let originales;
  let keysBorradas;

  beforeEach(() => {
    originales = { isConfigured: s3Service.isConfigured, deleteFile: s3Service.deleteFile };
    keysBorradas = [];
    s3Service.deleteFile = async (key) => { keysBorradas.push(key); return true; };
  });

  afterEach(() => {
    Object.assign(s3Service, originales);
  });

  test('con S3 configurado borra en el bucket una key relativa (caso de producción)', async () => {
    s3Service.isConfigured = () => true;
    const ok = await eliminarArchivo('Fotos_banner/banner_1.jpg');
    assert.equal(ok, true);
    assert.deepEqual(keysBorradas, ['Fotos_banner/banner_1.jpg']);
  });

  test('con S3 configurado borra en el bucket la key de una URL completa', async () => {
    s3Service.isConfigured = () => true;
    await eliminarArchivo('https://s3.us-east-1.wasabisys.com/cruz-selvatico-uploads/Fotos_banner/banner_2.jpg');
    assert.deepEqual(keysBorradas, ['Fotos_banner/banner_2.jpg']);
  });

  test('sin S3 borra el archivo local bajo la carpeta de uploads indicada', async () => {
    s3Service.isConfigured = () => false;
    const uploadsBase = fs.mkdtempSync(path.join(os.tmpdir(), 'uploads-'));
    const relativo = 'Fotos_banner/banner_local.jpg';
    fs.mkdirSync(path.join(uploadsBase, 'Fotos_banner'), { recursive: true });
    fs.writeFileSync(path.join(uploadsBase, relativo), 'x');

    const ok = await eliminarArchivo(relativo, { uploadsBase });

    assert.equal(ok, true);
    assert.equal(fs.existsSync(path.join(uploadsBase, relativo)), false);
    assert.deepEqual(keysBorradas, []);
    fs.rmSync(uploadsBase, { recursive: true, force: true });
  });

  test('sin S3 y sin archivo local devuelve false sin tocar el bucket', async () => {
    s3Service.isConfigured = () => false;
    const uploadsBase = fs.mkdtempSync(path.join(os.tmpdir(), 'uploads-'));
    const ok = await eliminarArchivo('Fotos_banner/no_existe.jpg', { uploadsBase });
    assert.equal(ok, false);
    assert.deepEqual(keysBorradas, []);
    fs.rmSync(uploadsBase, { recursive: true, force: true });
  });

  test('valor vacío devuelve false', async () => {
    s3Service.isConfigured = () => true;
    assert.equal(await eliminarArchivo(''), false);
    assert.equal(await eliminarArchivo(null), false);
    assert.deepEqual(keysBorradas, []);
  });
});
