/**
 * Tickets Controller
 * Controlador para venta y gestion de tickets/pasajes
 */

const prisma = require('../config/prisma');
const { registrarAuditoria } = require('../services/auditoriaService');
const { generarCodigoTicket } = require('../services/codigoService');
const facturacionService = require('../services/facturacionService');
const {
  utcNow,
  parseCivilDate,
  extractTimeFromDB,
  hasTimePassed,
  isToday,
  isBeforeToday,
  createTimeForDB,
  getFechaPeruYYYYMMDD
} = require('../utils/dateUtils');

/**
 * Obtener configuracion de puntos desde la BD
 * @returns {Object} { solesPorPunto, puntosPorSolDescuento }
 */
const obtenerConfiguracionPuntos = async () => {
  try {
    const result = await prisma.$queryRaw`
      SELECT
        soles_por_punto as "solesPorPunto",
        puntos_por_sol_descuento as "puntosPorSolDescuento"
      FROM tbl_configuracion_sistema
      WHERE activo = true
      LIMIT 1
    `;
    if (result && result.length > 0) {
      return {
        solesPorPunto: parseFloat(result[0].solesPorPunto) || 10.00,
        puntosPorSolDescuento: parseFloat(result[0].puntosPorSolDescuento) || 10.00
      };
    }
  } catch (error) {
    console.error('Error obteniendo configuracion de puntos:', error);
  }
  // Valores por defecto
  return { solesPorPunto: 10.00, puntosPorSolDescuento: 10.00 };
};

/**
 * Listar tickets
 * GET /api/tickets
 * Query params: fecha, estado, codigoInterno
 */
const listar = async (req, res) => {
  try {
    const { fecha, estado, codigoInterno, page = 1, limit = 20 } = req.query;

    const where = {};
    const skip = (parseInt(page) - 1) * parseInt(limit);

    if (fecha) {
      // Parsear fecha civil y crear rango UTC para el día completo
      const { date: fechaParsed, error } = parseCivilDate(fecha, 'fecha');
      if (error) {
        return res.status(400).json({ error });
      }
      if (fechaParsed) {
        // Crear rango del día en UTC
        const fechaInicio = new Date(Date.UTC(
          fechaParsed.getUTCFullYear(),
          fechaParsed.getUTCMonth(),
          fechaParsed.getUTCDate(),
          0, 0, 0, 0
        ));
        const fechaFin = new Date(Date.UTC(
          fechaParsed.getUTCFullYear(),
          fechaParsed.getUTCMonth(),
          fechaParsed.getUTCDate(),
          23, 59, 59, 999
        ));

        where.fechaVenta = {
          gte: fechaInicio,
          lte: fechaFin
        };
      }
    }

    if (estado) {
      where.estado = estado;
    }

    if (codigoInterno) {
      where.codigoInterno = {
        contains: codigoInterno,
        mode: 'insensitive'
      };
    }

    // Si el usuario tiene punto asignado, filtrar por ese punto
    if (req.user.id_punto) {
      where.viaje = {
        ruta: {
          OR: [
            { idPuntoOrigen: req.user.id_punto },
            { idPuntoDestino: req.user.id_punto }
          ]
        }
      };
    }

    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
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
          },
          pasajero: true,
          usuarioVenta: { select: { id: true, nombres: true } }
        },
        orderBy: { fechaVenta: 'desc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.ticket.count({ where })
    ]);

    res.json({
      tickets,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error listando tickets:', error);
    res.status(500).json({ error: 'Error al listar tickets' });
  }
};

/**
 * Vender pasaje
 * POST /api/tickets
 */
