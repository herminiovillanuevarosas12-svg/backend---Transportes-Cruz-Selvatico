/**
 * Banner Upload Middleware
 * Configuración de Multer para subida de imágenes de banners y galería
 * Soporta S3 (produccion) y almacenamiento local (desarrollo)
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const s3Service = require('../services/s3Service');

// Directorio base para uploads locales
const UPLOADS_BASE = path.join(__dirname, '..', 'uploads');
const BANNERS_DIR = 'Fotos_banner';
const GALLERY_DIR = 'Fotos_galería';
const FESTIVIDADES_DIR = 'Fotos_festividades';

// Filtro para solo permitir imágenes
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
const uploadBanner = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max
  },
  fileFilter: imageFilter
});

/**
 * Procesa el archivo subido y lo guarda en S3 o local
 * @param {Object} file - Archivo de Multer (con buffer)
 * @param {string} tipo - 'banner' o 'gallery'
 * @returns {Promise<string>} - Ruta o URL del archivo
 */
const procesarBannerFile = async (file, tipo = 'banner') => {
  const folder = tipo === 'gallery' ? GALLERY_DIR : tipo === 'festividad' ? FESTIVIDADES_DIR : BANNERS_DIR;
  const prefix = tipo === 'gallery' ? 'gallery' : tipo === 'festividad' ? 'festividad' : 'banner';

  if (s3Service.isConfigured()) {
    // Produccion: subir a S3
    const result = await s3Service.uploadMulterFile(file, folder, prefix);
    // Retornar solo la key (ruta relativa) para compatibilidad con el frontend
    return result.key;
  } else {
    // Desarrollo: guardar en disco
    const uploadPath = path.join(UPLOADS_BASE, folder);

    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }

    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const timestamp = Date.now();
    const random = Math.round(Math.random() * 1E9);
    const filename = `${prefix}_${timestamp}_${random}${ext}`;
    const filepath = path.join(uploadPath, filename);

    fs.writeFileSync(filepath, file.buffer);

    return `${folder}/${filename}`;
  }
};

/**
 * Función para eliminar archivo de banner o galería
 * @param {string} urlOrPath - URL de S3 o ruta relativa local
 * @returns {Promise<boolean>}
 */
const eliminarArchivoBanner = async (urlOrPath) => {
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
        return true;
      } catch (error) {
        console.error('Error eliminando archivo:', error.message);
        return false;
      }
    }
    return false;
  }
};

/**
 * Función helper para guardar imagen desde base64
 * @param {string} base64Data - Imagen en base64
 * @param {string} tipo - 'banner' o 'gallery'
 * @returns {Promise<string>} - Ruta o URL del archivo
 */
const guardarBannerBase64 = async (base64Data, tipo = 'banner') => {
  const folder = tipo === 'gallery' ? GALLERY_DIR : tipo === 'festividad' ? FESTIVIDADES_DIR : BANNERS_DIR;
  const prefix = tipo === 'gallery' ? 'gallery' : tipo === 'festividad' ? 'festividad' : 'banner';

  if (s3Service.isConfigured()) {
    // Produccion: subir a S3
    const result = await s3Service.uploadBase64(base64Data, folder, prefix);
    // Retornar solo la key (ruta relativa) para compatibilidad con el frontend
    return result.key;
  } else {
    // Desarrollo: guardar en disco
    const uploadPath = path.join(UPLOADS_BASE, folder);

    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }

    const matches = base64Data.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches) {
      throw new Error('Formato de imagen base64 inválido');
    }

    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const imageData = matches[2];

    const timestamp = Date.now();
    const random = Math.round(Math.random() * 1E9);
    const filename = `${prefix}_${timestamp}_${random}.${ext}`;
    const filepath = path.join(uploadPath, filename);

    const buffer = Buffer.from(imageData, 'base64');
    fs.writeFileSync(filepath, buffer);

    return `${folder}/${filename}`;
  }
};

/**
 * Función para obtener la carpeta según el tipo
 * @param {string} tipo - 'banner' o 'gallery'
 * @returns {string}
 */
const getUploadDir = (tipo) => {
  if (tipo === 'gallery') return GALLERY_DIR;
  if (tipo === 'festividad') return FESTIVIDADES_DIR;
  return BANNERS_DIR;
};

module.exports = {
  uploadBanner,
  procesarBannerFile,
  eliminarArchivoBanner,
  guardarBannerBase64,
  getUploadDir,
  BANNERS_DIR,
  GALLERY_DIR,
  FESTIVIDADES_DIR
};
