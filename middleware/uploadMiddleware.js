/**
 * Upload Middleware
 * Configuracion de Multer para subida de archivos
 * Soporta S3 (produccion) y almacenamiento local (desarrollo)
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const s3Service = require('../services/s3Service');
const { eliminarArchivo } = require('../services/almacenamientoService');

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
    const result = await s3Service.uploadMulterFile(
      file,
      ENTREGA_FOLDER,
      'enc',
      encomiendaId
    );
    // Retornar solo la key (ruta relativa) para compatibilidad con el frontend
    return result.key;
  } else {
    // Desarrollo: guardar en disco
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
    const result = await s3Service.uploadBase64(
      base64Data,
      ENTREGA_FOLDER,
      'enc',
      encomiendaId
    );
    // Retornar solo la key (ruta relativa) para compatibilidad con el frontend
    return result.key;
  } else {
    // Desarrollo: guardar en disco
    const uploadPath = path.join(UPLOADS_BASE, ENTREGA_FOLDER);

    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }

    const parsed = s3Service.parsearImagenBase64(base64Data);
    if (!parsed) {
      throw new Error('Formato de imagen no soportado. Use JPG, PNG, WEBP o GIF.');
    }

    const { ext, imageData } = parsed;

    const timestamp = Date.now();
    const random = Math.round(Math.random() * 1E9);
    const filename = `enc_${encomiendaId}_${timestamp}_${random}.${ext}`;
    const filepath = path.join(uploadPath, filename);

    const buffer = Buffer.from(imageData, 'base64');
    fs.writeFileSync(filepath, buffer);

    return `${ENTREGA_FOLDER}/${filename}`;
  }
};

/**
 * Elimina una foto de entrega (bucket o disco local según configuración)
 * @param {string} urlOrPath - key relativa de S3 o URL completa de Wasabi
 * @returns {Promise<boolean>}
 */
const eliminarFotoEntrega = (urlOrPath) => eliminarArchivo(urlOrPath, { uploadsBase: UPLOADS_BASE });

module.exports = {
  uploadFotoEntrega,
  procesarFotoEntrega,
  guardarImagenBase64,
  eliminarFotoEntrega,
  UPLOADS_BASE,
  ENTREGA_FOLDER
};
