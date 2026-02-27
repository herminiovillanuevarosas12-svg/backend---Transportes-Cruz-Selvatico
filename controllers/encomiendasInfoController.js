/**
 * Encomiendas Info Controller
 * Controlador para gestion de ventajas/cards e imagen hero de la pagina encomiendas-info
 */

const prisma = require('../config/prisma');
const { registrarAuditoria } = require('../services/auditoriaService');
const { procesarBannerFile, eliminarArchivoBanner } = require('../middleware/bannerUpload');

/**
 * Obtener ventajas publicas activas
 * GET /api/public/encomiendas-ventajas
 */
const getVentajasPublicas = async (req, res) => {
  try {
    const ventajas = await prisma.$queryRaw`
      SELECT
        id,
        titulo,
        descripcion,
        imagen_path as "imagenPath",
        icono,
        orden
      FROM tbl_encomiendas_ventajas
      WHERE activo = true
      ORDER BY orden ASC, id ASC
    `;

    // Obtener imagen hero de encomiendas desde config
    let heroImagen = null;
    try {
      const config = await prisma.$queryRaw`
        SELECT encomiendas_hero_imagen as "encomiendasHeroImagen"
        FROM tbl_configuracion_sistema
        WHERE activo = true
        LIMIT 1
      `;
      if (config && config.length > 0) {
        heroImagen = config[0].encomiendasHeroImagen;
      }
    } catch (e) {
      // Campo puede no existir aun
    }

    res.json({ ventajas, heroImagen });
  } catch (error) {
    console.error('Error obteniendo ventajas encomiendas publicas:', error);
    if (error.code === '42P01' || error.code === '42703') {
      return res.json({ ventajas: [], heroImagen: null });
    }
    res.status(500).json({ error: 'Error al obtener ventajas de encomiendas' });
  }
};

/**
 * Listar todas las ventajas (admin)
 * GET /api/contenido/encomiendas-ventajas
 */
const listar = async (req, res) => {
  try {
    const ventajas = await prisma.$queryRaw`
      SELECT
        id,
        titulo,
        descripcion,
        imagen_path as "imagenPath",
        icono,
        orden,
        activo,
        date_time_registration as "createdAt",
        date_time_modification as "updatedAt"
      FROM tbl_encomiendas_ventajas
      ORDER BY orden ASC, id ASC
    `;

    // Obtener imagen hero
    let heroImagen = null;
    try {
      const config = await prisma.$queryRaw`
        SELECT encomiendas_hero_imagen as "encomiendasHeroImagen"
        FROM tbl_configuracion_sistema
        WHERE activo = true
        LIMIT 1
      `;
      if (config && config.length > 0) {
        heroImagen = config[0].encomiendasHeroImagen;
      }
    } catch (e) {
      // Campo puede no existir aun
    }

    res.json({ ventajas, heroImagen });
  } catch (error) {
    console.error('Error listando ventajas encomiendas:', error);
    if (error.code === '42P01' || error.code === '42703') {
      return res.json({ ventajas: [], heroImagen: null });
    }
    res.status(500).json({ error: 'Error al listar ventajas de encomiendas' });
  }
};

/**
 * Crear ventaja (admin)
 * POST /api/contenido/encomiendas-ventajas
 */
