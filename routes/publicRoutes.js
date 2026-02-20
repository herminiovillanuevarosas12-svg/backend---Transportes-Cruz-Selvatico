/**
 * Public Routes
 * Rutas publicas (sin autenticacion)
 */

const express = require('express');
const router = express.Router();
const encomiendasController = require('../controllers/encomiendasController');
const landingController = require('../controllers/landingController');
const festividadesController = require('../controllers/festividadesController');
const prisma = require('../config/prisma');
const { formatTimeForAPI } = require('../utils/dateUtils');

// GET /api/public/tracking/:codigo - Consultar encomienda (publico)
router.get('/tracking/:codigo', encomiendasController.consultaPublica);

// GET /api/public/landing/banners - Obtener banners activos
router.get('/landing/banners', landingController.getBannersPublicos);

// GET /api/public/landing/gallery - Obtener galería de imágenes
router.get('/landing/gallery', landingController.getGaleriaPublica);

// GET /api/public/landing/config - Obtener configuración de landing
router.get('/landing/config', landingController.getConfigLandingPublica);

// GET /api/public/landing/servicios - Obtener servicios landing (público)
router.get('/landing/servicios', landingController.getServiciosPublicos);

// GET /api/public/festividades - Obtener festividades activas (público)
router.get('/festividades', festividadesController.getFestividadesPublicas);

/**
 * GET /api/public/rutas - Listar rutas con horarios y precios (publico)
 * Para mostrar en el landing page
 */
router.get('/rutas', async (req, res) => {
  try {
    const rutas = await prisma.ruta.findMany({
      where: { estado: 1 },
      include: {
        puntoOrigen: {
          select: { id: true, nombre: true, ciudad: true, direccion: true }
        },
        puntoDestino: {
          select: { id: true, nombre: true, ciudad: true, direccion: true }
        },
        horarios: {
          where: { habilitado: true },
          orderBy: { horaSalida: 'asc' },
          select: { id: true, horaSalida: true, capacidadTotal: true }
        }
      },
      orderBy: { id: 'asc' }
    });

    // Formatear horarios para mejor lectura (capacidad por horario)
    // NOTA: Devolvemos hora en formato 24h (HH:mm) - el frontend convierte a formato local
    const rutasFormateadas = rutas.map(ruta => ({
      id: ruta.id,
      origen: ruta.puntoOrigen,
      destino: ruta.puntoDestino,
      precioPasaje: ruta.precioPasaje,
      horarios: ruta.horarios.map(h => ({
        id: h.id,
        hora: formatTimeForAPI(h.horaSalida),
        horaSalidaISO: h.horaSalida, // ISO para que el frontend pueda formatear localmente
        capacidadTotal: h.capacidadTotal
      }))
    }));

    res.json({ rutas: rutasFormateadas });
  } catch (error) {
    console.error('Error listando rutas publicas:', error);
    res.status(500).json({ error: 'Error al listar rutas' });
  }
});

/**
 * GET /api/public/puntos - Listar puntos de cobertura (publico)
 * Para mostrar destinos disponibles en el landing
 */
router.get('/puntos', async (req, res) => {
  try {
    const puntos = await prisma.punto.findMany({
      where: { estado: 1 },
      select: {
        id: true,
        nombre: true,
        tipo: true,
        ciudad: true,
        direccion: true
      },
      orderBy: { ciudad: 'asc' }
    });

    // Agrupar por ciudad
    const ciudades = {};
    puntos.forEach(punto => {
      if (!ciudades[punto.ciudad]) {
        ciudades[punto.ciudad] = [];
      }
      ciudades[punto.ciudad].push(punto);
    });

    res.json({ puntos, ciudades });
  } catch (error) {
    console.error('Error listando puntos publicos:', error);
    res.status(500).json({ error: 'Error al listar puntos' });
  }
});

module.exports = router;
