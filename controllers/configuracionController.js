/**
 * Configuracion Controller
 * Controlador para configuracion del sistema
 */

const prisma = require('../config/prisma');
const { registrarAuditoria } = require('../services/auditoriaService');

// Valores por defecto
const DEFAULTS = {
  nombreEmpresa: 'Transportes Herminio',
  ruc: '',
  direccion: '',
  telefono: '',
  precioBasePasaje: 25.00,
  precioBaseEncomiendaKg: 5.00,
  tiempoReservaMinutos: 30,
  capacidadDefaultBus: 40,
  solesPorPunto: 10.00,
  puntosPorSolDescuento: 10.00,
  politicasEncomienda: `El remitente será responsable de la veracidad de los datos brindados.
La empresa no se responsabiliza por deterioro debido al mal embalado ni por descomposición de artículos susceptibles.
Plazo para retirar su encomienda: 48 horas desde que llegó. Caso contrario será evacuado al almacén por 15 días (si es perecible 3 días). Se dará por abandono y será desechable sin lugar a reclamo.
Todo producto ilegal o prohibido será puesto a disposición de las autoridades competentes.
El pago por pérdida de un envío se hará de acuerdo a la ley de ferrocarriles (art. 8): diez veces el valor del flete pagado.
La clave de seguridad es personal y privada para el recojo de sus envíos.
Recibido sin verificación de contenido.`
};

/**
 * Obtener configuracion general del sistema
 * GET /api/configuracion
 */
const obtenerConfiguracionSistema = async (req, res) => {
  try {
    // Intentar con columnas nuevas primero
    let result;
    try {
      result = await prisma.$queryRaw`
        SELECT
          id,
          nombre_empresa as "nombreEmpresa",
          ruc,
          direccion,
          telefono,
          precio_base_pasaje as "precioBasePasaje",
          precio_base_encomienda_kg as "precioBaseEncomiendaKg",
          tiempo_reserva_minutos as "tiempoReservaMinutos",
          capacidad_default_bus as "capacidadDefaultBus",
          COALESCE(soles_por_punto, 10.00) as "solesPorPunto",
          COALESCE(puntos_por_sol_descuento, 10.00) as "puntosPorSolDescuento",
          politicas_encomienda as "politicasEncomienda",
          activo,
          date_time_registration as "fechaCreacion",
          date_time_modification as "fechaModificacion"
        FROM tbl_configuracion_sistema
        WHERE activo = true
        LIMIT 1
      `;
    } catch (queryError) {
      // Si las columnas no existen, usar query sin ellas
      if (queryError.code === '42703') {
        result = await prisma.$queryRaw`
          SELECT
            id,
            nombre_empresa as "nombreEmpresa",
            ruc,
            direccion,
            telefono,
            precio_base_pasaje as "precioBasePasaje",
            precio_base_encomienda_kg as "precioBaseEncomiendaKg",
            tiempo_reserva_minutos as "tiempoReservaMinutos",
            capacidad_default_bus as "capacidadDefaultBus",
            activo,
            date_time_registration as "fechaCreacion",
            date_time_modification as "fechaModificacion"
          FROM tbl_configuracion_sistema
          WHERE activo = true
          LIMIT 1
        `;
        // Agregar valores por defecto para puntos y politicas
        if (result && result.length > 0) {
          result[0].solesPorPunto = DEFAULTS.solesPorPunto;
          result[0].puntosPorSolDescuento = DEFAULTS.puntosPorSolDescuento;
          result[0].politicasEncomienda = DEFAULTS.politicasEncomienda;
        }
      } else {
        throw queryError;
      }
    }

    if (!result || result.length === 0) {
      return res.json({ configuracion: DEFAULTS });
    }

    // Si no tiene politicas, usar las por defecto
    if (!result[0].politicasEncomienda) {
      result[0].politicasEncomienda = DEFAULTS.politicasEncomienda;
    }

    res.json({ configuracion: result[0] });
  } catch (error) {
    console.error('Error obteniendo configuracion del sistema:', error);
    // Si la tabla no existe, retornar valores por defecto
    if (error.code === '42P01') {
      return res.json({ configuracion: DEFAULTS });
    }
    res.status(500).json({ error: 'Error al obtener configuracion del sistema' });
  }
};

/**
 * Actualizar configuracion general del sistema
 * PUT /api/configuracion
 */