const crear = async (req, res) => {
  try {
    const { titulo, descripcion, icono, orden } = req.body;

    let imagenPath = null;
    if (req.file) {
      imagenPath = await procesarBannerFile(req.file, 'encomienda');
    }

    await prisma.$executeRaw`
      INSERT INTO tbl_encomiendas_ventajas (
        titulo, descripcion, imagen_path, icono, orden, activo,
        user_id_registration, date_time_registration
      ) VALUES (
        ${titulo},
        ${descripcion || null},
        ${imagenPath},
        ${icono || 'Package'},
        ${parseInt(orden) || 0},
        true,
        ${req.user.id},
        NOW()
      )
    `;

    const insertado = await prisma.$queryRaw`
      SELECT
        id, titulo, descripcion,
        imagen_path as "imagenPath",
        icono, orden, activo
      FROM tbl_encomiendas_ventajas
      ORDER BY id DESC
      LIMIT 1
    `;

    await registrarAuditoria(
      req.user.id,
      'ENCOMIENDA_VENTAJA_CREADA',
      'ENCOMIENDAS_VENTAJAS',
      insertado[0].id,
      insertado[0]
    );

    res.status(201).json({
      mensaje: 'Ventaja creada exitosamente',
      ventaja: insertado[0]
    });
  } catch (error) {
    console.error('Error creando ventaja encomienda:', error);
    res.status(500).json({ error: 'Error al crear ventaja' });
  }
};

/**
 * Actualizar ventaja (admin)
 * PUT /api/contenido/encomiendas-ventajas/:id
 */
const actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const { titulo, descripcion, icono, orden } = req.body;

    const ventajaActual = await prisma.$queryRaw`
      SELECT imagen_path as "imagenPath"
      FROM tbl_encomiendas_ventajas
      WHERE id = ${parseInt(id)}
    `;

    if (!ventajaActual || ventajaActual.length === 0) {
      return res.status(404).json({ error: 'Ventaja no encontrada' });
    }

    let imagenPath = ventajaActual[0].imagenPath;

    if (req.file) {
      if (ventajaActual[0].imagenPath) {
        await eliminarArchivoBanner(ventajaActual[0].imagenPath);
      }
      imagenPath = await procesarBannerFile(req.file, 'encomienda');
    }

    const result = await prisma.$queryRaw`
      UPDATE tbl_encomiendas_ventajas SET
        titulo = ${titulo},
        descripcion = ${descripcion || null},
        imagen_path = ${imagenPath},
        icono = ${icono || 'Package'},
        orden = ${parseInt(orden) || 0},
        date_time_modification = NOW(),
        user_id_modification = ${req.user.id}
      WHERE id = ${parseInt(id)}
      RETURNING
        id, titulo, descripcion,
        imagen_path as "imagenPath",
        icono, orden, activo
    `;

    await registrarAuditoria(
      req.user.id,
      'ENCOMIENDA_VENTAJA_ACTUALIZADA',
      'ENCOMIENDAS_VENTAJAS',
      parseInt(id),
      result[0]
    );

    res.json({
      mensaje: 'Ventaja actualizada exitosamente',
      ventaja: result[0]
    });
  } catch (error) {
    console.error('Error actualizando ventaja encomienda:', error);
    res.status(500).json({ error: 'Error al actualizar ventaja' });
  }
};

/**
 * Eliminar ventaja (admin)
 * DELETE /api/contenido/encomiendas-ventajas/:id
 */
const eliminar = async (req, res) => {
  try {
    const { id } = req.params;

    const ventaja = await prisma.$queryRaw`
      SELECT imagen_path as "imagenPath"
      FROM tbl_encomiendas_ventajas
      WHERE id = ${parseInt(id)}
    `;

    if (!ventaja || ventaja.length === 0) {
      return res.status(404).json({ error: 'Ventaja no encontrada' });
    }

    if (ventaja[0].imagenPath) {
      await eliminarArchivoBanner(ventaja[0].imagenPath);
    }

    await prisma.$executeRaw`
      DELETE FROM tbl_encomiendas_ventajas WHERE id = ${parseInt(id)}
    `;

    await registrarAuditoria(
      req.user.id,
      'ENCOMIENDA_VENTAJA_ELIMINADA',
      'ENCOMIENDAS_VENTAJAS',
      parseInt(id),
      { id: parseInt(id) }
    );

    res.json({ mensaje: 'Ventaja eliminada exitosamente' });
  } catch (error) {
    console.error('Error eliminando ventaja encomienda:', error);
    res.status(500).json({ error: 'Error al eliminar ventaja' });
  }
};

