/**
 * Horarios Controller
 * Controlador para gestion de horarios de ruta
 */

const prisma = require('../config/prisma');
const { registrarAuditoria } = require('../services/auditoriaService');
const { parseTime, createTimeForDB, utcNow } = require('../utils/dateUtils');

/**
 * Listar horarios por ruta
 * GET /api/rutas/:id_ruta/horarios
 */
const listarPorRuta = async (req, res) => {
  try {
    const { id_ruta } = req.params;

    const horarios = await prisma.horarioRuta.findMany({
      where: { idRuta: parseInt(id_ruta) },
      orderBy: { horaSalida: 'asc' }
    });

    res.json({ horarios });
  } catch (error) {
    console.error('Error listando horarios:', error);
    res.status(500).json({ error: 'Error al listar horarios' });
  }
};

/**
 * Crear horario
 * POST /api/rutas/:id_ruta/horarios
 */
const crear = async (req, res) => {
  try {
    const { id_ruta } = req.params;
    const { horaSalida, capacidadTotal } = req.body;

    // Validaciones
    if (!horaSalida) {
      return res.status(400).json({
        error: 'La hora de salida es requerida'
      });
    }

    // Validar capacidad (requerida y mayor a 0)
    const capacidad = parseInt(capacidadTotal) || 40;
    if (capacidad <= 0) {
      return res.status(400).json({
        error: 'La capacidad debe ser mayor a 0'
      });
    }

    // Verificar que la ruta existe y esta activa
    const ruta = await prisma.ruta.findUnique({
      where: { id: parseInt(id_ruta) }
    });

    if (!ruta || ruta.estado !== 1) {
      return res.status(400).json({
        error: 'La ruta no existe o no esta activa'
      });
    }

    // Convertir hora a formato Date para Prisma (usando utilidad centralizada)
    const parsedTime = parseTime(horaSalida, 'horaSalida');
    if (parsedTime.error) {
      return res.status(400).json({ error: parsedTime.error });
    }
    const horaDate = createTimeForDB(parsedTime.hours, parsedTime.minutes, parsedTime.seconds);

    // Verificar que no exista el mismo horario
    const horarioExistente = await prisma.horarioRuta.findFirst({
      where: {
        idRuta: parseInt(id_ruta),
        horaSalida: horaDate
      }
    });

    if (horarioExistente) {
      return res.status(400).json({
        error: 'Ya existe un horario a esa hora para esta ruta'
      });
    }

    const horario = await prisma.horarioRuta.create({
      data: {
        idRuta: parseInt(id_ruta),
        horaSalida: horaDate,
        capacidadTotal: capacidad,
        habilitado: true,
        userIdRegistration: req.user.id
      }
    });

    // Auditoria
    await registrarAuditoria(req.user.id, 'HORARIO_CREADO', 'HORARIO', horario.id, horario);

    res.status(201).json({
      mensaje: 'Horario creado exitosamente',
      horario
    });
  } catch (error) {
    console.error('Error creando horario:', error);
    res.status(500).json({ error: 'Error al crear horario' });
  }
};

/**
 * Actualizar horario
 * PUT /api/horarios/:id
 */
const actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const { horaSalida, capacidadTotal } = req.body;

    const horarioExistente = await prisma.horarioRuta.findUnique({
      where: { id: parseInt(id) }
    });

    if (!horarioExistente) {
      return res.status(404).json({ error: 'Horario no encontrado' });
    }

    let horaDate = horarioExistente.horaSalida;
    if (horaSalida) {
      const parsedTime = parseTime(horaSalida, 'horaSalida');
      if (parsedTime.error) {
        return res.status(400).json({ error: parsedTime.error });
      }
      horaDate = createTimeForDB(parsedTime.hours, parsedTime.minutes, parsedTime.seconds);
    }

    // Preparar datos de actualizacion
    const updateData = {
      horaSalida: horaDate,
      userIdModification: req.user.id,
      dateTimeModification: utcNow()
    };

    // Actualizar capacidad si se proporciona
    if (capacidadTotal !== undefined) {
      const capacidad = parseInt(capacidadTotal);
      if (capacidad > 0) {
        updateData.capacidadTotal = capacidad;
      }
    }

    const horario = await prisma.horarioRuta.update({
      where: { id: parseInt(id) },
      data: updateData
    });

    // Auditoria
    await registrarAuditoria(req.user.id, 'HORARIO_ACTUALIZADO', 'HORARIO', horario.id, {
      anterior: horarioExistente,
      nuevo: horario
    });

    res.json({
      mensaje: 'Horario actualizado exitosamente',
      horario
    });
  } catch (error) {
    console.error('Error actualizando horario:', error);
    res.status(500).json({ error: 'Error al actualizar horario' });
  }
};

/**
 * Toggle habilitar/deshabilitar horario
 * PATCH /api/horarios/:id/toggle
 */
const toggle = async (req, res) => {
  try {
    const { id } = req.params;

    const horarioExistente = await prisma.horarioRuta.findUnique({
      where: { id: parseInt(id) }
    });

    if (!horarioExistente) {
      return res.status(404).json({ error: 'Horario no encontrado' });
    }

    const horario = await prisma.horarioRuta.update({
      where: { id: parseInt(id) },
      data: {
        habilitado: !horarioExistente.habilitado,
        userIdModification: req.user.id,
        dateTimeModification: utcNow()
      }
    });

    // Auditoria
    await registrarAuditoria(
      req.user.id,
      horario.habilitado ? 'HORARIO_HABILITADO' : 'HORARIO_DESHABILITADO',
      'HORARIO',
      horario.id,
      horario
    );

    res.json({
      mensaje: `Horario ${horario.habilitado ? 'habilitado' : 'deshabilitado'} exitosamente`,
      horario
    });
  } catch (error) {
    console.error('Error toggle horario:', error);
    res.status(500).json({ error: 'Error al cambiar estado del horario' });
  }
};

/**
 * Eliminar horario
 * DELETE /api/horarios/:id
 */
const eliminar = async (req, res) => {
  try {
    const { id } = req.params;

    const horarioExistente = await prisma.horarioRuta.findUnique({
      where: { id: parseInt(id) }
    });

    if (!horarioExistente) {
      return res.status(404).json({ error: 'Horario no encontrado' });
    }

    // Verificar que no tenga viajes asociados
    const viajesAsociados = await prisma.viaje.count({
      where: { idHorario: parseInt(id) }
    });

    if (viajesAsociados > 0) {
      return res.status(400).json({
        error: 'No se puede eliminar, tiene viajes asociados. Deshabilitelo en su lugar.'
      });
    }

    await prisma.horarioRuta.delete({
      where: { id: parseInt(id) }
    });

    // Auditoria
    await registrarAuditoria(req.user.id, 'HORARIO_ELIMINADO', 'HORARIO', id, horarioExistente);

    res.json({
      mensaje: 'Horario eliminado exitosamente'
    });
  } catch (error) {
    console.error('Error eliminando horario:', error);
    res.status(500).json({ error: 'Error al eliminar horario' });
  }
};

module.exports = {
  listarPorRuta,
  crear,
  actualizar,
  toggle,
  eliminar
};
