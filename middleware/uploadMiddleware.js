/**
 * Upload Middleware
 * Configuracion de Multer para subida de archivos
 * Soporta S3 (produccion) y almacenamiento local (desarrollo)
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const s3Service = require('../services/s3Service');

// Directorio base para uploads locales (desarrollo)
const UPLOADS_BASE = path.join(__dirname, '..', 'uploads');

// Carpeta para fotos de entrega
const ENTREGA_FOLDER = 'Entrega_encomiendas';

// Filtro para solo permitir imagenes
const imageFilter = (req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Solo se permiten archivos de imagen (JPEG, PNG, GIF, WEBP)'), false);
  }
};

// SIEMPRE usar memoria para tener el buffer disponible
// La decision de S3 vs local se toma al procesar el archivo
const uploadFotoEntrega = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max
  },
  fileFilter: imageFilter
});

/**
 * Procesa el archivo subido y lo guarda en S3 o local
 * @param {Object} file - Archivo de Multer (con buffer)
 * @param {string} encomiendaId - ID de la encomienda
 * @returns {Promise<string>} - Ruta o URL del archivo
 */
const procesarFotoEntrega = async (file, encomiendaId) => {
  if (s3Service.isConfigured()) {
    // Produccion: subir a S3
    console.log('[S3] Subiendo foto de entrega a Wasabi...');
    const result = await s3Service.uploadMulterFile(
      file,
      ENTREGA_FOLDER,
      'enc',
      encomiendaId
    );
    console.log('[S3] Foto subida:', result.key);
    // Retornar solo la key (ruta relativa) para compatibilidad con el frontend
    return result.key;
  } else {
    // Desarrollo: guardar en disco
    console.log('[LOCAL] Guardando foto de entrega en disco...');
    const uploadPath = path.join(UPLOADS_BASE, ENTREGA_FOLDER);

    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }

    const ext = path.extname(file.originalname) || '.jpg';
    const timestamp = Date.now();
    const random = Math.round(Math.random() * 1E9);
    const filename = `enc_${encomiendaId}_${timestamp}_${random}${ext}`;
    const filepath = path.join(uploadPath, filename);

    fs.writeFileSync(filepath, file.buffer);
    console.log('[LOCAL] Foto guardada:', `${ENTREGA_FOLDER}/${filename}`);

    return `${ENTREGA_FOLDER}/${filename}`;
  }
};

/**
 * Guarda imagen desde base64
 * @param {string} base64Data - Imagen en base64
 * @param {string} encomiendaId - ID de la encomienda
 * @returns {Promise<string>} - Ruta o URL del archivo
 */
const guardarImagenBase64 = async (base64Data, encomiendaId) => {
  if (s3Service.isConfigured()) {
    // Produccion: subir a S3
    console.log('[S3] Subiendo imagen base64 a Wasabi...');
    const result = await s3Service.uploadBase64(
      base64Data,
      ENTREGA_FOLDER,
      'enc',
      encomiendaId
    );
    console.log('[S3] Imagen subida:', result.key);
    // Retornar solo la key (ruta relativa) para compatibilidad con el frontend
    return result.key;
  } else {
    // Desarrollo: guardar en disco
    console.log('[LOCAL] Guardando imagen base64 en disco...');
    const uploadPath = path.join(UPLOADS_BASE, ENTREGA_FOLDER);

    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }

    const matches = base64Data.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches) {
      throw new Error('Formato de imagen base64 invalido');
    }

    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const imageData = matches[2];

    const timestamp = Date.now();
    const random = Math.round(Math.random() * 1E9);
    const filename = `enc_${encomiendaId}_${timestamp}_${random}.${ext}`;
    const filepath = path.join(uploadPath, filename);

    const buffer = Buffer.from(imageData, 'base64');
    fs.writeFileSync(filepath, buffer);
    console.log('[LOCAL] Imagen guardada:', `${ENTREGA_FOLDER}/${filename}`);

    return `${ENTREGA_FOLDER}/${filename}`;
  }
};

/**
 * Elimina una foto de entrega
 * @param {string} urlOrPath - URL de S3 o ruta relativa local
 * @returns {Promise<boolean>}
 */
const eliminarFotoEntrega = async (urlOrPath) => {
  if (!urlOrPath) return false;

  if (urlOrPath.includes('wasabisys.com')) {
    // Es una URL de S3: extraer key y eliminar
    const url = new URL(urlOrPath);
    const key = url.pathname.split('/').slice(2).join('/');
    return await s3Service.deleteFile(key);
  } else {
    // Es una ruta local: eliminar archivo
    const fullPath = path.join(UPLOADS_BASE, urlOrPath);
    if (fs.existsSync(fullPath)) {
      try {
        fs.unlinkSync(fullPath);
        console.log('Archivo local eliminado:', urlOrPath);
        return true;
      } catch (error) {
        console.error('Error eliminando archivo local:', error);
        return false;
      }
    }
    return false;
  }
};

module.exports = {
  uploadFotoEntrega,
  procesarFotoEntrega,
  guardarImagenBase64,
  eliminarFotoEntrega,
  UPLOADS_BASE,
  ENTREGA_FOLDER
};
