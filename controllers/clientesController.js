/**
 * Clientes Controller
 * Controlador para gestion de clientes (pasajeros) con programa de fidelizacion
 * Sistema de puntos: acumulados, canjeados, disponibles
 */

const prisma = require('../config/prisma');

/**
 * Listar clientes con filtros
 * GET /api/clientes
 * Query params: search, page, limit
 */
const listar = async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Construir filtro base
    const where = {};

    // Filtro por busqueda (nombre o documento)
    if (search) {
      where.OR = [
        { nombreCompleto: { contains: search, mode: 'insensitive' } },
        { documentoIdentidad: { contains: search, mode: 'insensitive' } }
      ];
    }

    // Obtener clientes con conteo de viajes y puntos canjeados
    const [clientes, total] = await Promise.all([
      prisma.pasajero.findMany({
        where,
        include: {
          tickets: {
            where: { estado: 'EMITIDO' },
            select: {
              id: true,
              fechaVenta: true,
              puntos_usados: true,
              viaje: {
                select: {
                  fechaServicio: true
                }
              }
            },
            orderBy: { fechaVenta: 'desc' }
          }
        },
        orderBy: { puntos_historicos: 'desc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.pasajero.count({ where })
    ]);

    // Formatear respuesta con estadisticas de puntos
    const clientesFormateados = clientes.map(cliente => {
      const totalViajes = cliente.tickets.length;
      const ultimoViaje = cliente.tickets[0]?.viaje?.fechaServicio || null;

      // Calcular puntos canjeados de los tickets
      const puntosCanjeadosTickets = cliente.tickets.reduce(
        (sum, ticket) => sum + (ticket.puntos_usados || 0), 0
      );

      // Usar campos de BD (snake_case), con fallback al campo antiguo
      const puntosDisponibles = cliente.puntos_disponibles ?? cliente.puntos ?? 0;
      const puntosAcumulados = cliente.puntos_historicos ?? cliente.puntos ?? 0;

      return {
        id: cliente.id,
        nombreCompleto: cliente.nombreCompleto,
        documentoIdentidad: cliente.documentoIdentidad,
        telefono: cliente.telefono,
        email: cliente.email || null,
        puntosAcumulados,
        puntosCanjeados: puntosCanjeadosTickets,
        puntosDisponibles,
        totalViajes,
        ultimoViaje,
        dateTimeRegistration: cliente.dateTimeRegistration
      };
    });

    res.json({
      clientes: clientesFormateados,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error listando clientes:', error);
    res.status(500).json({ error: 'Error al listar clientes' });
  }
};

/**
 * Obtener detalle de un cliente
 * GET /api/clientes/:id
 */
const obtener = async (req, res) => {
  try {
    const { id } = req.params;

    const cliente = await prisma.pasajero.findUnique({
      where: { id: parseInt(id) },
      include: {
        tickets: {
          where: { estado: 'EMITIDO' },
          include: {
            viaje: {
              include: {
                ruta: {
                  include: {
                    puntoOrigen: { select: { id: true, nombre: true } },
                    puntoDestino: { select: { id: true, nombre: true } }
                  }
                },
                horario: true
              }
            }
          },
          orderBy: { fechaVenta: 'desc' },
          take: 10
        },
        tbl_encomiendas: {
          include: {
            puntoOrigen: { select: { id: true, nombre: true } },
            puntoDestino: { select: { id: true, nombre: true } }
          },
          orderBy: { dateTimeRegistration: 'desc' },
          take: 10
        }
      }
    });

    if (!cliente) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    // Formatear tickets como movimientos
    const movimientosTickets = cliente.tickets.map(ticket => ({
      id: ticket.id,
      tipo: 'PASAJE',
      codigo: ticket.codigoInterno,
      fecha: ticket.viaje.fechaServicio,
      hora: ticket.viaje.horario.horaSalida,
      origen: ticket.viaje.ruta.puntoOrigen.nombre,
      destino: ticket.viaje.ruta.puntoDestino.nombre,
      fechaRegistro: ticket.fechaVenta,
      puntosUsados: ticket.puntos_usados || 0,
      puntosGanados: ticket.puntos_ganados || 0,
      monto: parseFloat(ticket.precio_final ?? ticket.precio_original ?? 0)
    }));

    // Formatear encomiendas como movimientos
    const movimientosEncomiendas = cliente.tbl_encomiendas.map(enc => ({
      id: enc.id,
      tipo: 'ENCOMIENDA',
      codigo: enc.codigoTracking,
      fecha: enc.dateTimeRegistration,
      hora: null,
      origen: enc.puntoOrigen?.nombre || 'N/A',
      destino: enc.puntoDestino?.nombre || 'N/A',
      fechaRegistro: enc.dateTimeRegistration,
      puntosUsados: enc.puntos_usados || 0,
      puntosGanados: enc.puntos_ganados || 0,
      monto: parseFloat(enc.precio_final ?? enc.precioCalculado ?? 0)
    }));

    // Combinar y ordenar por fecha descendente
    const movimientos = [...movimientosTickets, ...movimientosEncomiendas]
      .sort((a, b) => new Date(b.fechaRegistro) - new Date(a.fechaRegistro))
      .slice(0, 15);

    // Calcular puntos canjeados (tickets + encomiendas)
    const puntosCanjeadosTickets = cliente.tickets.reduce(
      (sum, t) => sum + (t.puntos_usados || 0), 0
    );
    const puntosCanjeadosEncomiendas = cliente.tbl_encomiendas.reduce(
      (sum, e) => sum + (e.puntos_usados || 0), 0
    );
    const puntosCanjeados = puntosCanjeadosTickets + puntosCanjeadosEncomiendas;

    // Usar campos de BD (snake_case), con fallback al campo antiguo
    const puntosDisponibles = cliente.puntos_disponibles ?? cliente.puntos ?? 0;
    const puntosAcumulados = cliente.puntos_historicos ?? cliente.puntos ?? 0;

    res.json({
      cliente: {
        id: cliente.id,
        nombreCompleto: cliente.nombreCompleto,
        documentoIdentidad: cliente.documentoIdentidad,
        telefono: cliente.telefono,
        email: cliente.email || null,
        puntosAcumulados,
        puntosCanjeados,
        puntosDisponibles,
        totalViajes: cliente.tickets.length,
        totalEncomiendas: cliente.tbl_encomiendas.length,
        ultimoMovimiento: movimientos[0]?.fechaRegistro || null,
        movimientos,
        dateTimeRegistration: cliente.dateTimeRegistration
      }
    });
  } catch (error) {
    console.error('Error obteniendo cliente:', error);
    res.status(500).json({ error: 'Error al obtener cliente' });
  }
};

/**
 * Obtener cliente por DNI
 * GET /api/clientes/dni/:dni
 */
const obtenerPorDni = async (req, res) => {
  try {
    const { dni } = req.params;

    if (!dni || dni.length !== 8) {
      return res.status(400).json({ error: 'DNI invalido. Debe tener 8 digitos.' });
    }

    const cliente = await prisma.pasajero.findFirst({
      where: { documentoIdentidad: dni },
      include: {
        tickets: {
          where: { estado: 'EMITIDO' },
          select: {
            id: true,
            puntos_usados: true
          },
          take: 100
        }
      }
    });

    if (!cliente) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    // Calcular puntos canjeados
    const puntosCanjeados = cliente.tickets.reduce(
      (sum, ticket) => sum + (ticket.puntos_usados || 0), 0
    );

    // Usar campos de BD (snake_case), con fallback al campo antiguo
    const puntosDisponibles = cliente.puntos_disponibles ?? cliente.puntos ?? 0;
    const puntosAcumulados = cliente.puntos_historicos ?? cliente.puntos ?? 0;

    res.json({
      cliente: {
        id: cliente.id,
        nombreCompleto: cliente.nombreCompleto,
        documentoIdentidad: cliente.documentoIdentidad,
        telefono: cliente.telefono,
        email: cliente.email || null,
        puntosAcumulados,
        puntosCanjeados,
        puntosDisponibles,
        totalViajes: cliente.tickets.length
      }
    });
  } catch (error) {
    console.error('Error obteniendo cliente por DNI:', error);
    res.status(500).json({ error: 'Error al obtener cliente' });
  }
};

/**
 * Estadisticas globales de clientes
 * GET /api/clientes/stats
 */
const stats = async (req, res) => {
  try {
    // Total de clientes
    const totalClientes = await prisma.pasajero.count();

    // Suma de puntos acumulados (historicos) - usar campo snake_case
    const sumaPuntosAcumulados = await prisma.pasajero.aggregate({
      _sum: { puntos_historicos: true }
    });
    const puntosAcumulados = sumaPuntosAcumulados._sum.puntos_historicos ?? 0;

    // Suma de puntos disponibles - usar campo snake_case
    const sumaPuntosDisponibles = await prisma.pasajero.aggregate({
      _sum: { puntos_disponibles: true }
    });
    const puntosDisponibles = sumaPuntosDisponibles._sum.puntos_disponibles ?? 0;

    // Suma de puntos canjeados (de tickets + encomiendas)
    const [puntosCanjeadosTickets, puntosCanjeadosEncomiendas] = await Promise.all([
      prisma.ticket.aggregate({
        _sum: { puntos_usados: true }
      }),
      prisma.encomienda.aggregate({
        _sum: { puntos_usados: true }
      })
    ]);

    const puntosCanjeados = (puntosCanjeadosTickets._sum.puntos_usados ?? 0) +
                           (puntosCanjeadosEncomiendas._sum.puntos_usados ?? 0);

    res.json({
      totalClientes,
      puntosAcumulados,
      puntosCanjeados,
      puntosDisponibles
    });
  } catch (error) {
    console.error('Error obteniendo estadisticas:', error);
    res.status(500).json({ error: 'Error al obtener estadisticas' });
  }
};

module.exports = {
  listar,
  obtener,
  obtenerPorDni,
  stats
};