const vender = async (req, res) => {
  try {
    const {
      idRuta,
      idHorario,
      fechaViaje,
      pasajero,
      metodoPago,
      puntosACanjear = 0,
      tipoDocumento,
      clienteFactura,
      precioManual
    } = req.body;

    // Validaciones
    if (!idRuta || !idHorario || !fechaViaje || !pasajero || !metodoPago) {
      return res.status(400).json({
        error: 'Todos los campos son requeridos'
      });
    }

    // Validar tipo de documento (obligatorio)
    if (!tipoDocumento || !['BOLETA', 'FACTURA', 'VERIFICACION'].includes(tipoDocumento)) {
      return res.status(400).json({
        error: 'Tipo de documento es obligatorio (BOLETA, FACTURA o VERIFICACION)'
      });
    }

    // Validar datos de factura si el tipo es FACTURA
    if (tipoDocumento === 'FACTURA') {
      if (!clienteFactura || !clienteFactura.ruc || !clienteFactura.razonSocial) {
        return res.status(400).json({
          error: 'Para factura se requiere RUC y razon social del cliente'
        });
      }
      if (clienteFactura.ruc.length !== 11) {
        return res.status(400).json({
          error: 'El RUC debe tener 11 digitos'
        });
      }
    }

    if (!pasajero.nombreCompleto || !pasajero.documentoIdentidad || !pasajero.telefono) {
      return res.status(400).json({
        error: 'Nombre, documento y telefono del pasajero son requeridos'
      });
    }

    // Validar tipo de documento del pasajero segun longitud
    const tipoDocPasajero = pasajero.tipoDocumento || (pasajero.documentoIdentidad?.length === 11 ? '6' : '1');
    if (tipoDocPasajero === '1' && pasajero.documentoIdentidad?.length !== 8) {
      return res.status(400).json({
        error: 'El DNI debe tener 8 digitos'
      });
    }
    if (tipoDocPasajero === '6' && pasajero.documentoIdentidad?.length !== 11) {
      return res.status(400).json({
        error: 'El RUC debe tener 11 digitos'
      });
    }

    if (!['EFECTIVO', 'YAPE', 'TARJETA'].includes(metodoPago)) {
      return res.status(400).json({
        error: 'Metodo de pago invalido'
      });
    }

    // Parsear fecha civil usando utilidad centralizada
    const { date: fechaDate, error: fechaError } = parseCivilDate(fechaViaje, 'fechaViaje');
    if (fechaError) {
      return res.status(400).json({ error: fechaError });
    }

    // Validar que no sea fecha pasada (usando hora Perú)
    if (isBeforeToday(fechaViaje)) {
      return res.status(400).json({
        error: 'La fecha del viaje no puede ser anterior a hoy'
      });
    }

    // Verificar ruta activa
    const ruta = await prisma.ruta.findUnique({
      where: { id: parseInt(idRuta) }
    });

    if (!ruta || ruta.estado !== 1) {
      return res.status(400).json({
        error: 'Ruta no habilitada'
      });
    }

    // Verificar horario habilitado (incluir capacidadTotal para crear viaje)
    const horario = await prisma.horarioRuta.findUnique({
      where: { id: parseInt(idHorario) },
      select: {
        id: true,
        horaSalida: true,
        capacidadTotal: true,
        habilitado: true
      }
    });

    if (!horario || !horario.habilitado) {
      return res.status(400).json({
        error: 'Horario no disponible'
      });
    }

    // Verificar que el horario no haya pasado si es para hoy (usando hora Perú)
    if (isToday(fechaViaje)) {
      if (hasTimePassed(horario.horaSalida)) {
        return res.status(400).json({
          error: 'El horario seleccionado ya no esta disponible para hoy'
        });
      }
    }

    // Obtener configuracion de puntos
    const { solesPorPunto, puntosPorSolDescuento } = await obtenerConfiguracionPuntos();

    // Precio original del pasaje
    const precioOriginal = parseFloat(ruta.precioPasaje);

    // Calcular puntos ganados por esta compra
    const puntosGanados = Math.floor(precioOriginal / solesPorPunto);

    // Convertir puntosACanjear a numero y validar
    const puntosUsados = Math.max(0, parseInt(puntosACanjear) || 0);

    // Transaccion para la venta
    const resultado = await prisma.$transaction(async (tx) => {
      // Buscar o crear viaje
      let viaje = await tx.viaje.findUnique({
        where: {
          idRuta_idHorario_fechaServicio: {
            idRuta: parseInt(idRuta),
            idHorario: parseInt(idHorario),
            fechaServicio: fechaDate
          }
        }
      });

      if (!viaje) {
        // Crear viaje on-demand (usar capacidad del horario, no de la ruta)
        viaje = await tx.viaje.create({
          data: {
            idRuta: parseInt(idRuta),
            idHorario: parseInt(idHorario),
            fechaServicio: fechaDate,
            capacidadTotal: horario.capacidadTotal,
            capacidadVendida: 0,
            estado: 'ABIERTO',
            userIdRegistration: req.user.id
          }
        });
      }

      // Verificar disponibilidad
      const cuposDisponibles = viaje.capacidadTotal - viaje.capacidadVendida;
      if (cuposDisponibles <= 0) {
        throw new Error('Aforo completo para este viaje');
      }

      if (viaje.estado !== 'ABIERTO') {
        throw new Error('El viaje no esta abierto para venta');
      }

      // Buscar o crear pasajero
      let pasajeroDb = await tx.pasajero.findFirst({
        where: { documentoIdentidad: pasajero.documentoIdentidad }
      });

      // Obtener puntos disponibles actuales del cliente
      let puntosDisponiblesActuales = 0;
      let puntosHistoricosActuales = 0;

      if (pasajeroDb) {
        puntosDisponiblesActuales = pasajeroDb.puntos_disponibles ?? pasajeroDb.puntos ?? 0;
        puntosHistoricosActuales = pasajeroDb.puntos_historicos ?? pasajeroDb.puntos ?? 0;
      }

      // Validar que no se intenten canjear mas puntos de los disponibles
      const puntosACanjearFinal = Math.min(puntosUsados, puntosDisponiblesActuales);

      // Calcular descuento por puntos
      let descuentoPuntos = puntosACanjearFinal / puntosPorSolDescuento;
      // El descuento no puede superar el precio original
      descuentoPuntos = Math.min(descuentoPuntos, precioOriginal);
      // Redondear a 2 decimales
      descuentoPuntos = Math.round(descuentoPuntos * 100) / 100;

      // Calcular precio final (usar precioManual si fue editado manualmente)
      const precioFinal = precioManual != null && !isNaN(parseFloat(precioManual))
        ? Math.max(0, Math.round(parseFloat(precioManual) * 100) / 100)
        : Math.max(0, precioOriginal - descuentoPuntos);

      // Calcular nuevos puntos del cliente
      const nuevosPuntosDisponibles = puntosDisponiblesActuales - puntosACanjearFinal + puntosGanados;
      const nuevosPuntosHistoricos = puntosHistoricosActuales + puntosGanados;

      if (!pasajeroDb) {
        // Crear nuevo pasajero con puntos iniciales
        pasajeroDb = await tx.pasajero.create({
          data: {
            nombreCompleto: pasajero.nombreCompleto,
            documentoIdentidad: pasajero.documentoIdentidad,
            tipo_documento: tipoDocPasajero,
            telefono: pasajero.telefono,
            puntos_disponibles: puntosGanados,
            puntos_historicos: puntosGanados,
            userIdRegistration: req.user.id
          }
        });
      } else {
        // Actualizar datos del pasajero y puntos
        pasajeroDb = await tx.pasajero.update({
          where: { id: pasajeroDb.id },
          data: {
            nombreCompleto: pasajero.nombreCompleto,
            telefono: pasajero.telefono,
            puntos_disponibles: nuevosPuntosDisponibles,
            puntos_historicos: nuevosPuntosHistoricos,
            userIdModification: req.user.id,
            dateTimeModification: utcNow()
          }
        });
      }

      // Generar codigo unico
      const codigoInterno = await generarCodigoTicket(tx);

      // Crear ticket con todos los campos de puntos
      const ticket = await tx.ticket.create({
        data: {
          idViaje: viaje.id,
          idPasajero: pasajeroDb.id,
          codigoInterno,
          idUsuarioVenta: req.user.id,
          metodoPago,
          estado: 'EMITIDO',
          userIdRegistration: req.user.id,
          // Campos de puntos y precios
          precio_original: precioOriginal,
          puntos_usados: puntosACanjearFinal,
          descuento_puntos: descuentoPuntos,
          precio_final: precioFinal,
          puntos_ganados: puntosGanados,
          comentario: pasajero.comentario || null
        },
        include: {
          viaje: {
            include: {
              ruta: {
                include: {
                  puntoOrigen: true,
                  puntoDestino: true
                }
              },
              horario: true
            }
          },
          pasajero: true
        }
      });

      // Incrementar capacidad vendida
      await tx.viaje.update({
        where: { id: viaje.id },
        data: { capacidadVendida: viaje.capacidadVendida + 1 }
      });

      // Agregar campos calculados al resultado
      return {
        ...ticket,
        precioOriginal,
        puntosUsados: puntosACanjearFinal,
        descuentoPuntos,
        precioFinal,
        puntosGanados,
        // Incluir puntos acumulados del cliente (después de esta compra)
        puntosAcumuladosCliente: nuevosPuntosHistoricos,
        puntosDisponiblesCliente: nuevosPuntosDisponibles
      };
    });

    // Auditoria
    await registrarAuditoria(req.user.id, 'TICKET_VENDIDO', 'TICKET', resultado.id, {
      codigoInterno: resultado.codigoInterno,
      pasajero: resultado.pasajero.nombreCompleto,
      metodoPago,
      tipoDocumento,
      precioOriginal: resultado.precioOriginal,
      puntosUsados: resultado.puntosUsados,
      descuentoPuntos: resultado.descuentoPuntos,
      precioFinal: resultado.precioFinal,
      puntosGanados: resultado.puntosGanados
    });

    // Emitir comprobante segun tipo de documento
    let comprobante = null;
    try {
      const precioParaComprobante = resultado.precioFinal ?? resultado.precioOriginal;

      if (tipoDocumento === 'BOLETA') {
        comprobante = await facturacionService.emitirComprobante({
          tipoComprobante: '03',
          serie: 'BT74',
          cliente: {
            tipoDoc: tipoDocPasajero,
            numDoc: resultado.pasajero.documentoIdentidad,
            razonSocial: resultado.pasajero.nombreCompleto,
            direccion: ''
          },
          items: [{
            codigo: `PAS-${resultado.codigoInterno}`,
            descripcion: `Pasaje ${resultado.viaje.ruta.puntoOrigen.nombre} - ${resultado.viaje.ruta.puntoDestino.nombre}`,
            unidadMedida: 'ZZ',
            cantidad: 1,
            precioUnitario: precioParaComprobante
          }],
          origenTipo: 'TICKET',
          origenId: resultado.id,
          userId: req.user.id,
          comentario: pasajero.comentario || null
        });

        await prisma.$executeRaw`
          UPDATE tbl_tickets SET id_comprobante = ${comprobante.id}, invoice_status = 'EMITIDO' WHERE id = ${resultado.id}
        `;

      } else if (tipoDocumento === 'FACTURA') {
        comprobante = await facturacionService.emitirComprobante({
          tipoComprobante: '01',
          serie: 'FT74',
          cliente: {
            tipoDoc: '6',
            numDoc: clienteFactura.ruc,
            razonSocial: clienteFactura.razonSocial,
            direccion: clienteFactura.direccion || ''
          },
          items: [{
            codigo: `PAS-${resultado.codigoInterno}`,
            descripcion: `Pasaje ${resultado.viaje.ruta.puntoOrigen.nombre} - ${resultado.viaje.ruta.puntoDestino.nombre}`,
            unidadMedida: 'ZZ',
            cantidad: 1,
            precioUnitario: precioParaComprobante
          }],
          origenTipo: 'TICKET',
          origenId: resultado.id,
          userId: req.user.id,
          comentario: pasajero.comentario || null
        });

        await prisma.$executeRaw`
          UPDATE tbl_tickets SET id_comprobante = ${comprobante.id}, invoice_status = 'EMITIDO' WHERE id = ${resultado.id}
        `;

      } else if (tipoDocumento === 'VERIFICACION') {
        // Obtener siguiente numero para nota de venta
        const numeroResult = await prisma.$queryRaw`
          UPDATE tbl_series_factura
          SET numero_actual = numero_actual + 1
          WHERE tipo_comprobante = 'NV' AND serie = 'NV01'
          RETURNING numero_actual
        `;

        if (!numeroResult || numeroResult.length === 0) {
          throw new Error('Serie NV01 no encontrada');
        }

        const numero = numeroResult[0].numero_actual;

        // Crear nota de venta con comentario
        const notaResult = await prisma.$queryRaw`
          INSERT INTO tbl_notas_venta (
            serie, numero, cliente_nombre, cliente_documento,
            descripcion, total, origen_tipo, origen_id,
            user_id_registration, comentario
          ) VALUES (
            'NV01', ${numero},
            ${resultado.pasajero.nombreCompleto},
            ${resultado.pasajero.documentoIdentidad},
            ${'Pasaje ' + resultado.viaje.ruta.puntoOrigen.nombre + ' - ' + resultado.viaje.ruta.puntoDestino.nombre},
            ${precioParaComprobante},
            'TICKET', ${resultado.id},
            ${req.user.id},
            ${pasajero.comentario || null}
          )
          RETURNING id, numero_completo
        `;

        // Vincular nota de venta al ticket
        await prisma.$executeRaw`
          UPDATE tbl_tickets SET id_nota_venta = ${notaResult[0].id} WHERE id = ${resultado.id}
        `;

        comprobante = {
          id: notaResult[0].id,
          tipo: 'VERIFICACION',
          numeroCompleto: notaResult[0].numero_completo,
          total: precioParaComprobante,
          comentario: pasajero.comentario || null
        };
      }
    } catch (errorComprobante) {
      console.error('Error emitiendo comprobante:', errorComprobante);
      // El ticket ya se creo, reportar error de comprobante sin bloquear
      return res.status(201).json({
        mensaje: 'Pasaje vendido exitosamente, pero hubo un error al generar el comprobante',
        ticket: resultado,
        comprobanteError: errorComprobante.message
      });
    }

    // Obtener datos de la agencia (punto del vendedor o punto de origen de la ruta)
    let agencia = null;
    const idPuntoAgencia = req.user.id_punto || resultado.viaje?.ruta?.idPuntoOrigen;
    if (idPuntoAgencia) {
      const puntoResult = await prisma.$queryRaw`
        SELECT nombre, ciudad, direccion FROM tbl_puntos WHERE id = ${idPuntoAgencia} AND estado = 1
      `;
      if (puntoResult && puntoResult.length > 0) {
        agencia = puntoResult[0];
      }
    }

    // Normalizar respuesta del comprobante para todos los tipos
    if (comprobante) {
      comprobante.tipoDocumento = tipoDocumento;
      comprobante.agencia = agencia;
      // Normalizar campo numeroCompleto para BOLETA y FACTURA
      if (!comprobante.numeroCompleto && comprobante.numero_completo) {
        comprobante.numeroCompleto = comprobante.numero_completo;
      }
      if (!comprobante.total) {
        comprobante.total = comprobante.total_venta || resultado.precioFinal || resultado.precioOriginal;
      }
    }

    res.status(201).json({
      mensaje: 'Pasaje vendido exitosamente',
      ticket: { ...resultado, agencia },
      comprobante
    });
  } catch (error) {
    console.error('Error vendiendo pasaje:', error);

    if (error.message === 'Aforo completo para este viaje') {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: 'Error al vender pasaje' });
  }
};

