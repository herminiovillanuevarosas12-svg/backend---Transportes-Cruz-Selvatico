/**
 * Config Tipos Paquete Controller
 * Controlador para gestión de configuraciones de tipos de paquete
 */

const prisma = require('../config/prisma');
const { registrarAuditoria } = require('../services/auditoriaService');
const { utcNow } = require('../utils/dateUtils');

/**
 * Listar todas las configuraciones (admin)
 * GET /api/config-tipos-paquete
 */
const listar = async (req, res) => {
  try {
    const configuraciones = await prisma.tbl_configuracion_tipos_paquete.findMany({
      orderBy: { orden: 'asc' }
    });

    res.json({ configuraciones });
  } catch (error) {
    console.error('Error listando configuraciones de tipos de paquete:', error);
    res.status(500).json({ error: 'Error al listar configuraciones' });
  }
};

/**
 * Listar configuraciones activas (para dropdown)
 * GET /api/config-tipos-paquete/activos
 */
const listarActivos = async (req, res) => {
  try {
    const configuraciones = await prisma.tbl_configuracion_tipos_paquete.findMany({
      where: { activo: true },
      orderBy: { orden: 'asc' }
    });

    res.json({ configuraciones });
  } catch (error) {
    console.error('Error listando configuraciones activas:', error);
    res.status(500).json({ error: 'Error al listar configuraciones' });
  }
};

/**
 * Obtener configuración por ID
 * GET /api/config-tipos-paquete/:id
 */
const obtener = async (req, res) => {
  try {
    const { id } = req.params;

    const configuracion = await prisma.tbl_configuracion_tipos_paquete.findUnique({
      where: { id: parseInt(id) }
    });

    if (!configuracion) {
      return res.status(404).json({ error: 'Configuración no encontrada' });
    }

    res.json({ configuracion });
  } catch (error) {
    console.error('Error obteniendo configuración:', error);
    res.status(500).json({ error: 'Error al obtener configuración' });
  }
};

/**
 * Crear configuración
 * POST /api/config-tipos-paquete
 */
const crear = async (req, res) => {
  try {
    const {
      tipo_paquete,
      talla,
      nombre_display,
      alto_default,
      ancho_default,
      largo_default,
      orden
    } = req.body;

    // Validaciones
    if (!tipo_paquete || tipo_paquete.trim() === '') {
      return res.status(400).json({ error: 'El tipo de paquete es requerido' });
    }
    if (!nombre_display || nombre_display.trim() === '') {
      return res.status(400).json({ error: 'El nombre display es requerido' });
    }

    // Verificar duplicado
    const existente = await prisma.tbl_configuracion_tipos_paquete.findFirst({
      where: {
        tipo_paquete: tipo_paquete.trim().toUpperCase(),
        talla: talla ? talla.trim().toUpperCase() : null
      }
    });

    if (existente) {
      return res.status(400).json({
        error: 'Ya existe una configuración con ese tipo y talla'
      });
    }

    const configuracion = await prisma.tbl_configuracion_tipos_paquete.create({
      data: {
        tipo_paquete: tipo_paquete.trim().toUpperCase(),
        talla: talla ? talla.trim().toUpperCase() : null,
        nombre_display: nombre_display.trim(),
        alto_default: parseFloat(alto_default) || 0,
        ancho_default: parseFloat(ancho_default) || 0,
        largo_default: parseFloat(largo_default) || 0,
        orden: parseInt(orden) || 0,
        activo: true,
        user_id_registration: req.user.id,
        date_time_registration: utcNow()
      }
    });

    await registrarAuditoria(
      req.user.id,
      'CONFIG_TIPO_PAQUETE_CREADO',
      'CONFIG_TIPOS_PAQUETE',
      configuracion.id,
      configuracion
    );

    res.status(201).json({
      mensaje: 'Configuración creada exitosamente',
      configuracion
    });
  } catch (error) {
    console.error('Error creando configuración:', error);
    res.status(500).json({ error: 'Error al crear configuración' });
  }
};

