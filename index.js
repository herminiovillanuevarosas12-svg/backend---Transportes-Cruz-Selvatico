/**
 * =============================================================================
 * Sistema de Transporte - Backend
 * Punto de entrada principal
 * =============================================================================
 *
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                    *** CONFIGURACION HIBRIDA ***                          ║
 * ║                                                                           ║
 * ║  Este servidor soporta dos entornos:                                      ║
 * ║                                                                           ║
 * ║  DESARROLLO LOCAL:                                                        ║
 * ║    - Ejecutar: npm run dev:local                                          ║
 * ║    - Usa .env.local para configuracion                                    ║
 * ║    - Conecta a base de datos local "transporte_db"                        ║
 * ║    - CORS permite localhost:5173                                          ║
 * ║                                                                           ║
 * ║  PRODUCCION (Railway):                                                    ║
 * ║    - Se despliega automaticamente desde Railway                           ║
 * ║    - Usa variables de entorno de Railway                                  ║
 * ║    - Conecta a Railway PostgreSQL                                         ║
 * ║    - CORS permite el dominio de Railway                                   ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

// =============================================================================
// CARGA DE VARIABLES DE ENTORNO
// =============================================================================
// dotenv carga automaticamente .env o .env.local segun el script ejecutado
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3001;

// =============================================================================
// DETECCION DE ENTORNO
// =============================================================================
const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development';

// =============================================================================
// MIDDLEWARES
// =============================================================================

// Seguridad
app.use(helmet());

// CORS - Configurado segun el entorno
// En desarrollo: permite cualquier http://localhost:<puerto>, porque Vite
//   cambia de puerto automaticamente (5173 -> 5174 -> 5175...) cuando el
//   puerto por defecto esta ocupado por otro proyecto.
// En produccion: permite SOLO el dominio configurado en Railway (FRONTEND_URL).
const isDev = (process.env.NODE_ENV || 'development') !== 'production';
app.use(cors({
  origin: isDev
    ? /^http:\/\/localhost:\d+$/
    : (process.env.FRONTEND_URL || 'http://localhost:5173'),
  credentials: true
}));

// Body parsing
// 15mb: las fotos de evidencia permiten hasta 10MB raw, que en base64
// ocupan ~13.4MB (+overhead JSON). Con 10mb el parser devolvia 413.
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true }));

// Servir archivos de uploads (local o S3)
// En desarrollo: sirve desde la carpeta local uploads/
// En produccion: sirve desde Wasabi S3 via proxy
const s3ProxyMiddleware = require('./middleware/s3ProxyMiddleware');
app.use('/uploads', s3ProxyMiddleware);

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// =============================================================================
// RUTAS
// =============================================================================

// API Routes
app.use('/api', routes);

// Ruta raiz - Muestra informacion del servidor y el entorno actual
app.get('/', (req, res) => {
  res.json({
    sistema: 'Sistema de Transporte',
    version: '1.0.0',
    estado: 'activo',
    entorno: isProduction ? 'PRODUCCION (Railway)' : 'DESARROLLO LOCAL',
    documentacion: '/api/health'
  });
});

// =============================================================================
// MANEJO DE ERRORES
// =============================================================================

// 404
app.use((req, res) => {
  res.status(404).json({
    error: 'Ruta no encontrada',
    path: req.originalUrl
  });
});

// Error handler global
app.use((err, req, res, next) => {
  console.error('Error no manejado:', err);

  res.status(err.status || 500).json({
    error: isProduction
      ? 'Error interno del servidor'
      : err.message,
    ...(!isProduction && { stack: err.stack })
  });
});

// =============================================================================
// INICIAR SERVIDOR
// =============================================================================

app.listen(PORT, () => {
  // Banner de inicio con informacion del entorno
  const entorno = isProduction ? 'PRODUCCION (Railway)' : 'DESARROLLO LOCAL';
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  console.log(`
  ╔═══════════════════════════════════════════════════════════════╗
  ║         Sistema de Transporte - Backend                       ║
  ╠═══════════════════════════════════════════════════════════════╣
  ║  Puerto:    ${PORT}                                              ║
  ║  Entorno:   ${entorno.padEnd(42)}║
  ║  Frontend:  ${frontendUrl.padEnd(42)}║
  ║  Hora:      ${new Date().toISOString().padEnd(42)}║
  ╚═══════════════════════════════════════════════════════════════╝
  `);

});

module.exports = app;
