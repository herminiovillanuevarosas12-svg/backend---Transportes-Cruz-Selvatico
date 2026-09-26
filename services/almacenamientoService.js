/**
 * Almacenamiento Service
 * Borrado de archivos subidos, independiente de dónde vivan:
 * - Con Wasabi configurado (producción y local con credenciales): borra la key en el bucket,
 *   tanto si recibe la key relativa (lo que guarda la BD) como una URL completa de Wasabi.
 * - Sin Wasabi: borra el archivo bajo la carpeta local de uploads.
 *
 * Usado por bannerUpload (banners, landing, destinos, etc.) y uploadMiddleware (fotos de entrega).
 */

const fs = require('fs');
const path = require('path');
const s3Service = require('./s3Service');

const UPLOADS_BASE_DEFAULT = path.join(__dirname, '..', 'uploads');

/**
 * Devuelve la key del bucket a partir de una key relativa o de una URL completa de Wasabi.
 * @param {string} urlOrPath
 * @returns {string}
 */
const extraerKey = (urlOrPath) => {
  if (!urlOrPath.includes('wasabisys.com')) return urlOrPath;
  try {
    const url = new URL(urlOrPath.startsWith('http') ? urlOrPath : `https://${urlOrPath}`);
    // pathname = /bucket/key
    const partes = url.pathname.split('/').filter(Boolean);
    return partes.length > 1 ? decodeURIComponent(partes.slice(1).join('/')) : urlOrPath;
  } catch {
    return urlOrPath;
  }
};

/**
 * Elimina un archivo subido (bucket o disco local según configuración).
 * @param {string} urlOrPath - key relativa (ej: 'Fotos_banner/x.jpg') o URL de Wasabi
 * @param {{ uploadsBase?: string }} opciones - carpeta base local (solo sin Wasabi)
 * @returns {Promise<boolean>} true si se eliminó
 */
const eliminarArchivo = async (urlOrPath, { uploadsBase = UPLOADS_BASE_DEFAULT } = {}) => {
  if (!urlOrPath) return false;

  if (s3Service.isConfigured()) {
    return s3Service.deleteFile(extraerKey(urlOrPath));
  }

  const rutaLocal = path.join(uploadsBase, urlOrPath);
  if (!fs.existsSync(rutaLocal)) return false;
  try {
    fs.unlinkSync(rutaLocal);
    return true;
  } catch (error) {
    console.error('Error eliminando archivo local:', error.message);
    return false;
  }
};

module.exports = {
  extraerKey,
  eliminarArchivo
};