/**
 * Toggle activo/inactivo (admin)
 * PATCH /api/contenido/encomiendas-ventajas/:id/toggle
 */
const toggleActivo = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await prisma.$queryRaw`
      UPDATE tbl_encomiendas_ventajas
      SET activo = NOT activo, date_time_modification = NOW(), user_id_modification = ${req.user.id}
      WHERE id = ${parseInt(id)}
      RETURNING id, activo
    `;

    if (!result || result.length === 0) {
      return res.status(404).json({ error: 'Ventaja no encontrada' });
    }

    await registrarAuditoria(
      req.user.id,
      'ENCOMIENDA_VENTAJA_TOGGLE',
      'ENCOMIENDAS_VENTAJAS',
      parseInt(id),
      { activo: result[0].activo }
    );

    res.json({
      mensaje: `Ventaja ${result[0].activo ? 'activada' : 'desactivada'} exitosamente`,
      activo: result[0].activo
    });
  } catch (error) {
    console.error('Error toggling ventaja encomienda:', error);
    res.status(500).json({ error: 'Error al cambiar estado de ventaja' });
  }
};

/**
 * Subir/actualizar imagen hero de encomiendas
 * PUT /api/landing/config/imagen-encomiendas-hero
 */
const subirHeroImagen = async (req, res) => {
  try {
    let imagenPath = null;

    if (req.file) {
      imagenPath = await procesarBannerFile(req.file, 'encomienda');
    } else if (req.body.imagenBase64) {
      const { guardarBannerBase64 } = require('../middleware/bannerUpload');
      imagenPath = await guardarBannerBase64(req.body.imagenBase64, 'encomienda');
    }

    if (!imagenPath) {
      return res.status(400).json({ error: 'Se requiere una imagen' });
    }

    // Obtener imagen anterior para eliminarla
    try {
      const configActual = await prisma.$queryRaw`
        SELECT encomiendas_hero_imagen as "encomiendasHeroImagen"
        FROM tbl_configuracion_sistema
        WHERE activo = true
        LIMIT 1
      `;
      if (configActual?.[0]?.encomiendasHeroImagen) {
        await eliminarArchivoBanner(configActual[0].encomiendasHeroImagen);
      }
    } catch (e) {
      // Campo puede no existir
    }

    await prisma.$executeRaw`
      UPDATE tbl_configuracion_sistema SET
        encomiendas_hero_imagen = ${imagenPath},
        date_time_modification = NOW(),
        user_id_modification = ${req.user.id}
      WHERE activo = true
    `;

    await registrarAuditoria(
      req.user.id,
      'ENCOMIENDAS_HERO_IMAGEN_ACTUALIZADA',
      'CONFIGURACION',
      null,
      { imagenPath }
    );

    res.json({
      mensaje: 'Imagen hero de encomiendas actualizada exitosamente',
      heroImagen: imagenPath
    });
  } catch (error) {
    console.error('Error subiendo imagen hero encomiendas:', error);
    res.status(500).json({ error: 'Error al subir imagen hero de encomiendas' });
  }
};

/**
 * Eliminar imagen hero de encomiendas
 * DELETE /api/landing/config/imagen-encomiendas-hero
 */
const eliminarHeroImagen = async (req, res) => {
  try {
    try {
      const configActual = await prisma.$queryRaw`
        SELECT encomiendas_hero_imagen as "encomiendasHeroImagen"
        FROM tbl_configuracion_sistema
        WHERE activo = true
        LIMIT 1
      `;
      if (configActual?.[0]?.encomiendasHeroImagen) {
        await eliminarArchivoBanner(configActual[0].encomiendasHeroImagen);
      }
    } catch (e) {
      // Campo puede no existir
    }

    await prisma.$executeRaw`
      UPDATE tbl_configuracion_sistema SET
        encomiendas_hero_imagen = NULL,
        date_time_modification = NOW(),
        user_id_modification = ${req.user.id}
      WHERE activo = true
    `;

    await registrarAuditoria(
      req.user.id,
      'ENCOMIENDAS_HERO_IMAGEN_ELIMINADA',
      'CONFIGURACION',
      null,
      {}
    );

    res.json({ mensaje: 'Imagen hero de encomiendas eliminada exitosamente' });
  } catch (error) {
    console.error('Error eliminando imagen hero encomiendas:', error);
    res.status(500).json({ error: 'Error al eliminar imagen hero de encomiendas' });
  }
};

