/**
 * S3 Service - Wasabi Cloud Storage
 * Servicio para manejo de archivos en Wasabi S3
 */

const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');

// Configuracion de Wasabi S3
const s3Client = new S3Client({
  endpoint: process.env.WASABI_ENDPOINT || 'https://s3.us-east-1.wasabisys.com',
  region: process.env.WASABI_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.WASABI_ACCESS_KEY_ID,
    secretAccessKey: process.env.WASABI_SECRET_ACCESS_KEY
  },
  forcePathStyle: true // Necesario para Wasabi
});

// Bucket por defecto para uploads
const UPLOADS_BUCKET = process.env.WASABI_UPLOADS_BUCKET || 'transporte-herminio-uploads';
const BACKUPS_BUCKET = process.env.WASABI_BACKUPS_BUCKET || 'transporte-herminio-backups';

// Log de configuracion al iniciar
if (!process.env.WASABI_ACCESS_KEY_ID || !process.env.WASABI_SECRET_ACCESS_KEY) {
  console.warn('[S3] ADVERTENCIA: Credenciales de Wasabi no configuradas. Los uploads iran a disco local.');
} else {
  console.log('[S3] Servicio Wasabi S3 configurado correctamente');
  console.log('[S3] Endpoint:', process.env.WASABI_ENDPOINT || 'https://s3.us-east-1.wasabisys.com');
  console.log('[S3] Bucket uploads:', UPLOADS_BUCKET);
  console.log('[S3] Bucket backups:', BACKUPS_BUCKET);
}

/**
 * Sube un archivo buffer a S3
 * @param {Buffer} buffer - Contenido del archivo
 * @param {string} key - Ruta/nombre del archivo en S3 (ej: 'Entrega_encomiendas/foto.jpg')
 * @param {string} contentType - MIME type del archivo
 * @param {string} bucket - Bucket de destino (opcional)
 * @returns {Promise<{key: string, url: string}>}
 */
const uploadFile = async (buffer, key, contentType, bucket = UPLOADS_BUCKET) => {
  try {
    console.log(`[S3] Iniciando upload: ${key} al bucket ${bucket}`);
    console.log(`[S3] Tamaño: ${(buffer.length / 1024).toFixed(2)} KB, Tipo: ${contentType}`);

    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType
        // NO usar ACL - Wasabi no soporta ACLs en cuentas nuevas
        // El acceso publico se configura via bucket policy
      }
    });

    await upload.done();

    const url = getPublicUrl(key, bucket);
    console.log(`[S3] Upload exitoso: ${url}`);

    return {
      key,
      url
    };
  } catch (error) {
    console.error(`[S3] ERROR subiendo archivo ${key}:`, error.message);
    console.error(`[S3] Codigo de error:`, error.code || error.$metadata?.httpStatusCode);
    console.error(`[S3] Detalles:`, JSON.stringify(error.$metadata || {}, null, 2));
    throw error;
  }
};

/**
 * Sube una imagen desde base64 a S3
 * @param {string} base64Data - Imagen en formato base64 (data:image/...;base64,...)
 * @param {string} folder - Carpeta destino (ej: 'Entrega_encomiendas', 'Fotos_banner')
 * @param {string} prefix - Prefijo para el nombre (ej: 'enc', 'banner', 'gallery')
 * @param {string} identifier - Identificador unico (ej: encomiendaId)
 * @returns {Promise<{key: string, url: string}>}
 */
const uploadBase64 = async (base64Data, folder, prefix, identifier = '') => {
  // Extraer tipo de imagen y datos
  const matches = base64Data.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!matches) {
    throw new Error('Formato de imagen base64 invalido');
  }

  const imageType = matches[1];
  const ext = imageType === 'jpeg' ? 'jpg' : imageType;
  const imageData = matches[2];
  const contentType = `image/${imageType}`;

  // Generar nombre de archivo
  const timestamp = Date.now();
  const random = Math.round(Math.random() * 1E9);
  const idPart = identifier ? `${identifier}_` : '';
  const filename = `${prefix}_${idPart}${timestamp}_${random}.${ext}`;
  const key = `${folder}/${filename}`;

  // Convertir base64 a buffer
  const buffer = Buffer.from(imageData, 'base64');

  return await uploadFile(buffer, key, contentType);
};

/**
 * Sube un archivo desde Multer a S3
 * @param {Object} file - Objeto file de Multer (con buffer)
 * @param {string} folder - Carpeta destino
 * @param {string} prefix - Prefijo para el nombre
 * @param {string} identifier - Identificador unico
 * @returns {Promise<{key: string, url: string}>}
 */
const uploadMulterFile = async (file, folder, prefix, identifier = '') => {
  const ext = file.originalname.split('.').pop().toLowerCase() || 'jpg';
  const timestamp = Date.now();
  const random = Math.round(Math.random() * 1E9);
  const idPart = identifier ? `${identifier}_` : '';
  const filename = `${prefix}_${idPart}${timestamp}_${random}.${ext}`;
  const key = `${folder}/${filename}`;

  return await uploadFile(file.buffer, key, file.mimetype);
};

/**
 * Elimina un archivo de S3
 * @param {string} key - Ruta del archivo en S3
 * @param {string} bucket - Bucket (opcional)
 * @returns {Promise<boolean>}
 */
const deleteFile = async (key, bucket = UPLOADS_BUCKET) => {
  if (!key) return false;

  try {
    console.log(`[S3] Eliminando archivo: ${key}`);
    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: key
    });

    await s3Client.send(command);
    console.log('[S3] Archivo eliminado exitosamente:', key);
    return true;
  } catch (error) {
    console.error('[S3] Error eliminando archivo:', error.message);
    return false;
  }
};

/**
 * Obtiene la URL publica de un archivo en Wasabi
 * @param {string} key - Ruta del archivo
 * @param {string} bucket - Bucket
 * @returns {string}
 */
const getPublicUrl = (key, bucket = UPLOADS_BUCKET) => {
  const endpoint = process.env.WASABI_ENDPOINT || 'https://s3.us-east-1.wasabisys.com';
  return `${endpoint}/${bucket}/${key}`;
};

/**
 * Sube un backup de base de datos a S3
 * @param {Buffer} buffer - Contenido del backup
 * @param {string} filename - Nombre del archivo de backup
 * @returns {Promise<{key: string, url: string}>}
 */
const uploadBackup = async (buffer, filename) => {
  const key = `database/${filename}`;
  return await uploadFile(buffer, key, 'application/sql', BACKUPS_BUCKET);
};

/**
 * Verifica si la conexion a S3 esta configurada
 * @returns {boolean}
 */
const isConfigured = () => {
  const configured = !!(process.env.WASABI_ACCESS_KEY_ID && process.env.WASABI_SECRET_ACCESS_KEY);
  return configured;
};

module.exports = {
  s3Client,
  uploadFile,
  uploadBase64,
  uploadMulterFile,
  deleteFile,
  getPublicUrl,
  uploadBackup,
  isConfigured,
  UPLOADS_BUCKET,
  BACKUPS_BUCKET
};
