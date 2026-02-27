/**
 * Nosotros Controller
 * Controlador para gestion de la pagina Nosotros:
 * - Config mision/vision/hero desde tbl_configuracion_sistema
 * - CRUD valores institucionales desde tbl_nosotros_valores
 */

const prisma = require('../config/prisma');
const { registrarAuditoria } = require('../services/auditoriaService');
const { procesarBannerFile, eliminarArchivoBanner } = require('../middleware/bannerUpload');

/**
 * Obtener datos de Nosotros (publico)
 * GET /api/public/nosotros
 */
const getNosotrosPublico = async (req, res) => {
  try {
    let config = {};
    try {
      const configResult = await prisma.$queryRaw`
        SELECT
          nombre_empresa as "nombreEmpresa",
          slogan,
          nosotros_hero_titulo as "nosotrosHeroTitulo",
          nosotros_hero_subtitulo as "nosotrosHeroSubtitulo",
          nosotros_hero_imagen as "nosotrosHeroImagen",
          nosotros_mision_titulo as "nosotrosMisionTitulo",
          nosotros_mision_texto as "nosotrosMisionTexto",
          nosotros_mision_icono as "nosotrosMisionIcono",
          nosotros_vision_titulo as "nosotrosVisionTitulo",
          nosotros_vision_texto as "nosotrosVisionTexto",
          nosotros_vision_icono as "nosotrosVisionIcono",
          nosotros_valores_titulo as "nosotrosValoresTitulo"
        FROM tbl_configuracion_sistema
        WHERE activo = true
        LIMIT 1
      `;
      if (configResult && configResult.length > 0) {
        config = configResult[0];
      }
    } catch (e) {
      // Campos pueden no existir aun
    }

    let valores = [];
    try {
      valores = await prisma.$queryRaw`
        SELECT
          id,
          titulo,
          imagen_path as "imagenPath",
          orden
        FROM tbl_nosotros_valores
        WHERE activo = true
        ORDER BY orden ASC, id ASC
      `;
    } catch (e) {
      if (e.code !== '42P01' && e.code !== '42703') {
        throw e;
      }
    }

    res.json({ config, valores });
  } catch (error) {
    console.error('Error obteniendo datos de nosotros:', error);
    res.status(500).json({ error: 'Error al obtener datos de nosotros' });
  }
};

/**
 * Listar todos los valores (admin)
 * GET /api/contenido/nosotros/valores
 */
const listarValores = async (req, res) => {
  try {
    const valores = await prisma.$queryRaw`
      SELECT
        id,
        titulo,
        imagen_path as "imagenPath",
        orden,
        activo,
        date_time_registration as "createdAt",
        date_time_modification as "updatedAt"
      FROM tbl_nosotros_valores
      ORDER BY orden ASC, id ASC
    `;

    // Obtener config nosotros
    let config = {};
    try {
      const configResult = await prisma.$queryRaw`
        SELECT
          nosotros_hero_titulo as "nosotrosHeroTitulo",
          nosotros_hero_subtitulo as "nosotrosHeroSubtitulo",
          nosotros_hero_imagen as "nosotrosHeroImagen",
          nosotros_mision_titulo as "nosotrosMisionTitulo",
          nosotros_mision_texto as "nosotrosMisionTexto",
          nosotros_mision_icono as "nosotrosMisionIcono",
          nosotros_vision_titulo as "nosotrosVisionTitulo",
          nosotros_vision_texto as "nosotrosVisionTexto",
          nosotros_vision_icono as "nosotrosVisionIcono",
          nosotros_valores_titulo as "nosotrosValoresTitulo"
        FROM tbl_configuracion_sistema
        WHERE activo = true
        LIMIT 1
      `;
      if (configResult && configResult.length > 0) {
        config = configResult[0];
      }
    } catch (e) {
      // Campos pueden no existir aun
    }

    res.json({ valores, config });
  } catch (error) {
    console.error('Error listando valores nosotros:', error);
    if (error.code === '42P01' || error.code === '42703') {
      return res.json({ valores: [], config: {} });
    }
    res.status(500).json({ error: 'Error al listar valores' });
  }
};

/**
 * Crear valor institucional (admin)
 * POST /api/contenido/nosotros/valores
 */
const crearValor = async (req, res) => {
  try {
    const { titulo, orden } = req.body;

    if (!titulo || titulo.trim() === '') {
      return res.status(400).json({ error: 'El titulo es requerido' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'La imagen es requerida' });
    }

    const imagenPath = await procesarBannerFile(req.file, 'nosotros-valor');

    await prisma.$executeRaw`
      INSERT INTO tbl_nosotros_valores (
        titulo, imagen_path, orden, activo,
        user_id_registration, date_time_registration
      ) VALUES (
        ${titulo.trim()},
        ${imagenPath},
        ${parseInt(orden) || 0},
        true,
        ${req.user.id},
        NOW()
      )
    `;

    const insertado = await prisma.$queryRaw`
      SELECT
        id, titulo,
        imagen_path as "imagenPath",
        orden, activo
      FROM tbl_nosotros_valores
      ORDER BY id DESC
      LIMIT 1
    `;

    await registrarAuditoria(
      req.user.id,
      'NOSOTROS_VALOR_CREADO',
      'NOSOTROS_VALORES',
      insertado[0].id,
      insertado[0]
    );

    res.status(201).json({
      mensaje: 'Valor creado exitosamente',
      valor: insertado[0]
    });
  } catch (error) {
    console.error('Error creando valor nosotros:', error);
    res.status(500).json({ error: 'Error al crear valor' });
  }
};