const actualizarConfiguracionSistema = async (req, res) => {
  try {
    const {
      nombreEmpresa,
      ruc,
      direccion,
      telefono,
      precioBasePasaje,
      precioBaseEncomiendaKg,
      tiempoReservaMinutos,
      capacidadDefaultBus,
      solesPorPunto,
      puntosPorSolDescuento,
      politicasEncomienda
    } = req.body;

    // Desactivar configuracion anterior
    await prisma.$executeRaw`
      UPDATE tbl_configuracion_sistema
      SET activo = false,
          date_time_modification = NOW(),
          user_id_modification = ${req.user.id}
      WHERE activo = true
    `;

    // Intentar crear nueva configuracion con todas las columnas
    let result;
    try {
      result = await prisma.$queryRaw`
        INSERT INTO tbl_configuracion_sistema (
          nombre_empresa,
          ruc,
          direccion,
          telefono,
          precio_base_pasaje,
          precio_base_encomienda_kg,
          tiempo_reserva_minutos,
          capacidad_default_bus,
          soles_por_punto,
          puntos_por_sol_descuento,
          politicas_encomienda,
          activo,
          user_id_registration,
          date_time_registration
        ) VALUES (
          ${nombreEmpresa || 'Transportes Herminio'},
          ${ruc || ''},
          ${direccion || ''},
          ${telefono || ''},
          ${parseFloat(precioBasePasaje) || 25.00},
          ${parseFloat(precioBaseEncomiendaKg) || 5.00},
          ${parseInt(tiempoReservaMinutos) || 30},
          ${parseInt(capacidadDefaultBus) || 40},
          ${parseFloat(solesPorPunto) || 10.00},
          ${parseFloat(puntosPorSolDescuento) || 10.00},
          ${politicasEncomienda || DEFAULTS.politicasEncomienda},
          true,
          ${req.user.id},
          NOW()
        )
        RETURNING
          id,
          nombre_empresa as "nombreEmpresa",
          ruc,
          direccion,
          telefono,
          precio_base_pasaje as "precioBasePasaje",
          precio_base_encomienda_kg as "precioBaseEncomiendaKg",
          tiempo_reserva_minutos as "tiempoReservaMinutos",
          capacidad_default_bus as "capacidadDefaultBus",
          soles_por_punto as "solesPorPunto",
          puntos_por_sol_descuento as "puntosPorSolDescuento",
          politicas_encomienda as "politicasEncomienda"
      `;
    } catch (queryError) {
      // Si las columnas no existen, usar query sin ellas
      if (queryError.code === '42703') {
        result = await prisma.$queryRaw`
          INSERT INTO tbl_configuracion_sistema (
            nombre_empresa,
            ruc,
            direccion,
            telefono,
            precio_base_pasaje,
            precio_base_encomienda_kg,
            tiempo_reserva_minutos,
            capacidad_default_bus,
            activo,
            user_id_registration,
            date_time_registration
          ) VALUES (
            ${nombreEmpresa || 'Transportes Herminio'},
            ${ruc || ''},
            ${direccion || ''},
            ${telefono || ''},
            ${parseFloat(precioBasePasaje) || 25.00},
            ${parseFloat(precioBaseEncomiendaKg) || 5.00},
            ${parseInt(tiempoReservaMinutos) || 30},
            ${parseInt(capacidadDefaultBus) || 40},
            true,
            ${req.user.id},
            NOW()
          )
          RETURNING
            id,
            nombre_empresa as "nombreEmpresa",
            ruc,
            direccion,
            telefono,
            precio_base_pasaje as "precioBasePasaje",
            precio_base_encomienda_kg as "precioBaseEncomiendaKg",
            tiempo_reserva_minutos as "tiempoReservaMinutos",
            capacidad_default_bus as "capacidadDefaultBus"
        `;
        // Agregar valores por defecto al resultado
        result[0].solesPorPunto = parseFloat(solesPorPunto) || DEFAULTS.solesPorPunto;
        result[0].puntosPorSolDescuento = parseFloat(puntosPorSolDescuento) || DEFAULTS.puntosPorSolDescuento;
        result[0].politicasEncomienda = politicasEncomienda || DEFAULTS.politicasEncomienda;
      } else {
        throw queryError;
      }
    }

    // Auditoria
    await registrarAuditoria(
      req.user.id,
      'CONFIGURACION_SISTEMA_ACTUALIZADA',
      'CONFIGURACION',
      result[0].id,
      result[0]
    );

    res.json({
      mensaje: 'Configuracion actualizada exitosamente',
      configuracion: result[0]
    });
  } catch (error) {
    console.error('Error actualizando configuracion del sistema:', error);
    res.status(500).json({ error: 'Error al actualizar configuracion del sistema' });
  }
};

/**
 * Obtener configuracion de precios de encomienda
 * GET /api/configuracion/precios-encomienda
 */
const obtenerPreciosEncomienda = async (req, res) => {
  try {
    const config = await prisma.configuracionPreciosEncomienda.findFirst({
      where: { activo: true }
    });

    if (!config) {
      return res.status(404).json({
        error: 'No hay configuracion de precios activa',
        pendiente: true
      });
    }

    res.json({ configuracion: config });
  } catch (error) {
    console.error('Error obteniendo configuracion:', error);
    res.status(500).json({ error: 'Error al obtener configuracion' });
  }
};

/**
 * Actualizar configuracion de precios de encomienda
 * PUT /api/configuracion/precios-encomienda
 */
const actualizarPreciosEncomienda = async (req, res) => {
  try {
    const { precioPorKg, precioPorCm3 } = req.body;

    if (precioPorKg === undefined || precioPorCm3 === undefined) {
      return res.status(400).json({
        error: 'Precio por kg y precio por cm3 son requeridos'
      });
    }

    // Desactivar configuracion anterior
    await prisma.configuracionPreciosEncomienda.updateMany({
      where: { activo: true },
      data: { activo: false }
    });

    // Crear nueva configuracion
    const config = await prisma.configuracionPreciosEncomienda.create({
      data: {
        tarifaBase: 0,
        precioPorKg: parseFloat(precioPorKg),
        precioPorCm3: parseFloat(precioPorCm3),
        activo: true,
        userIdRegistration: req.user.id
      }
    });

    // Auditoria
    await registrarAuditoria(req.user.id, 'PRECIOS_ENCOMIENDA_ACTUALIZADOS', 'CONFIGURACION', config.id, config);

    res.json({
      mensaje: 'Configuracion actualizada exitosamente',
      configuracion: config
    });
  } catch (error) {
    console.error('Error actualizando configuracion:', error);
    res.status(500).json({ error: 'Error al actualizar configuracion' });
  }
};

module.exports = {
  obtenerConfiguracionSistema,
  actualizarConfiguracionSistema,
  obtenerPreciosEncomienda,
  actualizarPreciosEncomienda
};
