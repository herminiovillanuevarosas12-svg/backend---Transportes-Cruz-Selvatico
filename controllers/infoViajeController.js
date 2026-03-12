/**
 * Info Viaje Controller
 * Controlador para gestion de items/cards e imagen hero de la pagina info-viaje
 */

const prisma = require('../config/prisma');
const { registrarAuditoria } = require('../services/auditoriaService');
const { procesarBannerFile, eliminarArchivoBanner } = require('../middleware/bannerUpload');

/**
 * Obtener items publicos activos + config hero
 * GET /api/public/info-viaje-items
 */
const getItemsPublicos = async (req, res) => {
  try {
    const items = await prisma.$queryRaw`
      SELECT
        id,
        titulo,
        descripcion,
        imagen_path as "imagenPath",
        icono,
        orden
      FROM tbl_info_viaje_items
      WHERE activo = true
      ORDER BY orden ASC, id ASC
    `;

    let heroImagen = null;
    let titulo = 'Info para tu viaje';
    let subtitulo = 'Información';

    try {
      const config = await prisma.$queryRaw`
        SELECT
          info_viaje_hero_imagen as "heroImagen",
          info_viaje_titulo as "titulo",
          info_viaje_subtitulo as "subtitulo"
        FROM tbl_configuracion_sistema
        WHERE activo = true
        LIMIT 1
      `;
      if (config && config.length > 0) {
        heroImagen = config[0].heroImagen;
        titulo = config[0].titulo || titulo;
        subtitulo = config[0].subtitulo || subtitulo;
      }
    } catch (e) {
      // Campos pueden no existir aun
    }

    res.json({ items, heroImagen, titulo, subtitulo });
  } catch (error) {
    console.error('Error obteniendo items info-viaje publicos:', error);
    if (error.code === '42P01' || error.code === '42703') {
      return res.json({ items: [], heroImagen: null, titulo: 'Info para tu viaje', subtitulo: 'Información' });
    }
    res.status(500).json({ error: 'Error al obtener items de info viaje' });
  }
};

/**
 * Listar todos los items (admin)
 * GET /api/contenido/info-viaje-items
 */
const listar = async (req, res) => {
  try {
    const items = await prisma.$queryRaw`
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
      FROM tbl_info_viaje_items
      ORDER BY orden ASC, id ASC
    `;

    let heroImagen = null;
    let titulo = 'Info para tu viaje';
    let subtitulo = 'Información';

    try {
      const config = await prisma.$queryRaw`
        SELECT
          info_viaje_hero_imagen as "heroImagen",
          info_viaje_titulo as "titulo",
          info_viaje_subtitulo as "subtitulo"
        FROM tbl_configuracion_sistema
        WHERE activo = true
        LIMIT 1
      `;
      if (config && config.length > 0) {
        heroImagen = config[0].heroImagen;
        titulo = config[0].titulo || titulo;
        subtitulo = config[0].subtitulo || subtitulo;
      }
    } catch (e) {
      // Campos pueden no existir aun
    }

    res.json({ items, heroImagen, titulo, subtitulo });
  } catch (error) {
    console.error('Error listando items info-viaje:', error);
    if (error.code === '42P01' || error.code === '42703') {
      return res.json({ items: [], heroImagen: null, titulo: 'Info para tu viaje', subtitulo: 'Información' });
    }
    res.status(500).json({ error: 'Error al listar items de info viaje' });
  }
};

/**
 * Crear item (admin)
 * POST /api/contenido/info-viaje-items
 */
const crear = async (req, res) => {
  try {
    const { titulo, descripcion, icono, orden } = req.body;

    let imagenPath = null;
    if (req.file) {
      imagenPath = await procesarBannerFile(req.file, 'info-viaje');
    }

    await prisma.$executeRaw`
      INSERT INTO tbl_info_viaje_items (
        titulo, descripcion, imagen_path, icono, orden, activo,
        user_id_registration, date_time_registration
      ) VALUES (
        ${titulo},
        ${descripcion || null},
        ${imagenPath},
        ${icono || 'Info'},
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
      FROM tbl_info_viaje_items
      ORDER BY id DESC
      LIMIT 1
    `;

    await registrarAuditoria(
      req.user.id,
      'INFO_VIAJE_ITEM_CREADO',
      'INFO_VIAJE_ITEMS',
      insertado[0].id,
      insertado[0]
    );

    res.status(201).json({
      mensaje: 'Item creado exitosamente',
      item: insertado[0]
    });
  } catch (error) {
    console.error('Error creando item info-viaje:', error);
    res.status(500).json({ error: 'Error al crear item' });
  }
};