/**
 * Actualizar valor institucional (admin)
 * PUT /api/contenido/nosotros/valores/:id
 */
const actualizarValor = async (req, res) => {
  try {
    const { id } = req.params;
    const { titulo, orden } = req.body;

    const valorActual = await prisma.$queryRaw`
      SELECT imagen_path as "imagenPath"
      FROM tbl_nosotros_valores
      WHERE id = ${parseInt(id)}
    `;

    if (!valorActual || valorActual.length === 0) {
      return res.status(404).json({ error: 'Valor no encontrado' });
    }

    let imagenPath = valorActual[0].imagenPath;

    if (req.file) {
      if (valorActual[0].imagenPath) {
        await eliminarArchivoBanner(valorActual[0].imagenPath);
      }
      imagenPath = await procesarBannerFile(req.file, 'nosotros-valor');
    }

    const result = await prisma.$queryRaw`
      UPDATE tbl_nosotros_valores SET
        titulo = ${titulo ? titulo.trim() : valorActual[0].titulo},
        imagen_path = ${imagenPath},
        orden = ${parseInt(orden) || 0},
        date_time_modification = NOW(),
        user_id_modification = ${req.user.id}
      WHERE id = ${parseInt(id)}
      RETURNING
        id, titulo,
        imagen_path as "imagenPath",
        orden, activo
    `;

    await registrarAuditoria(
      req.user.id,
      'NOSOTROS_VALOR_ACTUALIZADO',
      'NOSOTROS_VALORES',
      parseInt(id),
      result[0]
    );

    res.json({
      mensaje: 'Valor actualizado exitosamente',
      valor: result[0]
    });
  } catch (error) {
    console.error('Error actualizando valor nosotros:', error);
    res.status(500).json({ error: 'Error al actualizar valor' });
  }
};

/**
 * Eliminar valor institucional (admin)
 * DELETE /api/contenido/nosotros/valores/:id
 */
const eliminarValor = async (req, res) => {
  try {
    const { id } = req.params;

    const valor = await prisma.$queryRaw`
      SELECT imagen_path as "imagenPath"
      FROM tbl_nosotros_valores
      WHERE id = ${parseInt(id)}
    `;

    if (!valor || valor.length === 0) {
      return res.status(404).json({ error: 'Valor no encontrado' });
    }

    if (valor[0].imagenPath) {
      await eliminarArchivoBanner(valor[0].imagenPath);
    }

    await prisma.$executeRaw`
      DELETE FROM tbl_nosotros_valores WHERE id = ${parseInt(id)}
    `;

    await registrarAuditoria(
      req.user.id,
      'NOSOTROS_VALOR_ELIMINADO',
      'NOSOTROS_VALORES',
      parseInt(id),
      { id: parseInt(id) }
    );

    res.json({ mensaje: 'Valor eliminado exitosamente' });
  } catch (error) {
    console.error('Error eliminando valor nosotros:', error);
    res.status(500).json({ error: 'Error al eliminar valor' });
  }
};

/**
 * Toggle activo/inactivo (admin)
 * PATCH /api/contenido/nosotros/valores/:id/toggle
 */
const toggleValor = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await prisma.$queryRaw`
      UPDATE tbl_nosotros_valores
      SET activo = NOT activo, date_time_modification = NOW(), user_id_modification = ${req.user.id}
      WHERE id = ${parseInt(id)}
      RETURNING id, activo
    `;

    if (!result || result.length === 0) {
      return res.status(404).json({ error: 'Valor no encontrado' });
    }

    await registrarAuditoria(
      req.user.id,
      'NOSOTROS_VALOR_TOGGLE',
      'NOSOTROS_VALORES',
      parseInt(id),
      { activo: result[0].activo }
    );

    res.json({
      mensaje: `Valor ${result[0].activo ? 'activado' : 'desactivado'} exitosamente`,
      activo: result[0].activo
    });
  } catch (error) {
    console.error('Error toggling valor nosotros:', error);
    res.status(500).json({ error: 'Error al cambiar estado del valor' });
  }
};

/**
 * Actualizar configuracion de Nosotros (mision, vision, titulos)
 * PUT /api/contenido/nosotros/config
 */
