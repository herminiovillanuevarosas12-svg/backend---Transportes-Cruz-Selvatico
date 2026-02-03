/**
 * =============================================================================
 * Configuracion de Base de Datos - Pool de conexiones PostgreSQL
 * =============================================================================
 *
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                    *** CONFIGURACION HIBRIDA ***                          ║
 * ║                                                                           ║
 * ║  DESARROLLO LOCAL:                                                        ║
 * ║    - Usa la base de datos "transporte_db" en PostgreSQL local             ║
 * ║    - Sin SSL (rejectUnauthorized: false)                                  ║
 * ║    - DATABASE_URL definida en .env.local                                  ║
 * ║                                                                           ║
 * ║  PRODUCCION (Railway):                                                    ║
 * ║    - Usa la base de datos en Railway PostgreSQL                           ║
 * ║    - Con SSL habilitado                                                   ║
 * ║    - DATABASE_URL definida en variables de Railway                        ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

const { Pool } = require('pg');

// =============================================================================
// DETECCION DE ENTORNO
// =============================================================================
const isProduction = process.env.NODE_ENV === 'production';
const isLocal = process.env.NODE_ENV === 'development';

// =============================================================================
// CONFIGURACION DEL POOL
// =============================================================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // SSL solo en produccion (Railway requiere SSL)
  // En desarrollo local NO usamos SSL
  ssl: isProduction ? { rejectUnauthorized: false } : false
});

// =============================================================================
// EVENTOS DEL POOL
// =============================================================================

// Conexion exitosa
pool.on('connect', () => {
  // Conexión establecida silenciosamente
});

// Error en el pool
pool.on('error', (err) => {
  console.error('[DB] Error en pool PostgreSQL:', err);
  process.exit(-1);
});

module.exports = pool;
