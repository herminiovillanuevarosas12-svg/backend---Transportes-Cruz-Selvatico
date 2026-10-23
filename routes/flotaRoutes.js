/**
 * Flota Routes
 * Rutas de conductores (/api/conductores) y buses (/api/buses)
 */

const express = require('express');
const { conductores, buses } = require('../controllers/flotaController');
const { verifyToken, requirePermission } = require('../middleware/authMiddleware');

/**
 * @param {Object} controlador - { listar, crear, actualizar, eliminar }
 * @param {string} prefijoPermiso - CONDUCTORES | BUSES
 */
const crearRutasFlota = (controlador, prefijoPermiso) => {
  const router = express.Router();

  // GET / - Listar activos (también para elegir al generar un manifiesto)
  router.get('/',
    verifyToken,
    requirePermission([`${prefijoPermiso}_LISTAR`, 'ENCOMIENDAS_MANIFIESTO']),
    controlador.listar
  );

  // POST / - Crear
  router.post('/',
    verifyToken,
    requirePermission(`${prefijoPermiso}_CREAR`),
    controlador.crear
  );

  // PUT /:id - Actualizar
  router.put('/:id',
    verifyToken,
    requirePermission(`${prefijoPermiso}_EDITAR`),
    controlador.actualizar
  );

  // DELETE /:id - Desactivar
  router.delete('/:id',
    verifyToken,
    requirePermission(`${prefijoPermiso}_ELIMINAR`),
    controlador.eliminar
  );

  return router;
};

module.exports = {
  conductoresRoutes: crearRutasFlota(conductores, 'CONDUCTORES'),
  busesRoutes: crearRutasFlota(buses, 'BUSES')
};