/**
 * Obtener ticket por ID
 * GET /api/tickets/:id
 */
const obtener = async (req, res) => {
  try {
    const { id } = req.params;

    const ticket = await prisma.ticket.findUnique({
      where: { id: parseInt(id) },
      include: {
        viaje: {
          include: {
            ruta: {
              include: {
                puntoOrigen: true,
                puntoDestino: true
              }
            },
            horario: true
          }
        },
        pasajero: true,
        usuarioVenta: {
          select: { id: true, nombres: true }
        }
      }
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket no encontrado' });
    }

    res.json({ ticket });
  } catch (error) {
    console.error('Error obteniendo ticket:', error);
    res.status(500).json({ error: 'Error al obtener ticket' });
  }
};

/**
 * Obtener ticket por codigo interno
 * GET /api/tickets/codigo/:codigo
 */
const obtenerPorCodigo = async (req, res) => {
  try {
    const { codigo } = req.params;

    const ticket = await prisma.ticket.findUnique({
      where: { codigoInterno: codigo },
      include: {
        viaje: {
          include: {
            ruta: {
              include: {
                puntoOrigen: true,
                puntoDestino: true
              }
            },
            horario: true
          }
        },
        pasajero: true
      }
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket no encontrado' });
    }

    res.json({ ticket });
  } catch (error) {
    console.error('Error obteniendo ticket:', error);
    res.status(500).json({ error: 'Error al obtener ticket' });
  }
};

/**
 * Anular ticket
 * POST /api/tickets/:id/anular
 */
const anular = async (req, res) => {
  try {
    const { id } = req.params;
    const { motivo } = req.body;

    const ticketExistente = await prisma.ticket.findUnique({
      where: { id: parseInt(id) },
      include: { viaje: true }
    });

    if (!ticketExistente) {
      return res.status(404).json({ error: 'Ticket no encontrado' });
    }

    if (ticketExistente.estado !== 'EMITIDO') {
      return res.status(400).json({ error: 'Solo se pueden anular tickets emitidos' });
    }

    // Transaccion para anular
    const resultado = await prisma.$transaction(async (tx) => {
      // Anular ticket
      const ticket = await tx.ticket.update({
        where: { id: parseInt(id) },
        data: {
          estado: 'ANULADO',
          fechaAnulacion: utcNow(),
          idUsuarioAnulacion: req.user.id,
          motivoAnulacion: motivo || 'Sin motivo especificado',
          userIdModification: req.user.id,
          dateTimeModification: utcNow()
        }
      });

      // Liberar cupo
      await tx.viaje.update({
        where: { id: ticketExistente.idViaje },
        data: {
          capacidadVendida: Math.max(0, ticketExistente.viaje.capacidadVendida - 1)
        }
      });

      return ticket;
    });

    // Auditoria
    await registrarAuditoria(req.user.id, 'TICKET_ANULADO', 'TICKET', resultado.id, {
      codigoInterno: resultado.codigoInterno,
      motivo: motivo || 'Sin motivo especificado'
    });

    res.json({
      mensaje: 'Ticket anulado exitosamente',
      ticket: resultado
    });
  } catch (error) {
    console.error('Error anulando ticket:', error);
    res.status(500).json({ error: 'Error al anular ticket' });
  }
};

/**
 * Vista imprimible
 * GET /api/tickets/:id/imprimir
 */
const imprimir = async (req, res) => {
  try {
    const { id } = req.params;

    const ticket = await prisma.ticket.findUnique({
      where: { id: parseInt(id) },
      include: {
        viaje: {
          include: {
            ruta: {
              include: {
                puntoOrigen: true,
                puntoDestino: true
              }
            },
            horario: true
          }
        },
        pasajero: true
      }
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket no encontrado' });
    }

    // Auditoria de reimpresion
    await registrarAuditoria(req.user.id, 'TICKET_REIMPRESO', 'TICKET', ticket.id, {
      codigoInterno: ticket.codigoInterno
    });

    // Retornar datos formateados para impresion
    res.json({
      ticket: {
        codigo: ticket.codigoInterno,
        estado: ticket.estado,
        fechaVenta: ticket.fechaVenta,
        pasajero: {
          nombre: ticket.pasajero.nombreCompleto,
          documento: ticket.pasajero.documentoIdentidad,
          telefono: ticket.pasajero.telefono
        },
        viaje: {
          fecha: ticket.viaje.fechaServicio,
          hora: ticket.viaje.horario.horaSalida,
          origen: ticket.viaje.ruta.puntoOrigen.nombre,
          destino: ticket.viaje.ruta.puntoDestino.nombre,
          precio: ticket.viaje.ruta.precioPasaje
        }
      }
    });
  } catch (error) {
    console.error('Error generando vista imprimible:', error);
    res.status(500).json({ error: 'Error al generar vista imprimible' });
  }
};

/**
 * Venta Instantanea - Sin horario predefinido
 * POST /api/tickets/instantanea
 *
 * La venta se registra con la hora actual del momento de la venta.
 * Se crea automaticamente un horario "INSTANTANEO" por ruta si no existe.
 */
const venderInstantaneo = async (req, res) => {
  try {
    const {
      idRuta,
      pasajero,
      metodoPago,
      puntosACanjear = 0,
      tipoDocumento,
      clienteFactura,
      precioManual
    } = req.body;

    // Validaciones basicas
    if (!idRuta || !pasajero || !metodoPago) {
      return res.status(400).json({
        error: 'Ruta, pasajero y metodo de pago son requeridos'
      });
    }

    // Validar tipo de documento (obligatorio)
    if (!tipoDocumento || !['BOLETA', 'FACTURA', 'VERIFICACION'].includes(tipoDocumento)) {
      return res.status(400).json({
        error: 'Tipo de documento es obligatorio (BOLETA, FACTURA o VERIFICACION)'
      });
    }

    // Validar datos de factura si el tipo es FACTURA
    if (tipoDocumento === 'FACTURA') {
      if (!clienteFactura || !clienteFactura.ruc || !clienteFactura.razonSocial) {
        return res.status(400).json({
          error: 'Para factura se requiere RUC y razon social del cliente'
        });
      }
      if (clienteFactura.ruc.length !== 11) {
        return res.status(400).json({
          error: 'El RUC debe tener 11 digitos'
        });
      }
    }

    if (!pasajero.nombreCompleto || !pasajero.documentoIdentidad || !pasajero.telefono) {
      return res.status(400).json({
        error: 'Nombre, documento y telefono del pasajero son requeridos'
      });
    }

    // Validar tipo de documento del pasajero segun longitud
    const tipoDocPasajero = pasajero.tipoDocumento || (pasajero.documentoIdentidad?.length === 11 ? '6' : '1');
    if (tipoDocPasajero === '1' && pasajero.documentoIdentidad?.length !== 8) {
      return res.status(400).json({
        error: 'El DNI debe tener 8 digitos'
      });
    }
    if (tipoDocPasajero === '6' && pasajero.documentoIdentidad?.length !== 11) {
      return res.status(400).json({
        error: 'El RUC debe tener 11 digitos'
      });
    }

    if (!['EFECTIVO', 'YAPE', 'TARJETA'].includes(metodoPago)) {
      return res.status(400).json({
        error: 'Metodo de pago invalido'
      });
    }

    // Verificar ruta activa
    const ruta = await prisma.ruta.findUnique({
      where: { id: parseInt(idRuta) }
    });

    if (!ruta || ruta.estado !== 1) {
      return res.status(400).json({
        error: 'Ruta no habilitada'
      });
    }

    // Obtener fecha de hoy en Peru (formato YYYY-MM-DD)
    const fechaHoyStr = getFechaPeruYYYYMMDD();
    const fechaHoy = `${fechaHoyStr.slice(0, 4)}-${fechaHoyStr.slice(4, 6)}-${fechaHoyStr.slice(6, 8)}`;
    const { date: fechaDate } = parseCivilDate(fechaHoy, 'fechaViaje');

    // Obtener configuracion de puntos
    const { solesPorPunto, puntosPorSolDescuento } = await obtenerConfiguracionPuntos();

    // Precio original del pasaje
    const precioOriginal = parseFloat(ruta.precioPasaje);

    // Calcular puntos ganados por esta compra
    const puntosGanados = Math.floor(precioOriginal / solesPorPunto);

    // Convertir puntosACanjear a numero y validar
    const puntosUsados = Math.max(0, parseInt(puntosACanjear) || 0);

    // Transaccion para la venta instantanea
    const resultado = await prisma.$transaction(async (tx) => {
      // 1. Buscar o crear horario "INSTANTANEO" para esta ruta
      let horarioInstantaneo = await tx.horarioRuta.findFirst({
        where: {
          idRuta: parseInt(idRuta),
          horaSalida: createTimeForDB(0, 0, 0) // 00:00:00
        }
      });

      if (!horarioInstantaneo) {
        // Crear horario instantaneo para la ruta
        horarioInstantaneo = await tx.horarioRuta.create({
          data: {
            idRuta: parseInt(idRuta),
            horaSalida: createTimeForDB(0, 0, 0), // 00:00:00 representa "instantaneo"
            capacidadTotal: 9999, // Capacidad alta para no limitar
            habilitado: true,
            userIdRegistration: req.user.id
          }
        });
      }

      // 2. Buscar o crear viaje de hoy con el horario instantaneo
      let viaje = await tx.viaje.findUnique({
        where: {
          idRuta_idHorario_fechaServicio: {
            idRuta: parseInt(idRuta),
            idHorario: horarioInstantaneo.id,
            fechaServicio: fechaDate
          }
        }
      });

      if (!viaje) {
        viaje = await tx.viaje.create({
          data: {
            idRuta: parseInt(idRuta),
            idHorario: horarioInstantaneo.id,
            fechaServicio: fechaDate,
            capacidadTotal: horarioInstantaneo.capacidadTotal,
            capacidadVendida: 0,
            estado: 'ABIERTO',
            userIdRegistration: req.user.id
          }
        });
      }

      // 3. Verificar disponibilidad (aunque con 9999 casi nunca se llenara)
      const cuposDisponibles = viaje.capacidadTotal - viaje.capacidadVendida;
      if (cuposDisponibles <= 0) {
        throw new Error('Aforo completo para ventas instantaneas de hoy');
      }

      if (viaje.estado !== 'ABIERTO') {
        throw new Error('El viaje no esta abierto para venta');
      }

      // 4. Buscar o crear pasajero
      let pasajeroDb = await tx.pasajero.findFirst({
        where: { documentoIdentidad: pasajero.documentoIdentidad }
      });

      // Obtener puntos disponibles actuales del cliente
      let puntosDisponiblesActuales = 0;
      let puntosHistoricosActuales = 0;

      if (pasajeroDb) {
        puntosDisponiblesActuales = pasajeroDb.puntos_disponibles ?? pasajeroDb.puntos ?? 0;
        puntosHistoricosActuales = pasajeroDb.puntos_historicos ?? pasajeroDb.puntos ?? 0;
      }

      // Validar que no se intenten canjear mas puntos de los disponibles
      const puntosACanjearFinal = Math.min(puntosUsados, puntosDisponiblesActuales);

      // Calcular descuento por puntos
      let descuentoPuntos = puntosACanjearFinal / puntosPorSolDescuento;
      descuentoPuntos = Math.min(descuentoPuntos, precioOriginal);
      descuentoPuntos = Math.round(descuentoPuntos * 100) / 100;

      // Calcular precio final (usar precioManual si fue editado manualmente)
      const precioFinal = precioManual != null && !isNaN(parseFloat(precioManual))
        ? Math.max(0, Math.round(parseFloat(precioManual) * 100) / 100)
        : Math.max(0, precioOriginal - descuentoPuntos);

      // Calcular nuevos puntos del cliente
      const nuevosPuntosDisponibles = puntosDisponiblesActuales - puntosACanjearFinal + puntosGanados;
      const nuevosPuntosHistoricos = puntosHistoricosActuales + puntosGanados;

      if (!pasajeroDb) {
        pasajeroDb = await tx.pasajero.create({
          data: {
            nombreCompleto: pasajero.nombreCompleto,
            documentoIdentidad: pasajero.documentoIdentidad,
            tipo_documento: tipoDocPasajero,
            telefono: pasajero.telefono,
            puntos_disponibles: puntosGanados,
            puntos_historicos: puntosGanados,
            userIdRegistration: req.user.id
          }
        });
      } else {
        pasajeroDb = await tx.pasajero.update({
          where: { id: pasajeroDb.id },
          data: {
            nombreCompleto: pasajero.nombreCompleto,
            telefono: pasajero.telefono,
            puntos_disponibles: nuevosPuntosDisponibles,
            puntos_historicos: nuevosPuntosHistoricos,
            userIdModification: req.user.id,
            dateTimeModification: utcNow()
          }
        });
      }

      // 5. Generar codigo unico
      const codigoInterno = await generarCodigoTicket(tx);

      // 6. Crear ticket - fechaVenta sera la hora actual automaticamente
      const ticket = await tx.ticket.create({
        data: {
          idViaje: viaje.id,
          idPasajero: pasajeroDb.id,
          codigoInterno,
          idUsuarioVenta: req.user.id,
          metodoPago,
          estado: 'EMITIDO',
          userIdRegistration: req.user.id,
          precio_original: precioOriginal,
          puntos_usados: puntosACanjearFinal,
          descuento_puntos: descuentoPuntos,
          precio_final: precioFinal,
          puntos_ganados: puntosGanados,
          comentario: pasajero.comentario || null
        },
        include: {
          viaje: {
            include: {
              ruta: {
                include: {
                  puntoOrigen: true,
                  puntoDestino: true
                }
              },
              horario: true
            }
          },
          pasajero: true
        }
      });

      // 7. Incrementar capacidad vendida
      await tx.viaje.update({
        where: { id: viaje.id },
        data: { capacidadVendida: viaje.capacidadVendida + 1 }
      });

      return {
        ...ticket,
        precioOriginal,
        puntosUsados: puntosACanjearFinal,
        descuentoPuntos,
        precioFinal,
        puntosGanados,
        puntosAcumuladosCliente: nuevosPuntosHistoricos,
        puntosDisponiblesCliente: nuevosPuntosDisponibles,
        esVentaInstantanea: true,
        horaVentaReal: ticket.fechaVenta  // Hora real de la venta instantánea
      };
    });

    // Auditoria
    await registrarAuditoria(req.user.id, 'TICKET_VENDIDO_INSTANTANEO', 'TICKET', resultado.id, {
      codigoInterno: resultado.codigoInterno,
      pasajero: resultado.pasajero.nombreCompleto,
      metodoPago,
      tipoDocumento,
      precioOriginal: resultado.precioOriginal,
      puntosUsados: resultado.puntosUsados,
      descuentoPuntos: resultado.descuentoPuntos,
      precioFinal: resultado.precioFinal,
      puntosGanados: resultado.puntosGanados
    });

    // Emitir comprobante segun tipo de documento
    let comprobante = null;
    try {
      const precioParaComprobante = resultado.precioFinal ?? resultado.precioOriginal;

      if (tipoDocumento === 'BOLETA') {
        comprobante = await facturacionService.emitirComprobante({
          tipoComprobante: '03',
          serie: 'BT74',
          cliente: {
            tipoDoc: tipoDocPasajero,
            numDoc: resultado.pasajero.documentoIdentidad,
            razonSocial: resultado.pasajero.nombreCompleto,
            direccion: ''
          },
          items: [{
            codigo: `PAS-${resultado.codigoInterno}`,
            descripcion: `Pasaje ${resultado.viaje.ruta.puntoOrigen.nombre} - ${resultado.viaje.ruta.puntoDestino.nombre}`,
            unidadMedida: 'ZZ',
            cantidad: 1,
            precioUnitario: precioParaComprobante
          }],
          origenTipo: 'TICKET',
          origenId: resultado.id,
          userId: req.user.id,
          comentario: pasajero.comentario || null
        });

        await prisma.$executeRaw`
          UPDATE tbl_tickets SET id_comprobante = ${comprobante.id}, invoice_status = 'EMITIDO' WHERE id = ${resultado.id}
        `;

      } else if (tipoDocumento === 'FACTURA') {
        comprobante = await facturacionService.emitirComprobante({
          tipoComprobante: '01',
          serie: 'FT74',
          cliente: {
            tipoDoc: '6',
            numDoc: clienteFactura.ruc,
            razonSocial: clienteFactura.razonSocial,
            direccion: clienteFactura.direccion || ''
          },
          items: [{
            codigo: `PAS-${resultado.codigoInterno}`,
            descripcion: `Pasaje ${resultado.viaje.ruta.puntoOrigen.nombre} - ${resultado.viaje.ruta.puntoDestino.nombre}`,
            unidadMedida: 'ZZ',
            cantidad: 1,
            precioUnitario: precioParaComprobante
          }],
          origenTipo: 'TICKET',
          origenId: resultado.id,
          userId: req.user.id,
          comentario: pasajero.comentario || null
        });

        await prisma.$executeRaw`
          UPDATE tbl_tickets SET id_comprobante = ${comprobante.id}, invoice_status = 'EMITIDO' WHERE id = ${resultado.id}
        `;

      } else if (tipoDocumento === 'VERIFICACION') {
        const numeroResult = await prisma.$queryRaw`
          UPDATE tbl_series_factura
          SET numero_actual = numero_actual + 1
          WHERE tipo_comprobante = 'NV' AND serie = 'NV01'
          RETURNING numero_actual
        `;

        if (!numeroResult || numeroResult.length === 0) {
          throw new Error('Serie NV01 no encontrada');
        }

        const numero = numeroResult[0].numero_actual;

        const notaResult = await prisma.$queryRaw`
          INSERT INTO tbl_notas_venta (
            serie, numero, cliente_nombre, cliente_documento,
            descripcion, total, origen_tipo, origen_id,
            user_id_registration, comentario
          ) VALUES (
            'NV01', ${numero},
            ${resultado.pasajero.nombreCompleto},
            ${resultado.pasajero.documentoIdentidad},
            ${'Pasaje ' + resultado.viaje.ruta.puntoOrigen.nombre + ' - ' + resultado.viaje.ruta.puntoDestino.nombre},
            ${precioParaComprobante},
            'TICKET', ${resultado.id},
            ${req.user.id},
            ${pasajero.comentario || null}
          )
          RETURNING id, numero_completo
        `;

        await prisma.$executeRaw`
          UPDATE tbl_tickets SET id_nota_venta = ${notaResult[0].id} WHERE id = ${resultado.id}
        `;

        comprobante = {
          id: notaResult[0].id,
          tipo: 'VERIFICACION',
          numeroCompleto: notaResult[0].numero_completo,
          total: precioParaComprobante,
          comentario: pasajero.comentario || null
        };
      }
    } catch (errorComprobante) {
      console.error('Error emitiendo comprobante:', errorComprobante);
      return res.status(201).json({
        mensaje: 'Pasaje vendido exitosamente, pero hubo un error al generar el comprobante',
        ticket: resultado,
        comprobanteError: errorComprobante.message
      });
    }

    // Obtener datos de la agencia
    let agencia = null;
    const idPuntoAgencia = req.user.id_punto || resultado.viaje?.ruta?.idPuntoOrigen;
    if (idPuntoAgencia) {
      const puntoResult = await prisma.$queryRaw`
        SELECT nombre, ciudad, direccion FROM tbl_puntos WHERE id = ${idPuntoAgencia} AND estado = 1
      `;
      if (puntoResult && puntoResult.length > 0) {
        agencia = puntoResult[0];
      }
    }

    // Normalizar respuesta del comprobante
    if (comprobante) {
      comprobante.tipoDocumento = tipoDocumento;
      comprobante.agencia = agencia;
      if (!comprobante.numeroCompleto && comprobante.numero_completo) {
        comprobante.numeroCompleto = comprobante.numero_completo;
      }
      if (!comprobante.total) {
        comprobante.total = comprobante.total_venta || resultado.precioFinal || resultado.precioOriginal;
      }
    }

    res.status(201).json({
      mensaje: 'Venta instantanea realizada exitosamente',
      ticket: { ...resultado, agencia },
      comprobante
    });
  } catch (error) {
    console.error('Error en venta instantanea:', error);

    if (error.message === 'Aforo completo para ventas instantaneas de hoy') {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: 'Error al procesar venta instantanea' });
  }
};

module.exports = {
  listar,
  vender,
  venderInstantaneo,
  obtener,
  obtenerPorCodigo,
  anular,
  imprimir
};
