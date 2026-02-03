/**
 * S3 Proxy Middleware
 * Sirve archivos desde S3 cuando no existen localmente
 */

const path = require('path');
const fs = require('fs');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');

// Cliente S3 para Wasabi
const getS3Client = () => {
  if (!process.env.WASABI_ACCESS_KEY_ID || !process.env.WASABI_SECRET_ACCESS_KEY) {
    return null;
  }

  return new S3Client({
    endpoint: process.env.WASABI_ENDPOINT || 'https://s3.us-east-1.wasabisys.com',
    region: process.env.WASABI_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.WASABI_ACCESS_KEY_ID,
      secretAccessKey: process.env.WASABI_SECRET_ACCESS_KEY
    },
    forcePathStyle: true
  });
};

const UPLOADS_BUCKET = process.env.WASABI_UPLOADS_BUCKET || 'transporte-herminio-uploads';
const UPLOADS_BASE = path.join(__dirname, '..', 'uploads');

// Mapa de extensiones a content-types
const CONTENT_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf'
};

/**
 * Extrae la key de una URL de S3 o retorna el path si ya es relativo
 * Ej: "https://s3.../bucket/Fotos_banner/img.jpg" -> "Fotos_banner/img.jpg"
 * Ej: "Fotos_banner/img.jpg" -> "Fotos_banner/img.jpg"
 */
const extractKeyFromPath = (inputPath) => {
  // Si es una URL de S3, extraer solo la key
  if (inputPath.includes('wasabisys.com') || inputPath.includes('s3.')) {
    try {
      const url = new URL(inputPath.startsWith('http') ? inputPath : `https://${inputPath}`);
      // El pathname es /bucket/key, necesitamos solo key
      const pathParts = url.pathname.split('/').filter(Boolean);
      // Quitar el nombre del bucket (primer elemento)
      if (pathParts.length > 1) {
        return pathParts.slice(1).join('/');
      }
    } catch (e) {
      // Si falla el parse, usar el path original
    }
  }
  return inputPath;
};

/**
 * Middleware que sirve archivos desde local o S3
 */
const s3ProxyMiddleware = async (req, res, next) => {
  // Obtener la ruta del archivo solicitado y decodificar caracteres especiales (ej: %C3%AD -> í)
  let filePath = decodeURIComponent(req.path.replace(/^\//, '')); // Quitar / inicial y decodificar

  // Extraer key si es una URL de S3
  filePath = extractKeyFromPath(filePath);

  if (!filePath) {
    return res.status(400).json({ error: 'Ruta de archivo no especificada' });
  }

  // 1. Primero intentar servir desde local
  const localPath = path.join(UPLOADS_BASE, filePath);

  if (fs.existsSync(localPath)) {
    // Archivo existe localmente, servirlo
    const ext = path.extname(localPath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache 1 año
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    return res.sendFile(localPath);
  }

  // 2. Si no existe localmente, intentar desde S3
  const s3Client = getS3Client();

  if (!s3Client) {
    // S3 no configurado y archivo no existe localmente
    console.log(`[Uploads] Archivo no encontrado (local): ${filePath}`);
    return res.status(404).json({ error: 'Archivo no encontrado' });
  }

  try {
    console.log(`[S3 Proxy] Obteniendo de S3: ${filePath}`);

    const command = new GetObjectCommand({
      Bucket: UPLOADS_BUCKET,
      Key: filePath
    });

    const response = await s3Client.send(command);

    // Determinar content-type
    const ext = path.extname(filePath).toLowerCase();
    const contentType = response.ContentType || CONTENT_TYPES[ext] || 'application/octet-stream';

    // Configurar headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache 1 año
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    if (response.ContentLength) {
      res.setHeader('Content-Length', response.ContentLength);
    }

    // Pipe del stream de S3 a la respuesta
    response.Body.pipe(res);

  } catch (error) {
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      console.log(`[S3 Proxy] Archivo no encontrado en S3: ${filePath}`);
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }

    console.error(`[S3 Proxy] Error obteniendo archivo ${filePath}:`, error.message);
    return res.status(500).json({ error: 'Error al obtener archivo' });
  }
};

module.exports = s3ProxyMiddleware;