/**
 * Actualizar configuración
 * PUT /api/config-tipos-paquete/:id
 */
const actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      tipo_paquete,
      talla,
      nombre_display,
      alto_default,
      ancho_default,
      largo_default,
      orden,
      activo
    } = req.body;

    const configExistente = await prisma.tbl_configuracion_tipos_paquete.findUnique({
      where: { id: parseInt(id) }
    });

    if (!configExistente) {
      return res.status(404).json({ error: 'Configuración no encontrada' });
    }

    // Si se cambia tipo o talla, verificar duplicados
    const nuevoTipo = tipo_paquete?.trim().toUpperCase() || configExistente.tipo_paquete;
    const nuevaTalla = talla !== undefined
      ? (talla ? talla.trim().toUpperCase() : null)
      : configExistente.talla;

    if (nuevoTipo !== configExistente.tipo_paquete || nuevaTalla !== configExistente.talla) {
      const duplicado = await prisma.tbl_configuracion_tipos_paquete.findFirst({
        where: {
          tipo_paquete: nuevoTipo,
          talla: nuevaTalla,
          id: { not: parseInt(id) }
        }
      });

      if (duplicado) {
        return res.status(400).json({
          error: 'Ya existe una configuración con ese tipo y talla'
        });
      }
    }

    const configuracion = await prisma.tbl_configuracion_tipos_paquete.update({
      where: { id: parseInt(id) },
      data: {
        tipo_paquete: nuevoTipo,
        talla: nuevaTalla,
        nombre_display: nombre_display?.trim() || configExistente.nombre_display,
        alto_default: alto_default !== undefined ? parseFloat(alto_default) : configExistente.alto_default,
        ancho_default: ancho_default !== undefined ? parseFloat(ancho_default) : configExistente.ancho_default,
        largo_default: largo_default !== undefined ? parseFloat(largo_default) : configExistente.largo_default,
        orden: orden !== undefined ? parseInt(orden) : configExistente.orden,
        activo: activo !== undefined ? activo : configExistente.activo,
        user_id_modification: req.user.id,
        date_time_modification: utcNow()
      }
    });

    await registrarAuditoria(
      req.user.id,
      'CONFIG_TIPO_PAQUETE_ACTUALIZADO',
      'CONFIG_TIPOS_PAQUETE',
      configuracion.id,
      { anterior: configExistente, nuevo: configuracion }
    );

    res.json({
      mensaje: 'Configuración actualizada exitosamente',
      configuracion
    });
  } catch (error) {
    console.error('Error actualizando configuración:', error);
    res.status(500).json({ error: 'Error al actualizar configuración' });
  }
};

/**
 * Eliminar/desactivar configuración (soft delete)
 * DELETE /api/config-tipos-paquete/:id
 */
const eliminar = async (req, res) => {
  try {
    const { id } = req.params;

    const configExistente = await prisma.tbl_configuracion_tipos_paquete.findUnique({
      where: { id: parseInt(id) }
    });

    if (!configExistente) {
      return res.status(404).json({ error: 'Configuración no encontrada' });
    }

    // Soft delete
    const configuracion = await prisma.tbl_configuracion_tipos_paquete.update({
      where: { id: parseInt(id) },
      data: {
        activo: false,
        user_id_modification: req.user.id,
        date_time_modification: utcNow()
      }
    });

    await registrarAuditoria(
      req.user.id,
      'CONFIG_TIPO_PAQUETE_ELIMINADO',
      'CONFIG_TIPOS_PAQUETE',
      configuracion.id,
      configuracion
    );

    res.json({
      mensaje: 'Configuración eliminada exitosamente'
    });
  } catch (error) {
    console.error('Error eliminando configuración:', error);
    res.status(500).json({ error: 'Error al eliminar configuración' });
  }
};

module.exports = {
  listar,
  listarActivos,
  obtener,
  crear,
  actualizar,
  eliminar
};
