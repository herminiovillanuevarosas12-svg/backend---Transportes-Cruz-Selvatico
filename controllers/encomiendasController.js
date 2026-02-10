/**
 * Encomiendas Controller
 * Controlador para gestion de encomiendas
 */

const prisma = require('../config/prisma');
const { registrarAuditoria } = require('../services/auditoriaService');
const { generarCodigoTracking } = require('../services/codigoService');
const { calcularPrecioEncomienda } = require('../services/preciosService');
const facturacionService = require('../services/facturacionService');
const { guardarImagenBase64 } = require('../middleware/uploadMiddleware');
const QRCode = require('qrcode');
const { utcNow, parseCivilDate } = require('../utils/dateUtils');

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

// Transiciones permitidas (solo forward)
const TRANSICIONES_PERMITIDAS = {
  'REGISTRADO': ['EN_ALMACEN'],
  'EN_ALMACEN': ['EN_RUTA'],
  'EN_RUTA': ['LLEGO_A_DESTINO'],
  'LLEGO_A_DESTINO': ['RETIRADO'],
  'RETIRADO': []
};

/**
 * Listar encomiendas
 * GET /api/encomiendas
 * Query params: estado, codigoTracking, fechaDesde, fechaHasta
 */
const listar = async (req, res) => {
  try {
    const { estado, codigoTracking, fechaDesde, fechaHasta, page = 1, limit = 20 } = req.query;

    const where = {};
    const skip = (parseInt(page) - 1) * parseInt(limit);

    if (estado) {
      where.estadoActual = estado;
    }

    if (codigoTracking) {
      where.codigoTracking = {
        contains: codigoTracking,
        mode: 'insensitive'
      };
    }

    if (fechaDesde || fechaHasta) {
      where.dateTimeRegistration = {};
      if (fechaDesde) {
        const { date: desde, error: errorDesde } = parseCivilDate(fechaDesde, 'fechaDesde');
        if (errorDesde) {
          return res.status(400).json({ error: errorDesde });
        }
        where.dateTimeRegistration.gte = desde;
      }
      if (fechaHasta) {
        const { date: hasta, error: errorHasta } = parseCivilDate(fechaHasta, 'fechaHasta');
        if (errorHasta) {
          return res.status(400).json({ error: errorHasta });
        }
        // Crear fin del día en UTC
        const fin = new Date(Date.UTC(
          hasta.getUTCFullYear(),
          hasta.getUTCMonth(),
          hasta.getUTCDate(),
          23, 59, 59, 999
        ));
        where.dateTimeRegistration.lte = fin;
      }
    }

    // Si el usuario tiene punto asignado, filtrar
    if (req.user.id_punto) {
      where.OR = [
        { idPuntoOrigen: req.user.id_punto },
        { idPuntoDestino: req.user.id_punto }
      ];
    }

    const [encomiendas, total] = await Promise.all([
      prisma.encomienda.findMany({
        where,
        include: {
          puntoOrigen: { select: { id: true, nombre: true, ciudad: true } },
          puntoDestino: { select: { id: true, nombre: true, ciudad: true } },
          usuarioCreacion: { select: { id: true, nombres: true } }
        },
        orderBy: { dateTimeRegistration: 'desc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.encomienda.count({ where })
    ]);

    res.json({
      encomiendas,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error listando encomiendas:', error);
    res.status(500).json({ error: 'Error al listar encomiendas' });
  }
};

/**
 * Registrar encomienda
 * POST /api/encomiendas
 */
const registrar = async (req, res) => {
  try {
    const {
      idPuntoOrigen,
      idPuntoDestino,
      remitente,
      destinatario,
      paquete,
      puntosACanjear = 0,
      tipoDocumento,
      clienteFactura,
      pagoAlRecojo = false,
      claveSeguridad,
      comentario,
      idPrecioBase
    } = req.body;

    // Validaciones
    if (!idPuntoOrigen || !idPuntoDestino) {
      return res.status(400).json({
        error: 'Origen y destino son requeridos'
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

    // Validar clave de seguridad (exactamente 4 digitos numericos)
    if (claveSeguridad) {
      if (!/^\d{4}$/.test(claveSeguridad)) {
        return res.status(400).json({
          error: 'La clave de seguridad debe ser exactamente 4 digitos numericos'
        });
      }
    }

    if (parseInt(idPuntoOrigen) === parseInt(idPuntoDestino)) {
      return res.status(400).json({
        error: 'El origen debe ser diferente al destino'
      });
    }

    if (!remitente?.nombre || !remitente?.dni || !remitente?.telefono) {
      return res.status(400).json({
        error: 'Nombre, DNI y telefono del remitente son requeridos'
      });
    }

    // Validar tipo de documento del remitente segun longitud
    const tipoDocRemitente = remitente.tipoDocumento || (remitente.dni?.length === 11 ? '6' : '1');
    if (tipoDocRemitente === '1' && remitente.dni?.length !== 8) {
      return res.status(400).json({
        error: 'El DNI del remitente debe tener 8 digitos'
      });
    }
    if (tipoDocRemitente === '6' && remitente.dni?.length !== 11) {
      return res.status(400).json({
        error: 'El RUC del remitente debe tener 11 digitos'
      });
    }

    if (!destinatario?.nombre || !destinatario?.telefono) {
      return res.status(400).json({
        error: 'Nombre y telefono del destinatario son requeridos'
      });
    }

    if (!paquete?.tipo || !paquete?.peso || !paquete?.alto || !paquete?.ancho || !paquete?.largo) {
      return res.status(400).json({
        error: 'Tipo, peso, alto, ancho y largo del paquete son requeridos'
      });
    }

    if (paquete.peso <= 0 || paquete.alto <= 0 || paquete.ancho <= 0 || paquete.largo <= 0) {
      return res.status(400).json({
        error: 'Peso y dimensiones deben ser mayores a 0'
      });
    }

    if (!idPrecioBase) {
      return res.status(400).json({
        error: 'Debe seleccionar un precio base para el envio'
      });
    }

    // Calcular precio
    const resultadoCalculo = await calcularPrecioEncomienda(
      paquete.peso,
      paquete.alto,
      paquete.ancho,
      paquete.largo,
      idPrecioBase
    );

    if (resultadoCalculo === null) {
      return res.status(400).json({
        error: 'No hay configuracion de precios activa o el precio base seleccionado no existe.'
      });
    }

    const precioCalculado = resultadoCalculo.precio;

    // Obtener configuracion de puntos
    const { solesPorPunto, puntosPorSolDescuento } = await obtenerConfiguracionPuntos();

    // Precio original de la encomienda
    const precioOriginal = parseFloat(precioCalculado);

    // Calcular puntos ganados por esta encomienda
    const puntosGanados = Math.floor(precioOriginal / solesPorPunto);

    // Convertir puntosACanjear a numero
    const puntosUsados = Math.max(0, parseInt(puntosACanjear) || 0);

    // Crear encomienda con evento inicial
    const encomienda = await prisma.$transaction(async (tx) => {
      // Generar codigo tracking dentro de la transaccion para evitar race conditions
      const codigoTracking = await generarCodigoTracking(tx);

      // Buscar o crear cliente (pasajero) por DNI del remitente
      let clienteDb = await tx.pasajero.findFirst({
        where: { documentoIdentidad: remitente.dni }
      });

      // Obtener puntos disponibles actuales del cliente
      let puntosDisponiblesActuales = 0;
      let puntosHistoricosActuales = 0;

      if (clienteDb) {
        puntosDisponiblesActuales = clienteDb.puntos_disponibles ?? clienteDb.puntos ?? 0;
        puntosHistoricosActuales = clienteDb.puntos_historicos ?? clienteDb.puntos ?? 0;
      }

      // Validar que no se intenten canjear mas puntos de los disponibles
      const puntosACanjearFinal = Math.min(puntosUsados, puntosDisponiblesActuales);

      // Calcular descuento por puntos
      let descuentoPuntos = puntosACanjearFinal / puntosPorSolDescuento;
      // El descuento no puede superar el precio original
      descuentoPuntos = Math.min(descuentoPuntos, precioOriginal);
      // Redondear a 2 decimales
      descuentoPuntos = Math.round(descuentoPuntos * 100) / 100;

      // Calcular precio final
      const precioFinal = Math.max(0, precioOriginal - descuentoPuntos);

      // Calcular nuevos puntos del cliente
      const nuevosPuntosDisponibles = puntosDisponiblesActuales - puntosACanjearFinal + puntosGanados;
      const nuevosPuntosHistoricos = puntosHistoricosActuales + puntosGanados;

      if (!clienteDb) {
        // Crear nuevo cliente con puntos iniciales
        clienteDb = await tx.pasajero.create({
          data: {
            nombreCompleto: remitente.nombre,
            documentoIdentidad: remitente.dni,
            tipo_documento: tipoDocRemitente,
            telefono: remitente.telefono,
            puntos_disponibles: puntosGanados,
            puntos_historicos: puntosGanados,
            userIdRegistration: req.user.id
          }
        });
      } else {
        // Actualizar datos del cliente y puntos
        clienteDb = await tx.pasajero.update({
          where: { id: clienteDb.id },
          data: {
            nombreCompleto: remitente.nombre,
            telefono: remitente.telefono,
            puntos_disponibles: nuevosPuntosDisponibles,
            puntos_historicos: nuevosPuntosHistoricos,
            userIdModification: req.user.id,
            dateTimeModification: utcNow()
          }
        });
      }

      // Crear encomienda vinculada al cliente con campos de puntos
      const enc = await tx.encomienda.create({
        data: {
          codigoTracking,
          idPuntoOrigen: parseInt(idPuntoOrigen),
          idPuntoDestino: parseInt(idPuntoDestino),
          remitenteNombre: remitente.nombre,
          remitenteDni: remitente.dni,
          remitenteTelefono: remitente.telefono,
          destinatarioNombre: destinatario.nombre,
          destinatario_dni: destinatario.dni || null,
          destinatarioTelefono: destinatario.telefono,
          tipoPaquete: paquete.tipo,
          descripcion: paquete.descripcion || null,
          peso: parseFloat(paquete.peso),
          alto: parseFloat(paquete.alto),
          ancho: parseFloat(paquete.ancho),
          largo: parseFloat(paquete.largo),
          precioCalculado: precioOriginal,
          precio_final: precioFinal,
          id_cliente: clienteDb.id,
          puntos_ganados: puntosGanados,
          puntos_usados: puntosACanjearFinal,
          descuento_puntos: descuentoPuntos,
          estadoActual: 'REGISTRADO',
          idUsuarioCreacion: req.user.id,
          userIdRegistration: req.user.id,
          pago_al_recojo: pagoAlRecojo === true,
          clave_seguridad: claveSeguridad || null,
          comentario: comentario || null,
          id_precio_base: parseInt(idPrecioBase),
          // El tipo de comprobante se selecciona al momento del retiro, no al registrar
          tipo_comprobante_pendiente: null,
          datos_factura_pendiente: null
        },
        include: {
          puntoOrigen: true,
          puntoDestino: true
        }
      });

      // Crear evento REGISTRADO
      await tx.eventoEncomienda.create({
        data: {
          idEncomienda: enc.id,
          estadoDestino: 'REGISTRADO',
          idUsuarioEvento: req.user.id,
          idPuntoEvento: parseInt(idPuntoOrigen),
          nota: 'Encomienda registrada',
          userIdRegistration: req.user.id
        }
      });

      // Agregar campos calculados al resultado
      return {
        ...enc,
        cliente: clienteDb,
        idCliente: clienteDb.id,
        puntosUsados: puntosACanjearFinal,
        descuentoPuntos,
        precioFinal,
        puntosGanados,
        // Incluir puntos acumulados del cliente (después de esta compra)
        puntosAcumuladosCliente: nuevosPuntosHistoricos,
        puntosDisponiblesCliente: nuevosPuntosDisponibles
      };
    });

    // Generar QR
    const qrDataUrl = await QRCode.toDataURL(encomienda.codigoTracking);

    // Auditoria
    await registrarAuditoria(req.user.id, 'ENCOMIENDA_REGISTRADA', 'ENCOMIENDA', encomienda.id, {
      codigoTracking: encomienda.codigoTracking,
      origen: encomienda.puntoOrigen.nombre,
      destino: encomienda.puntoDestino.nombre,
      tipoDocumento,
      precioOriginal,
      puntosUsados: encomienda.puntosUsados,
      descuentoPuntos: encomienda.descuentoPuntos,
      precioFinal: encomienda.precioFinal,
      puntosGanados: encomienda.puntosGanados,
      idCliente: encomienda.idCliente
    });

    // Emitir comprobante segun tipo de documento
    // Si es pago al recojo, forzar emision de VERIFICACION (nota de venta)
    let comprobante = null;
    const tipoDocumentoAEmitir = pagoAlRecojo ? 'VERIFICACION' : tipoDocumento;
    try {
      const precioParaComprobante = encomienda.precioFinal ?? precioOriginal;

      if (tipoDocumentoAEmitir === 'BOLETA') {
        comprobante = await facturacionService.emitirComprobante({
          tipoComprobante: '03',
          serie: 'BT74',
          cliente: {
            tipoDoc: tipoDocRemitente,
            numDoc: remitente.dni,
            razonSocial: remitente.nombre,
            direccion: ''
          },
          items: [{
            codigo: `ENC-${encomienda.codigoTracking}`,
            descripcion: `Envio de encomienda ${encomienda.puntoOrigen.nombre} - ${encomienda.puntoDestino.nombre} (${paquete.tipo})`,
            unidadMedida: 'ZZ',
            cantidad: 1,
            precioUnitario: precioParaComprobante
          }],
          origenTipo: 'ENCOMIENDA',
          origenId: encomienda.id,
          userId: req.user.id,
          comentario: comentario || null
        });

        await prisma.$executeRaw`
          UPDATE tbl_encomiendas SET id_comprobante = ${comprobante.id}, invoice_status = 'EMITIDO' WHERE id = ${encomienda.id}
        `;

      } else if (tipoDocumentoAEmitir === 'FACTURA') {
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
            codigo: `ENC-${encomienda.codigoTracking}`,
            descripcion: `Envio de encomienda ${encomienda.puntoOrigen.nombre} - ${encomienda.puntoDestino.nombre} (${paquete.tipo})`,
            unidadMedida: 'ZZ',
            cantidad: 1,
            precioUnitario: precioParaComprobante
          }],
          origenTipo: 'ENCOMIENDA',
          origenId: encomienda.id,
          userId: req.user.id,
          comentario: comentario || null
        });

        await prisma.$executeRaw`
          UPDATE tbl_encomiendas SET id_comprobante = ${comprobante.id}, invoice_status = 'EMITIDO' WHERE id = ${encomienda.id}
        `;

      } else if (tipoDocumentoAEmitir === 'VERIFICACION') {
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
            ${remitente.nombre},
            ${remitente.dni},
            ${'Envio de encomienda ' + encomienda.puntoOrigen.nombre + ' - ' + encomienda.puntoDestino.nombre + ' (' + paquete.tipo + ')'},
            ${precioParaComprobante},
            'ENCOMIENDA', ${encomienda.id},
            ${req.user.id},
            ${comentario || null}
          )
          RETURNING id, numero_completo
        `;

        // Vincular nota de venta a la encomienda
        await prisma.$executeRaw`
          UPDATE tbl_encomiendas SET id_nota_venta = ${notaResult[0].id} WHERE id = ${encomienda.id}
        `;

        comprobante = {
          id: notaResult[0].id,
          tipo: 'VERIFICACION',
          numeroCompleto: notaResult[0].numero_completo,
          total: precioParaComprobante,
          comentario: comentario || null
        };
      }
    } catch (errorComprobante) {
      console.error('Error emitiendo comprobante:', errorComprobante);
      return res.status(201).json({
        mensaje: 'Encomienda registrada exitosamente, pero hubo un error al generar el comprobante',
        encomienda: {
          ...encomienda,
          qr: qrDataUrl
        },
        comprobanteError: errorComprobante.message
      });
    }

    // Obtener datos de la agencia (punto del vendedor o punto de origen de la encomienda)
    let agencia = null;
    const idPuntoAgencia = req.user.id_punto || parseInt(idPuntoOrigen);
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
      comprobante.tipoDocumento = tipoDocumentoAEmitir;
      comprobante.tipoDocumentoPendiente = pagoAlRecojo ? tipoDocumento : null;
      comprobante.agencia = agencia;
      if (!comprobante.numeroCompleto && comprobante.numero_completo) {
        comprobante.numeroCompleto = comprobante.numero_completo;
      }
      if (!comprobante.total) {
        comprobante.total = comprobante.total_venta || (encomienda.precioFinal ?? precioOriginal);
      }
    }

    res.status(201).json({
      mensaje: 'Encomienda registrada exitosamente',
      encomienda: {
        ...encomienda,
        fechaRegistro: encomienda.dateTimeRegistration,  // Alias para consistencia en frontend
        qr: qrDataUrl,
        agencia,
        pagoAlRecojo: pagoAlRecojo === true,
        tieneClaveSeguridad: !!claveSeguridad
      },
      comprobante
    });
  } catch (error) {
    console.error('Error registrando encomienda:', error);
    res.status(500).json({ error: 'Error al registrar encomienda' });
  }
};

/**
 * Obtener encomienda por ID
 * GET /api/encomiendas/:id
 */
const obtener = async (req, res) => {
  try {
    const { id } = req.params;

    const encomienda = await prisma.encomienda.findUnique({
      where: { id: parseInt(id) },
      include: {
        puntoOrigen: true,
        puntoDestino: true,
        eventos: {
          include: {
            puntoEvento: true,
            usuarioEvento: { select: { id: true, nombres: true } }
          },
          orderBy: { fechaEvento: 'asc' }
        }
      }
    });

    if (!encomienda) {
      return res.status(404).json({ error: 'Encomienda no encontrada' });
    }

    // Obtener rutas de fotos de eventos (campo no mapeado en Prisma aun)
    const fotosEventos = await prisma.$queryRaw`
      SELECT id, foto_evidencia_path
      FROM tbl_eventos_encomienda
      WHERE id_encomienda = ${parseInt(id)} AND foto_evidencia_path IS NOT NULL
    `;

    // Crear mapa de fotos por id de evento
    const fotosPorEvento = {};
    fotosEventos.forEach(fe => {
      fotosPorEvento[fe.id] = fe.foto_evidencia_path;
    });

    // Agregar foto a cada evento
    const eventosConFoto = encomienda.eventos.map(ev => ({
      ...ev,
      fotoEvidenciaPath: fotosPorEvento[ev.id] || null
    }));

    // Normalizar campos para el frontend
    res.json({
      encomienda: {
        ...encomienda,
        eventos: eventosConFoto,
        pagoAlRecojo: encomienda.pago_al_recojo || false,
        tieneClaveSeguridad: !!encomienda.clave_seguridad,
        precioFinal: encomienda.precio_final || encomienda.precioCalculado
      }
    });
  } catch (error) {
    console.error('Error obteniendo encomienda:', error);
    res.status(500).json({ error: 'Error al obtener encomienda' });
  }
};

/**
 * Buscar encomienda por codigo (interno)
 * GET /api/encomiendas/codigo/:codigo
 */
const buscarPorCodigo = async (req, res) => {
  try {
    const { codigo } = req.params;

    // Priorizar busqueda por match exacto para evitar falsos positivos
    let encomienda = await prisma.encomienda.findFirst({
      where: { codigoTracking: codigo },
      include: {
        puntoOrigen: { select: { id: true, nombre: true, ciudad: true } },
        puntoDestino: { select: { id: true, nombre: true, ciudad: true } },
        eventos: {
          include: {
            puntoEvento: { select: { id: true, nombre: true } }
          },
          orderBy: { fechaEvento: 'desc' }
        }
      }
    });

    // Si no hay match exacto, buscar case-insensitive (solo para ingreso manual)
    if (!encomienda) {
      encomienda = await prisma.encomienda.findFirst({
        where: {
          codigoTracking: { equals: codigo, mode: 'insensitive' }
        },
        include: {
          puntoOrigen: { select: { id: true, nombre: true, ciudad: true } },
          puntoDestino: { select: { id: true, nombre: true, ciudad: true } },
          eventos: {
            include: {
              puntoEvento: { select: { id: true, nombre: true } }
            },
            orderBy: { fechaEvento: 'desc' }
          }
        }
      });
    }

    if (!encomienda) {
      return res.status(404).json({ error: 'Encomienda no encontrada' });
    }

    // Mapear para frontend
    res.json({
      encomienda: {
        id: encomienda.id,
        codigoRastreo: encomienda.codigoTracking,
        estado: encomienda.estadoActual,
        descripcion: encomienda.descripcion || encomienda.tipoPaquete,
        peso: encomienda.peso,
        remitenteNombre: encomienda.remitenteNombre,
        remitenteDni: encomienda.remitenteDni,
        remitenteTelefono: encomienda.remitenteTelefono,
        destinatarioNombre: encomienda.destinatarioNombre,
        destinatario_dni: encomienda.destinatario_dni,
        destinatarioTelefono: encomienda.destinatarioTelefono,
        ruta: {
          puntoOrigen: encomienda.puntoOrigen,
          puntoDestino: encomienda.puntoDestino
        },
        eventos: encomienda.eventos,
        // Nuevos campos para pago al recojo y clave de seguridad
        pagoAlRecojo: encomienda.pago_al_recojo || false,
        tieneClaveSeguridad: !!encomienda.clave_seguridad,
        precioFinal: encomienda.precio_final || encomienda.precioCalculado
      }
    });
  } catch (error) {
    console.error('Error buscando encomienda:', error);
    res.status(500).json({ error: 'Error al buscar encomienda' });
  }
};

/**
 * Obtener encomienda por tracking
 * GET /api/encomiendas/tracking/:codigo
 */
const obtenerPorTracking = async (req, res) => {
  try {
    const { codigo } = req.params;

    const encomienda = await prisma.encomienda.findUnique({
      where: { codigoTracking: codigo },
      include: {
        puntoOrigen: { select: { id: true, nombre: true, ciudad: true } },
        puntoDestino: { select: { id: true, nombre: true, ciudad: true } },
        eventos: {
          include: {
            puntoEvento: { select: { id: true, nombre: true } }
          },
          orderBy: { fechaEvento: 'asc' }
        }
      }
    });

    if (!encomienda) {
      return res.status(404).json({ error: 'Encomienda no encontrada' });
    }

    res.json({ encomienda });
  } catch (error) {
    console.error('Error obteniendo encomienda:', error);
    res.status(500).json({ error: 'Error al obtener encomienda' });
  }
};

/**
 * Cambiar estado
 * PATCH /api/encomiendas/:id/estado
 */
const cambiarEstado = async (req, res) => {
  try {
    const { id } = req.params;
    const { nuevoEstado, nota } = req.body;

    if (!nuevoEstado) {
      return res.status(400).json({
        error: 'El nuevo estado es requerido'
      });
    }

    // Validar que nuevoEstado sea un valor valido del enum
    const ESTADOS_VALIDOS = ['REGISTRADO', 'EN_ALMACEN', 'EN_RUTA', 'LLEGO_A_DESTINO', 'RETIRADO'];
    if (!ESTADOS_VALIDOS.includes(nuevoEstado)) {
      return res.status(400).json({
        error: 'Estado no valido',
        estadosValidos: ESTADOS_VALIDOS
      });
    }

    const encomienda = await prisma.encomienda.findUnique({
      where: { id: parseInt(id) }
    });

    if (!encomienda) {
      return res.status(404).json({ error: 'Encomienda no encontrada' });
    }

    // Validar que el usuario pertenezca al punto origen o destino de la encomienda
    // Superadmin (sin punto asignado) puede modificar cualquier encomienda
    if (req.user.id_punto) {
      const perteneceAPunto = req.user.id_punto === encomienda.idPuntoOrigen ||
                              req.user.id_punto === encomienda.idPuntoDestino;

      if (!perteneceAPunto) {
        await registrarAuditoria(req.user.id, 'CAMBIO_ESTADO_NO_AUTORIZADO', 'ENCOMIENDA', parseInt(id), {
          codigoTracking: encomienda.codigoTracking,
          idPuntoUsuario: req.user.id_punto,
          idPuntoOrigen: encomienda.idPuntoOrigen,
          idPuntoDestino: encomienda.idPuntoDestino,
          estadoIntentado: nuevoEstado
        });

        return res.status(403).json({
          error: 'No tiene permiso para modificar esta encomienda',
          razon: 'La encomienda no pertenece a su punto de operacion'
        });
      }
    }

    // Verificar transicion permitida
    const estadosPermitidos = TRANSICIONES_PERMITIDAS[encomienda.estadoActual];
    if (!estadosPermitidos.includes(nuevoEstado)) {
      await registrarAuditoria(req.user.id, 'TRANSICION_NO_PERMITIDA', 'ENCOMIENDA', id, {
        estadoActual: encomienda.estadoActual,
        estadoIntentado: nuevoEstado
      });

      return res.status(400).json({
        error: 'No se puede cambiar a este estado',
        estadoActual: encomienda.estadoActual,
        estadosPermitidos
      });
    }

    // Si es RETIRADO, usar el endpoint especifico
    if (nuevoEstado === 'RETIRADO') {
      return res.status(400).json({
        error: 'Para registrar retiro use el endpoint POST /api/encomiendas/:id/retirar'
      });
    }

    // Determinar el punto del evento
    // Usuario con punto: usar su punto (ya validamos que pertenece a origen o destino)
    // Superadmin sin punto: EN_ALMACEN usa origen, otros estados usan destino
    let idPuntoEvento = req.user.id_punto;
    if (!idPuntoEvento) {
      idPuntoEvento = (nuevoEstado === 'EN_ALMACEN') ? encomienda.idPuntoOrigen : encomienda.idPuntoDestino;
    }

    // Actualizar estado y crear evento (con optimistic locking)
    const resultado = await prisma.$transaction(async (tx) => {
      // Verificar que el estado no haya cambiado entre la lectura y la escritura
      const encActual = await tx.encomienda.findUnique({
        where: { id: parseInt(id) }
      });
      if (encActual.estadoActual !== encomienda.estadoActual) {
        throw new Error('ESTADO_MODIFICADO_CONCURRENTEMENTE');
      }

      const enc = await tx.encomienda.update({
        where: { id: parseInt(id) },
        data: {
          estadoActual: nuevoEstado,
          userIdModification: req.user.id,
          dateTimeModification: utcNow()
        },
        include: {
          puntoOrigen: true,
          puntoDestino: true
        }
      });

      await tx.eventoEncomienda.create({
        data: {
          idEncomienda: parseInt(id),
          estadoDestino: nuevoEstado,
          idUsuarioEvento: req.user.id,
          idPuntoEvento: parseInt(idPuntoEvento),
          nota: nota || null,
          userIdRegistration: req.user.id
        }
      });

      return enc;
    });

    // Auditoria
    await registrarAuditoria(req.user.id, 'ESTADO_ENCOMIENDA_CAMBIADO', 'ENCOMIENDA', id, {
      estadoAnterior: encomienda.estadoActual,
      estadoNuevo: nuevoEstado,
      nota
    });

    res.json({
      mensaje: 'Estado actualizado exitosamente',
      encomienda: resultado
    });
  } catch (error) {
    if (error.message === 'ESTADO_MODIFICADO_CONCURRENTEMENTE') {
      return res.status(409).json({
        error: 'El estado de la encomienda fue modificado por otro usuario. Recargue e intente nuevamente.'
      });
    }
    console.error('Error cambiando estado:', error);
    res.status(500).json({ error: 'Error al cambiar estado' });
  }
};

/**
 * Registrar retiro con foto
 * POST /api/encomiendas/:id/retirar
 */
const retirar = async (req, res) => {
  try {
    const { id } = req.params;
    const { dniRetiro, fotoBase64, nota, claveIngresada, tipoComprobante, clienteFactura } = req.body;

    if (!dniRetiro) {
      return res.status(400).json({
        error: 'El DNI de retiro es requerido'
      });
    }

    if (!fotoBase64) {
      return res.status(400).json({
        error: 'Debe adjuntar foto de evidencia'
      });
    }

    // Validar tamano de la foto (max 5MB en base64)
    const MAX_FOTO_SIZE = 5 * 1024 * 1024 * 1.37; // 5MB * overhead base64
    if (fotoBase64.length > MAX_FOTO_SIZE) {
      return res.status(400).json({
        error: 'La foto excede el tamano maximo permitido (5MB)'
      });
    }

    const encomienda = await prisma.encomienda.findUnique({
      where: { id: parseInt(id) },
      include: {
        puntoOrigen: true,
        puntoDestino: true
      }
    });

    if (!encomienda) {
      return res.status(404).json({ error: 'Encomienda no encontrada' });
    }

    if (encomienda.estadoActual !== 'LLEGO_A_DESTINO') {
      return res.status(400).json({
        error: 'Solo se puede retirar encomiendas que han llegado a destino',
        estadoActual: encomienda.estadoActual
      });
    }

    // Validar que el usuario pertenezca al punto de destino
    // Solo usuarios del punto destino pueden registrar retiros (superadmin no tiene punto asignado)
    if (req.user.id_punto && req.user.id_punto !== encomienda.idPuntoDestino) {
      await registrarAuditoria(req.user.id, 'INTENTO_RETIRO_NO_AUTORIZADO', 'ENCOMIENDA', parseInt(id), {
        codigoTracking: encomienda.codigoTracking,
        idPuntoUsuario: req.user.id_punto,
        idPuntoDestino: encomienda.idPuntoDestino,
        nombrePuntoDestino: encomienda.puntoDestino?.nombre
      });

      return res.status(403).json({
        error: 'No tiene permiso para registrar el retiro de esta encomienda',
        razon: 'Solo el punto de destino puede registrar la entrega',
        puntoDestino: encomienda.puntoDestino?.nombre
      });
    }

    // Validar clave de seguridad si la encomienda tiene una
    if (encomienda.clave_seguridad) {
      if (!claveIngresada) {
        return res.status(400).json({
          error: 'Esta encomienda requiere clave de seguridad para el retiro',
          requiereClave: true
        });
      }
      if (claveIngresada !== encomienda.clave_seguridad) {
        return res.status(400).json({
          error: 'Clave de seguridad incorrecta',
          claveIncorrecta: true
        });
      }
    }

    // Punto del evento: siempre es destino (ya validamos que el usuario pertenece al destino o es superadmin)
    const idPuntoEvento = encomienda.idPuntoDestino;

    // Procesar retiro (con optimistic locking)
    const resultado = await prisma.$transaction(async (tx) => {
      // Verificar que el estado no haya cambiado concurrentemente
      const encActual = await tx.encomienda.findUnique({ where: { id: parseInt(id) } });
      if (encActual.estadoActual !== 'LLEGO_A_DESTINO') {
        throw new Error('ESTADO_MODIFICADO_CONCURRENTEMENTE');
      }

      // Actualizar encomienda
      const enc = await tx.encomienda.update({
        where: { id: parseInt(id) },
        data: {
          estadoActual: 'RETIRADO',
          userIdModification: req.user.id,
          dateTimeModification: utcNow()
        },
        include: {
          puntoOrigen: true,
          puntoDestino: true
        }
      });

      // Guardar foto fisicamente en uploads/Entrega_encomiendas
      let fotoPath = null;
      if (fotoBase64) {
        fotoPath = await guardarImagenBase64(fotoBase64, id);
      }

      // Crear evento de retiro con la ruta de la foto
      const evento = await tx.eventoEncomienda.create({
        data: {
          idEncomienda: parseInt(id),
          estadoDestino: 'RETIRADO',
          idUsuarioEvento: req.user.id,
          idPuntoEvento: parseInt(idPuntoEvento),
          nota: nota || 'Retiro completado',
          dniRetiro,
          userIdRegistration: req.user.id
        }
      });

      // Actualizar evento con la ruta de la foto (usando raw SQL por compatibilidad)
      if (fotoPath) {
        await tx.$executeRaw`
          UPDATE tbl_eventos_encomienda
          SET foto_evidencia_path = ${fotoPath}
          WHERE id = ${evento.id}
        `;
      }

      return enc;
    });

    // Auditoria
    await registrarAuditoria(req.user.id, 'ENCOMIENDA_RETIRADA', 'ENCOMIENDA', id, {
      codigoTracking: encomienda.codigoTracking,
      dniRetiro
    });

    // Si es pago al recojo, emitir el comprobante seleccionado
    let comprobanteRetiro = null;
    if (encomienda.pago_al_recojo) {
      // Usar el tipo de comprobante enviado desde el frontend (prioridad) o el almacenado
      const tipoComprobanteAEmitir = tipoComprobante || encomienda.tipo_comprobante_pendiente;

      if (tipoComprobanteAEmitir && tipoComprobanteAEmitir !== 'VERIFICACION') {
        try {
          const precioParaComprobante = parseFloat(encomienda.precio_final ?? encomienda.precioCalculado);

          if (tipoComprobanteAEmitir === 'BOLETA') {
            comprobanteRetiro = await facturacionService.emitirComprobante({
              tipoComprobante: '03',
              serie: 'BT74',
              cliente: {
                tipoDoc: '1',
                numDoc: dniRetiro || encomienda.remitenteDni,
                razonSocial: encomienda.destinatarioNombre,
                direccion: ''
              },
              items: [{
                codigo: `ENC-${encomienda.codigoTracking}`,
                descripcion: `Envio de encomienda ${encomienda.puntoOrigen.nombre} - ${encomienda.puntoDestino.nombre} (${encomienda.tipoPaquete})`,
                unidadMedida: 'ZZ',
                cantidad: 1,
                precioUnitario: precioParaComprobante
              }],
              origenTipo: 'ENCOMIENDA',
              origenId: encomienda.id,
              userId: req.user.id
            });

            await prisma.$executeRaw`
              UPDATE tbl_encomiendas SET id_comprobante = ${comprobanteRetiro.id}, invoice_status = 'EMITIDO' WHERE id = ${encomienda.id}
            `;

          } else if (tipoComprobanteAEmitir === 'FACTURA') {
            // Usar datos de factura del frontend (prioridad) o los almacenados
            const datosFactura = clienteFactura || encomienda.datos_factura_pendiente || {};

            if (!datosFactura.ruc || !datosFactura.razonSocial) {
              throw new Error('Datos de factura incompletos');
            }

            comprobanteRetiro = await facturacionService.emitirComprobante({
              tipoComprobante: '01',
              serie: 'FT74',
              cliente: {
                tipoDoc: '6',
                numDoc: datosFactura.ruc || '',
                razonSocial: datosFactura.razonSocial || '',
                direccion: datosFactura.direccion || ''
              },
              items: [{
                codigo: `ENC-${encomienda.codigoTracking}`,
                descripcion: `Envio de encomienda ${encomienda.puntoOrigen.nombre} - ${encomienda.puntoDestino.nombre} (${encomienda.tipoPaquete})`,
                unidadMedida: 'ZZ',
                cantidad: 1,
                precioUnitario: precioParaComprobante
              }],
              origenTipo: 'ENCOMIENDA',
              origenId: encomienda.id,
              userId: req.user.id
            });

            await prisma.$executeRaw`
              UPDATE tbl_encomiendas SET id_comprobante = ${comprobanteRetiro.id}, invoice_status = 'EMITIDO' WHERE id = ${encomienda.id}
            `;
          }

          // Normalizar respuesta del comprobante
          if (comprobanteRetiro) {
            comprobanteRetiro.tipoDocumento = tipoComprobanteAEmitir;
            if (!comprobanteRetiro.numeroCompleto && comprobanteRetiro.numero_completo) {
              comprobanteRetiro.numeroCompleto = comprobanteRetiro.numero_completo;
            }
            if (!comprobanteRetiro.total) {
              comprobanteRetiro.total = comprobanteRetiro.total_venta || precioParaComprobante;
            }
          }
        } catch (errorComprobante) {
          console.error('Error emitiendo comprobante al retirar:', errorComprobante);
          // No fallar el retiro por error en comprobante, pero notificar
          return res.json({
            mensaje: 'Retiro registrado exitosamente, pero hubo un error al emitir el comprobante',
            encomienda: resultado,
            comprobante: null,
            errorComprobante: errorComprobante.message
          });
        }
      }
    }

    res.json({
      mensaje: 'Retiro registrado exitosamente',
      encomienda: resultado,
      comprobante: comprobanteRetiro
    });
  } catch (error) {
    if (error.message === 'ESTADO_MODIFICADO_CONCURRENTEMENTE') {
      return res.status(409).json({
        error: 'El estado de la encomienda fue modificado por otro usuario. Recargue e intente nuevamente.'
      });
    }
    console.error('Error registrando retiro:', error);
    res.status(500).json({ error: 'Error al registrar retiro' });
  }
};

/**
 * Vista imprimible
 * GET /api/encomiendas/:id/imprimir
 */
const imprimir = async (req, res) => {
  try {
    const { id } = req.params;

    const encomienda = await prisma.encomienda.findUnique({
      where: { id: parseInt(id) },
      include: {
        puntoOrigen: true,
        puntoDestino: true
      }
    });

    if (!encomienda) {
      return res.status(404).json({ error: 'Encomienda no encontrada' });
    }

    // Generar QR
    const qrDataUrl = await QRCode.toDataURL(encomienda.codigoTracking);

    // Obtener datos de la agencia (punto del usuario o punto de origen)
    let agencia = null;
    const idPuntoAgencia = req.user?.id_punto || encomienda.idPuntoOrigen;
    if (idPuntoAgencia) {
      const puntoResult = await prisma.$queryRaw`
        SELECT nombre, ciudad, direccion FROM tbl_puntos WHERE id = ${idPuntoAgencia} AND estado = 1
      `;
      if (puntoResult && puntoResult.length > 0) {
        agencia = puntoResult[0];
      }
    }

    // Obtener politicas de encomienda desde la configuracion del sistema
    let politicasEncomienda = null;
    try {
      const configResult = await prisma.$queryRaw`
        SELECT politicas_encomienda as "politicasEncomienda"
        FROM tbl_configuracion_sistema
        WHERE activo = true
        LIMIT 1
      `;
      if (configResult && configResult.length > 0 && configResult[0].politicasEncomienda) {
        politicasEncomienda = configResult[0].politicasEncomienda;
      }
    } catch (configError) {
      // Si la columna no existe, usar valor por defecto
      politicasEncomienda = `El remitente será responsable de la veracidad de los datos brindados.
La empresa no se responsabiliza por deterioro debido al mal embalado ni por descomposición de artículos susceptibles.
Plazo para retirar su encomienda: 48 horas desde que llegó. Caso contrario será evacuado al almacén por 15 días (si es perecible 3 días). Se dará por abandono y será desechable sin lugar a reclamo.
Todo producto ilegal o prohibido será puesto a disposición de las autoridades competentes.
El pago por pérdida de un envío se hará de acuerdo a la ley de ferrocarriles (art. 8): diez veces el valor del flete pagado.
La clave de seguridad es personal y privada para el recojo de sus envíos.
Recibido sin verificación de contenido.`;
    }

    res.json({
      encomienda: {
        codigo: encomienda.codigoTracking,
        origen: encomienda.puntoOrigen.nombre,
        destino: encomienda.puntoDestino.nombre,
        remitente: {
          nombre: encomienda.remitenteNombre,
          dni: encomienda.remitenteDni,
          telefono: encomienda.remitenteTelefono
        },
        destinatario: {
          nombre: encomienda.destinatarioNombre,
          dni: encomienda.destinatario_dni,
          telefono: encomienda.destinatarioTelefono
        },
        paquete: {
          tipo: encomienda.tipoPaquete,
          descripcion: encomienda.descripcion,
          peso: encomienda.peso,
          dimensiones: `${encomienda.alto}x${encomienda.ancho}x${encomienda.largo} cm`
        },
        precio: encomienda.precioCalculado,
        pagoAlRecojo: encomienda.pago_al_recojo || false,
        estado: encomienda.estadoActual,
        fechaRegistro: encomienda.dateTimeRegistration,
        qr: qrDataUrl,
        agencia,
        politicasEncomienda
      }
    });
  } catch (error) {
    console.error('Error generando vista imprimible:', error);
    res.status(500).json({ error: 'Error al generar vista imprimible' });
  }
};

/**
 * Generar QR
 * GET /api/encomiendas/:id/qr
 */
const generarQR = async (req, res) => {
  try {
    const { id } = req.params;

    const encomienda = await prisma.encomienda.findUnique({
      where: { id: parseInt(id) },
      select: { codigoTracking: true }
    });

    if (!encomienda) {
      return res.status(404).json({ error: 'Encomienda no encontrada' });
    }

    const qrDataUrl = await QRCode.toDataURL(encomienda.codigoTracking);

    res.json({
      codigoTracking: encomienda.codigoTracking,
      qr: qrDataUrl
    });
  } catch (error) {
    console.error('Error generando QR:', error);
    res.status(500).json({ error: 'Error al generar QR' });
  }
};

/**
 * Consulta publica
 * GET /api/public/tracking/:codigo
 */
const consultaPublica = async (req, res) => {
  try {
    const { codigo } = req.params;

    if (!codigo) {
      return res.status(400).json({ error: 'El codigo de tracking es requerido' });
    }

    const encomienda = await prisma.encomienda.findUnique({
      where: { codigoTracking: codigo },
      select: {
        codigoTracking: true,
        estadoActual: true,
        puntoOrigen: { select: { nombre: true, ciudad: true } },
        puntoDestino: { select: { nombre: true, ciudad: true } },
        remitenteNombre: true,
        destinatarioNombre: true,
        dateTimeRegistration: true,
        eventos: {
          select: {
            estadoDestino: true,
            fechaEvento: true,
            puntoEvento: { select: { nombre: true } },
            nota: true
          },
          orderBy: { fechaEvento: 'asc' }
        }
      }
    });

    if (!encomienda) {
      // Registrar intento fallido
      await registrarAuditoria(null, 'TRACKING_NO_ENCONTRADO', 'ENCOMIENDA', codigo, {
        codigoIntentado: codigo
      });

      return res.status(404).json({ error: 'Encomienda no encontrada' });
    }

    res.json({
      encomienda: {
        codigo: encomienda.codigoTracking,
        estado: encomienda.estadoActual,
        origen: encomienda.puntoOrigen,
        destino: encomienda.puntoDestino,
        remitente: encomienda.remitenteNombre,
        destinatario: encomienda.destinatarioNombre,
        fechaRegistro: encomienda.dateTimeRegistration,
        historial: encomienda.eventos
      }
    });
  } catch (error) {
    console.error('Error en consulta publica:', error);
    res.status(500).json({ error: 'Error al consultar encomienda' });
  }
};

module.exports = {
  listar,
  registrar,
  obtener,
  buscarPorCodigo,
  obtenerPorTracking,
  cambiarEstado,
  retirar,
  imprimir,
  generarQR,
  consultaPublica
};
