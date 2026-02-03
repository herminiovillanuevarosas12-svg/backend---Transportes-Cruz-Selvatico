/**
 * Viajes Controller
 * Controlador para consulta de viajes
 */

const prisma = require('../config/prisma');
const { parseCivilDate, isToday, hasTimePassed } = require('../utils/dateUtils');

/**
 * Listar viajes
 * GET /api/viajes
 * Query params: fecha, idRuta
 */
const listar = async (req, res) => {
  try {
    const { fecha, idRuta } = req.query;

    const where = {};

    if (fecha) {
      const { date: fechaParsed, error } = parseCivilDate(fecha, 'fecha');
      if (error) {
        return res.status(400).json({ error });
      }
      where.fechaServicio = fechaParsed;
    }

    if (idRuta) {
      where.idRuta = parseInt(idRuta);
    }

    const viajes = await prisma.viaje.findMany({
      where,
      include: {
        ruta: {
          include: {
            puntoOrigen: { select: { id: true, nombre: true } },
            puntoDestino: { select: { id: true, nombre: true } }
          }
        },
        horario: true
      },
      orderBy: [
        { fechaServicio: 'asc' },
        { horario: { horaSalida: 'asc' } }
      ]
    });

    res.json({ viajes });
  } catch (error) {
    console.error('Error listando viajes:', error);
    res.status(500).json({ error: 'Error al listar viajes' });
  }
};

/**
 * Obtener disponibilidad para venta
 * GET /api/viajes/disponibilidad
 * Query params: idRuta, fecha
 */
const disponibilidad = async (req, res) => {
  try {
    const { idRuta, fecha } = req.query;

    if (!idRuta || !fecha) {
      return res.status(400).json({
        error: 'Se requiere idRuta y fecha'
      });
    }

    // Obtener la ruta con sus horarios habilitados (incluir capacidadTotal del horario)
    const ruta = await prisma.ruta.findUnique({
      where: { id: parseInt(idRuta) },
      include: {
        puntoOrigen: true,
        puntoDestino: true,
        horarios: {
          where: { habilitado: true },
          orderBy: { horaSalida: 'asc' },
          select: {
            id: true,
            horaSalida: true,
            capacidadTotal: true,
            habilitado: true
          }
        }
      }
    });

    if (!ruta || ruta.estado !== 1) {
      return res.status(404).json({
        error: 'Ruta no encontrada o no esta activa'
      });
    }

    // Parsear fecha civil usando utilidad centralizada
    const { date: fechaDate, error: fechaError } = parseCivilDate(fecha, 'fecha');
    if (fechaError) {
      return res.status(400).json({ error: fechaError });
    }

    // Determinar si es hoy para filtrar horarios pasados (usando hora Perú)
    const esHoy = isToday(fecha);

    // Para cada horario, verificar si existe viaje o calcular disponibilidad
    const disponibilidad = await Promise.all(
      ruta.horarios.map(async (horario) => {
        const viaje = await prisma.viaje.findUnique({
          where: {
            idRuta_idHorario_fechaServicio: {
              idRuta: parseInt(idRuta),
              idHorario: horario.id,
              fechaServicio: fechaDate
            }
          }
        });

        // Usar capacidad del horario (no de la ruta)
        const capacidadTotal = viaje ? viaje.capacidadTotal : horario.capacidadTotal;
        const capacidadVendida = viaje ? viaje.capacidadVendida : 0;
        let cuposDisponibles = capacidadTotal - capacidadVendida;

        // Si es hoy, verificar si el horario ya paso (usando hora Perú)
        let horarioPasado = false;
        if (esHoy && hasTimePassed(horario.horaSalida)) {
          horarioPasado = true;
          cuposDisponibles = 0; // Marcar como no disponible
        }

        return {
          idHorario: horario.id,
          horaSalida: horario.horaSalida,
          capacidadTotal,
          capacidadVendida,
          cuposDisponibles,
          viajeId: viaje ? viaje.id : null,
          estado: horarioPasado ? 'CERRADO' : (viaje ? viaje.estado : 'ABIERTO'),
          horarioPasado
        };
      })
    );

    res.json({
      ruta: {
        id: ruta.id,
        origen: ruta.puntoOrigen,
        destino: ruta.puntoDestino,
        precioPasaje: ruta.precioPasaje
      },
      fecha,
      horarios: disponibilidad
    });
  } catch (error) {
    console.error('Error obteniendo disponibilidad:', error);
    res.status(500).json({ error: 'Error al obtener disponibilidad' });
  }
};

module.exports = {
  listar,
  disponibilidad
};
