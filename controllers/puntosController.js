/**
 * Puntos Controller
 * Controlador para gestion de puntos (agencias/terminales)
 */

const prisma = require('../config/prisma');
const { registrarAuditoria } = require('../services/auditoriaService');
const { utcNow } = require('../utils/dateUtils');

/**
 * Listar todos los puntos
 * GET /api/puntos
 */
const listar = async (req, res) => {
  try {
    const puntos = await prisma.punto.findMany({
      where: { estado: 1 },
      orderBy: { nombre: 'asc' }
    });

    res.json({ puntos });
  } catch (error) {
    console.error('Error listando puntos:', error);
    res.status(500).json({ error: 'Error al listar puntos' });
  }
};

/**
 * Obtener punto por ID
 * GET /api/puntos/:id
 */
const obtener = async (req, res) => {
  try {
    const { id } = req.params;

    const punto = await prisma.punto.findUnique({
      where: { id: parseInt(id) }
    });

    if (!punto) {
      return res.status(404).json({ error: 'Punto no encontrado' });
    }

    res.json({ punto });
  } catch (error) {
    console.error('Error obteniendo punto:', error);
    res.status(500).json({ error: 'Error al obtener punto' });
  }
};

/**
 * Crear punto
 * POST /api/puntos
 */
const crear = async (req, res) => {
  try {
    const { nombre, tipo, ciudad, direccion } = req.body;

    // Validaciones
    if (!nombre || !tipo || !ciudad) {
      return res.status(400).json({
        error: 'Nombre, tipo y ciudad son requeridos'
      });
    }

    if (!['AGENCIA', 'TERMINAL'].includes(tipo)) {
      return res.status(400).json({
        error: 'Tipo debe ser AGENCIA o TERMINAL'
      });
    }

    const punto = await prisma.punto.create({
      data: {
        nombre,
        tipo,
        ciudad,
        direccion,
        estado: 1,
        userIdRegistration: req.user.id
      }
    });

    // Auditoria
    await registrarAuditoria(req.user.id, 'PUNTO_CREADO', 'PUNTO', punto.id, punto);

    res.status(201).json({
      mensaje: 'Punto creado exitosamente',
      punto
    });
  } catch (error) {
    console.error('Error creando punto:', error);
    res.status(500).json({ error: 'Error al crear punto' });
  }
};

/**
 * Actualizar punto
 * PUT /api/puntos/:id
 */
const actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, tipo, ciudad, direccion, estado } = req.body;

    const puntoExistente = await prisma.punto.findUnique({
      where: { id: parseInt(id) }
    });

    if (!puntoExistente) {
      return res.status(404).json({ error: 'Punto no encontrado' });
    }

    const punto = await prisma.punto.update({
      where: { id: parseInt(id) },
      data: {
        nombre: nombre || puntoExistente.nombre,
        tipo: tipo || puntoExistente.tipo,
        ciudad: ciudad || puntoExistente.ciudad,
        direccion: direccion !== undefined ? direccion : puntoExistente.direccion,
        estado: estado !== undefined ? estado : puntoExistente.estado,
        userIdModification: req.user.id,
        dateTimeModification: utcNow()
      }
    });

    // Auditoria
    await registrarAuditoria(req.user.id, 'PUNTO_ACTUALIZADO', 'PUNTO', punto.id, {
      anterior: puntoExistente,
      nuevo: punto
    });

    res.json({
      mensaje: 'Punto actualizado exitosamente',
      punto
    });
  } catch (error) {
    console.error('Error actualizando punto:', error);
    res.status(500).json({ error: 'Error al actualizar punto' });
  }
};

/**
 * Eliminar/desactivar punto
 * DELETE /api/puntos/:id
 */
const eliminar = async (req, res) => {
  try {
    const { id } = req.params;

    const puntoExistente = await prisma.punto.findUnique({
      where: { id: parseInt(id) }
    });

    if (!puntoExistente) {
      return res.status(404).json({ error: 'Punto no encontrado' });
    }

    // Desactivar en lugar de eliminar
    const punto = await prisma.punto.update({
      where: { id: parseInt(id) },
      data: {
        estado: 0,
        userIdModification: req.user.id,
        dateTimeModification: utcNow()
      }
    });

    // Auditoria
    await registrarAuditoria(req.user.id, 'PUNTO_ELIMINADO', 'PUNTO', punto.id, punto);

    res.json({
      mensaje: 'Punto eliminado exitosamente'
    });
  } catch (error) {
    console.error('Error eliminando punto:', error);
    res.status(500).json({ error: 'Error al eliminar punto' });
  }
};

module.exports = {
  listar,
  obtener,
  crear,
  actualizar,
  eliminar
};
