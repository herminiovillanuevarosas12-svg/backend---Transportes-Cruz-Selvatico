/**
 * =============================================================================
 * Cliente Prisma Singleton
 * =============================================================================
 *
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                    *** CONFIGURACION HIBRIDA ***                          ║
 * ║                                                                           ║
 * ║  DESARROLLO LOCAL:                                                        ║
 * ║    - Logs detallados: query, error, warn                                  ║
 * ║    - Conecta a "transporte_db" via DATABASE_URL en .env.local             ║
 * ║                                                                           ║
 * ║  PRODUCCION (Railway):                                                    ║
 * ║    - Solo logs de error                                                   ║
 * ║    - Conecta a Railway PostgreSQL via variables de Railway                ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

const { PrismaClient } = require('@prisma/client');

// =============================================================================
// DETECCION DE ENTORNO
// =============================================================================
const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development';

// =============================================================================
// CONFIGURACION DE LOGS SEGUN ENTORNO
// =============================================================================
// En desarrollo local: logs detallados para debugging
// En produccion: solo errores para no saturar los logs
const logConfig = isDevelopment
  ? ['query', 'error', 'warn']
  : ['error'];

// =============================================================================
// INSTANCIA DE PRISMA
// =============================================================================
const prisma = new PrismaClient({
  log: logConfig
});

module.exports = prisma;
