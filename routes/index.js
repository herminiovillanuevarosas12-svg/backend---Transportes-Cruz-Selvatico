/**
 * Routes Index
 * Configuracion central de rutas
 */

const express = require('express');
const router = express.Router();

// Importar rutas
const authRoutes = require('./authRoutes');
const puntosRoutes = require('./puntosRoutes');
const rutasRoutes = require('./rutasRoutes');
const horariosRoutes = require('./horariosRoutes');
const viajesRoutes = require('./viajesRoutes');
const ticketsRoutes = require('./ticketsRoutes');
const encomiendasRoutes = require('./encomiendasRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const usuariosRoutes = require('./usuariosRoutes');
const rolesRoutes = require('./rolesRoutes');
const configuracionRoutes = require('./configuracionRoutes');
const publicRoutes = require('./publicRoutes');
const clientesRoutes = require('./clientesRoutes');
const facturacionRoutes = require('./facturacionRoutes');
const consultaDocRoutes = require('./consultaDocRoutes');
const tiposCarroRoutes = require('./tiposCarroRoutes');
const configTiposPaqueteRoutes = require('./configTiposPaqueteRoutes');
const landingRoutes = require('./landingRoutes');
const preciosBaseRoutes = require('./preciosBaseRoutes');

// Montar rutas
router.use('/auth', authRoutes);
router.use('/puntos', puntosRoutes);
router.use('/rutas', rutasRoutes);
router.use('/horarios', horariosRoutes);
router.use('/viajes', viajesRoutes);
router.use('/tickets', ticketsRoutes);
router.use('/encomiendas', encomiendasRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/usuarios', usuariosRoutes);
router.use('/roles', rolesRoutes);
router.use('/configuracion', configuracionRoutes);
router.use('/public', publicRoutes);
router.use('/clientes', clientesRoutes);
router.use('/facturacion', facturacionRoutes);
router.use('/consulta-doc', consultaDocRoutes);
router.use('/tipos-carro', tiposCarroRoutes);
router.use('/config-tipos-paquete', configTiposPaqueteRoutes);
router.use('/landing', landingRoutes);
router.use('/precios-base-encomienda', preciosBaseRoutes);

// Health check
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