const actualizarConfigNosotros = async (req, res) => {
  try {
    const {
      nosotrosHeroTitulo,
      nosotrosHeroSubtitulo,
      nosotrosMisionTitulo,
      nosotrosMisionTexto,
      nosotrosMisionIcono,
      nosotrosVisionTitulo,
      nosotrosVisionTexto,
      nosotrosVisionIcono,
      nosotrosValoresTitulo
    } = req.body;

    await prisma.$executeRaw`
      UPDATE tbl_configuracion_sistema SET
        nosotros_hero_titulo = ${nosotrosHeroTitulo || 'Nosotros'},
        nosotros_hero_subtitulo = ${nosotrosHeroSubtitulo || 'Conocenos'},
        nosotros_mision_titulo = ${nosotrosMisionTitulo || 'Mision'},
        nosotros_mision_texto = ${nosotrosMisionTexto || null},
        nosotros_mision_icono = ${nosotrosMisionIcono || 'Bus'},
        nosotros_vision_titulo = ${nosotrosVisionTitulo || 'Vision'},
        nosotros_vision_texto = ${nosotrosVisionTexto || null},
        nosotros_vision_icono = ${nosotrosVisionIcono || 'Route'},
        nosotros_valores_titulo = ${nosotrosValoresTitulo || 'Valores institucionales'},
        date_time_modification = NOW(),
        user_id_modification = ${req.user.id}
      WHERE activo = true
    `;

    await registrarAuditoria(
      req.user.id,
      'NOSOTROS_CONFIG_ACTUALIZADA',
      'CONFIGURACION',
      null,
      req.body
    );

    res.json({ mensaje: 'Configuracion de Nosotros actualizada exitosamente' });
  } catch (error) {
    console.error('Error actualizando config nosotros:', error);
    res.status(500).json({ error: 'Error al actualizar configuracion de nosotros' });
  }
};

/**
 * Subir imagen hero de Nosotros
 * PUT /api/contenido/nosotros/hero
 */
const subirHeroNosotros = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Se requiere una imagen' });
    }

    const imagenPath = await procesarBannerFile(req.file, 'nosotros-hero');

    // Eliminar imagen anterior
    try {
      const configActual = await prisma.$queryRaw`
        SELECT nosotros_hero_imagen as "nosotrosHeroImagen"
        FROM tbl_configuracion_sistema
        WHERE activo = true
        LIMIT 1
      `;
      if (configActual?.[0]?.nosotrosHeroImagen) {
        await eliminarArchivoBanner(configActual[0].nosotrosHeroImagen);
      }
    } catch (e) {
      // Campo puede no existir
    }

    await prisma.$executeRaw`
      UPDATE tbl_configuracion_sistema SET
        nosotros_hero_imagen = ${imagenPath},
        date_time_modification = NOW(),
        user_id_modification = ${req.user.id}
      WHERE activo = true
    `;

    await registrarAuditoria(
      req.user.id,
      'NOSOTROS_HERO_IMAGEN_ACTUALIZADA',
      'CONFIGURACION',
      null,
      { imagenPath }
    );

    res.json({
      mensaje: 'Imagen hero de Nosotros actualizada exitosamente',
      heroImagen: imagenPath
    });
  } catch (error) {
    console.error('Error subiendo imagen hero nosotros:', error);
    res.status(500).json({ error: 'Error al subir imagen hero de nosotros' });
  }
};

/**
 * Eliminar imagen hero de Nosotros
 * DELETE /api/contenido/nosotros/hero
 */
const eliminarHeroNosotros = async (req, res) => {
  try {
    try {
      const configActual = await prisma.$queryRaw`
        SELECT nosotros_hero_imagen as "nosotrosHeroImagen"
        FROM tbl_configuracion_sistema
        WHERE activo = true
        LIMIT 1
      `;
      if (configActual?.[0]?.nosotrosHeroImagen) {
        await eliminarArchivoBanner(configActual[0].nosotrosHeroImagen);
      }
    } catch (e) {
      // Campo puede no existir
    }

    await prisma.$executeRaw`
      UPDATE tbl_configuracion_sistema SET
        nosotros_hero_imagen = NULL,
        date_time_modification = NOW(),
        user_id_modification = ${req.user.id}
      WHERE activo = true
    `;

    await registrarAuditoria(
      req.user.id,
      'NOSOTROS_HERO_IMAGEN_ELIMINADA',
      'CONFIGURACION',
      null,
      {}
    );

    res.json({ mensaje: 'Imagen hero de Nosotros eliminada exitosamente' });
  } catch (error) {
    console.error('Error eliminando imagen hero nosotros:', error);
    res.status(500).json({ error: 'Error al eliminar imagen hero de nosotros' });
  }
};

module.exports = {
  // Publicos
  getNosotrosPublico,
  // Admin
  listarValores,
  crearValor,
  actualizarValor,
  eliminarValor,
  toggleValor,
  actualizarConfigNosotros,
  subirHeroNosotros,
  eliminarHeroNosotros
};