/**
 * Subir/actualizar imagen de la seccion encomiendas en el landing
 * PUT /api/landing/config/imagen-encomiendas-landing
 */
const subirLandingImagen = async (req, res) => {
  try {
    let imagenPath = null;

    if (req.file) {
      imagenPath = await procesarBannerFile(req.file, 'encomienda');
    }

    if (!imagenPath) {
      return res.status(400).json({ error: 'Se requiere una imagen' });
    }

    try {
      const configActual = await prisma.$queryRaw`
        SELECT encomiendas_landing_imagen as "encomiendasLandingImagen"
        FROM tbl_configuracion_sistema
        WHERE activo = true
        LIMIT 1
      `;
      if (configActual?.[0]?.encomiendasLandingImagen) {
        await eliminarArchivoBanner(configActual[0].encomiendasLandingImagen);
      }
    } catch (e) {}

    await prisma.$executeRaw`
      UPDATE tbl_configuracion_sistema SET
        encomiendas_landing_imagen = ${imagenPath},
        date_time_modification = NOW(),
        user_id_modification = ${req.user.id}
      WHERE activo = true
    `;

    await registrarAuditoria(
      req.user.id,
      'ENCOMIENDAS_LANDING_IMAGEN_ACTUALIZADA',
      'CONFIGURACION',
      null,
      { imagenPath }
    );

    res.json({
      mensaje: 'Imagen de encomiendas landing actualizada exitosamente',
      encomiendasLandingImagen: imagenPath
    });
  } catch (error) {
    console.error('Error subiendo imagen encomiendas landing:', error);
    res.status(500).json({ error: 'Error al subir imagen' });
  }
};

/**
 * Eliminar imagen de la seccion encomiendas en el landing
 * DELETE /api/landing/config/imagen-encomiendas-landing
 */
const eliminarLandingImagen = async (req, res) => {
  try {
    try {
      const configActual = await prisma.$queryRaw`
        SELECT encomiendas_landing_imagen as "encomiendasLandingImagen"
        FROM tbl_configuracion_sistema
        WHERE activo = true
        LIMIT 1
      `;
      if (configActual?.[0]?.encomiendasLandingImagen) {
        await eliminarArchivoBanner(configActual[0].encomiendasLandingImagen);
      }
    } catch (e) {}

    await prisma.$executeRaw`
      UPDATE tbl_configuracion_sistema SET
        encomiendas_landing_imagen = NULL,
        date_time_modification = NOW(),
        user_id_modification = ${req.user.id}
      WHERE activo = true
    `;

    await registrarAuditoria(
      req.user.id,
      'ENCOMIENDAS_LANDING_IMAGEN_ELIMINADA',
      'CONFIGURACION',
      null,
      {}
    );

    res.json({ mensaje: 'Imagen de encomiendas landing eliminada exitosamente' });
  } catch (error) {
    console.error('Error eliminando imagen encomiendas landing:', error);
    res.status(500).json({ error: 'Error al eliminar imagen' });
  }
};

module.exports = {
  // Publicos
  getVentajasPublicas,
  // Admin
  listar,
  crear,
  actualizar,
  eliminar,
  toggleActivo,
  subirHeroImagen,
  eliminarHeroImagen,
  subirLandingImagen,
  eliminarLandingImagen
};