/**
 * Actualizar item (admin)
 * PUT /api/contenido/info-viaje-items/:id
 */
const actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const { titulo, descripcion, icono, orden } = req.body;

    const itemActual = await prisma.$queryRaw`
      SELECT imagen_path as "imagenPath"
      FROM tbl_info_viaje_items
      WHERE id = ${parseInt(id)}
    `;

    if (!itemActual || itemActual.length === 0) {
      return res.status(404).json({ error: 'Item no encontrado' });
    }

    let imagenPath = itemActual[0].imagenPath;

    if (req.file) {
      if (itemActual[0].imagenPath) {
        await eliminarArchivoBanner(itemActual[0].imagenPath);
      }
      imagenPath = await procesarBannerFile(req.file, 'info-viaje');
    }

    const result = await prisma.$queryRaw`
      UPDATE tbl_info_viaje_items SET
        titulo = ${titulo},
        descripcion = ${descripcion || null},
        imagen_path = ${imagenPath},
        icono = ${icono || 'Info'},
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
      'INFO_VIAJE_ITEM_ACTUALIZADO',
      'INFO_VIAJE_ITEMS',
      parseInt(id),
      result[0]
    );

    res.json({
      mensaje: 'Item actualizado exitosamente',
      item: result[0]
    });
  } catch (error) {
    console.error('Error actualizando item info-viaje:', error);
    res.status(500).json({ error: 'Error al actualizar item' });
  }
};

/**
 * Eliminar item (admin)
 * DELETE /api/contenido/info-viaje-items/:id
 */
const eliminar = async (req, res) => {
  try {
    const { id } = req.params;

    const item = await prisma.$queryRaw`
      SELECT imagen_path as "imagenPath"
      FROM tbl_info_viaje_items
      WHERE id = ${parseInt(id)}
    `;

    if (!item || item.length === 0) {
      return res.status(404).json({ error: 'Item no encontrado' });
    }

    if (item[0].imagenPath) {
      await eliminarArchivoBanner(item[0].imagenPath);
    }

    await prisma.$executeRaw`
      DELETE FROM tbl_info_viaje_items WHERE id = ${parseInt(id)}
    `;

    await registrarAuditoria(
      req.user.id,
      'INFO_VIAJE_ITEM_ELIMINADO',
      'INFO_VIAJE_ITEMS',
      parseInt(id),
      { id: parseInt(id) }
    );

    res.json({ mensaje: 'Item eliminado exitosamente' });
  } catch (error) {
    console.error('Error eliminando item info-viaje:', error);
    res.status(500).json({ error: 'Error al eliminar item' });
  }
};

/**
 * Toggle activo/inactivo (admin)
 * PATCH /api/contenido/info-viaje-items/:id/toggle
 */
const toggleActivo = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await prisma.$queryRaw`
      UPDATE tbl_info_viaje_items
      SET activo = NOT activo, date_time_modification = NOW(), user_id_modification = ${req.user.id}
      WHERE id = ${parseInt(id)}
      RETURNING id, activo
    `;

    if (!result || result.length === 0) {
      return res.status(404).json({ error: 'Item no encontrado' });
    }

    await registrarAuditoria(
      req.user.id,
      'INFO_VIAJE_ITEM_TOGGLE',
      'INFO_VIAJE_ITEMS',
      parseInt(id),
      { activo: result[0].activo }
    );

    res.json({
      mensaje: `Item ${result[0].activo ? 'activado' : 'desactivado'} exitosamente`,
      activo: result[0].activo
    });
  } catch (error) {
    console.error('Error toggling item info-viaje:', error);
    res.status(500).json({ error: 'Error al cambiar estado del item' });
  }
};

/**
 * Subir/actualizar imagen hero de info viaje
 * PUT /api/landing/config/imagen-info-viaje-hero
 */
const subirHeroImagen = async (req, res) => {
  try {
    let imagenPath = null;

    if (req.file) {
      imagenPath = await procesarBannerFile(req.file, 'info-viaje');
    } else if (req.body.imagenBase64) {
      const { guardarBannerBase64 } = require('../middleware/bannerUpload');
      imagenPath = await guardarBannerBase64(req.body.imagenBase64, 'info-viaje');
    }

    if (!imagenPath) {
      return res.status(400).json({ error: 'Se requiere una imagen' });
    }

    try {
      const configActual = await prisma.$queryRaw`
        SELECT info_viaje_hero_imagen as "heroImagen"
        FROM tbl_configuracion_sistema
        WHERE activo = true
        LIMIT 1
      `;
      if (configActual?.[0]?.heroImagen) {
        await eliminarArchivoBanner(configActual[0].heroImagen);
      }
    } catch (e) {
      // Campo puede no existir
    }

    await prisma.$executeRaw`
      UPDATE tbl_configuracion_sistema SET
        info_viaje_hero_imagen = ${imagenPath},
        date_time_modification = NOW(),
        user_id_modification = ${req.user.id}
      WHERE activo = true
    `;

    await registrarAuditoria(
      req.user.id,
      'INFO_VIAJE_HERO_IMAGEN_ACTUALIZADA',
      'CONFIGURACION',
      null,
      { imagenPath }
    );

    res.json({
      mensaje: 'Imagen hero de info viaje actualizada exitosamente',
      heroImagen: imagenPath
    });
  } catch (error) {
    console.error('Error subiendo imagen hero info-viaje:', error);
    res.status(500).json({ error: 'Error al subir imagen hero de info viaje' });
  }
};

/**
 * Eliminar imagen hero de info viaje
 * DELETE /api/landing/config/imagen-info-viaje-hero
 */
const eliminarHeroImagen = async (req, res) => {
  try {
    try {
      const configActual = await prisma.$queryRaw`
        SELECT info_viaje_hero_imagen as "heroImagen"
        FROM tbl_configuracion_sistema
        WHERE activo = true
        LIMIT 1
      `;
      if (configActual?.[0]?.heroImagen) {
        await eliminarArchivoBanner(configActual[0].heroImagen);
      }
    } catch (e) {
      // Campo puede no existir
    }

    await prisma.$executeRaw`
      UPDATE tbl_configuracion_sistema SET
        info_viaje_hero_imagen = NULL,
        date_time_modification = NOW(),
        user_id_modification = ${req.user.id}
      WHERE activo = true
    `;

    await registrarAuditoria(
      req.user.id,
      'INFO_VIAJE_HERO_IMAGEN_ELIMINADA',
      'CONFIGURACION',
      null,
      {}
    );

    res.json({ mensaje: 'Imagen hero de info viaje eliminada exitosamente' });
  } catch (error) {
    console.error('Error eliminando imagen hero info-viaje:', error);
    res.status(500).json({ error: 'Error al eliminar imagen hero de info viaje' });
  }
};

/**
 * Actualizar titulo y subtitulo del hero info viaje
 * PUT /api/landing/config/info-viaje
 */
const actualizarConfig = async (req, res) => {
  try {
    const { titulo, subtitulo } = req.body;

    await prisma.$executeRaw`
      UPDATE tbl_configuracion_sistema SET
        info_viaje_titulo = ${titulo || 'Info para tu viaje'},
        info_viaje_subtitulo = ${subtitulo || 'Información'},
        date_time_modification = NOW(),
        user_id_modification = ${req.user.id}
      WHERE activo = true
    `;

    await registrarAuditoria(
      req.user.id,
      'INFO_VIAJE_CONFIG_ACTUALIZADA',
      'CONFIGURACION',
      null,
      { titulo, subtitulo }
    );

    res.json({
      mensaje: 'Configuracion de info viaje actualizada exitosamente',
      titulo: titulo || 'Info para tu viaje',
      subtitulo: subtitulo || 'Información'
    });
  } catch (error) {
    console.error('Error actualizando config info-viaje:', error);
    res.status(500).json({ error: 'Error al actualizar configuracion de info viaje' });
  }
};

module.exports = {
  // Publicos
  getItemsPublicos,
  // Admin
  listar,
  crear,
  actualizar,
  eliminar,
  toggleActivo,
  subirHeroImagen,
  eliminarHeroImagen,
  actualizarConfig
};
