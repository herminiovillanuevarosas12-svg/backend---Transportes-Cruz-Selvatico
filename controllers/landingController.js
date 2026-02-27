/**
 * Landing Controller
 * Controlador para gestión de banners y configuración de landing page
 */

const prisma = require('../config/prisma');
const { registrarAuditoria } = require('../services/auditoriaService');
const { eliminarArchivoBanner, guardarBannerBase64, procesarBannerFile } = require('../middleware/bannerUpload');

/**
 * Obtener banners activos (público)
 * GET /api/public/landing/banners
 */
const getBannersPublicos = async (req, res) => {
  try {
    const hoy = new Date().toISOString().split('T')[0];

    const banners = await prisma.$queryRaw`
      SELECT
        id,
        titulo,
        subtitulo,
        imagen_path as "imagenPath",
        url_destino as "urlDestino",
        orden
      FROM tbl_landing_banners
      WHERE activo = true
        AND (tipo IS NULL OR tipo = 'banner')
        AND (fecha_inicio IS NULL OR fecha_inicio <= ${hoy}::date)
        AND (fecha_fin IS NULL OR fecha_fin >= ${hoy}::date)
      ORDER BY orden ASC, id ASC
    `;

    res.json({ banners });
  } catch (error) {
    console.error('Error obteniendo banners públicos:', error);
    // Si la tabla no existe, retornar array vacío
    if (error.code === '42P01' || error.code === '42703') {
      return res.json({ banners: [] });
    }
    res.status(500).json({ error: 'Error al obtener banners' });
  }
};

/**
 * Obtener galería activa (público)
 * GET /api/public/landing/gallery
 */
const getGaleriaPublica = async (req, res) => {
  try {
    const imagenes = await prisma.$queryRaw`
      SELECT
        id,
        titulo,
        imagen_path as "imagenPath",
        orden
      FROM tbl_landing_banners
      WHERE activo = true
        AND tipo = 'gallery'
      ORDER BY orden ASC, id ASC
    `;

    res.json({ imagenes });
  } catch (error) {
    console.error('Error obteniendo galería pública:', error);
    if (error.code === '42P01' || error.code === '42703') {
      return res.json({ imagenes: [] });
    }
    res.status(500).json({ error: 'Error al obtener galería' });
  }
};

/**
 * Obtener configuración de landing (público)
 * GET /api/public/landing/config
 */
const getConfigLandingPublica = async (req, res) => {
  try {
    const result = await prisma.$queryRaw`
      SELECT
        nombre_empresa as "nombreEmpresa",
        telefono,
        direccion,
        COALESCE(slogan, 'Viaja seguro, envía confiado') as "slogan",
        email_contacto as "emailContacto",
        whatsapp,
        facebook_url as "facebookUrl",
        instagram_url as "instagramUrl",
        youtube_url as "youtubeUrl",
        tiktok_url as "tiktokUrl",
        COALESCE(tiempo_rotacion_banner, 5) as "tiempoRotacionBanner",
        imagen_experiencia as "imagenExperiencia",
        imagen_fondo_experiencia as "imagenFondoExperiencia",
        experiencia_titulo as "experienciaTitulo",
        experiencia_descripcion as "experienciaDescripcion",
        experiencia_badge_numero as "experienciaBadgeNumero",
        experiencia_badge_texto as "experienciaBadgeTexto",
        experiencia_features as "experienciaFeatures",
        experiencia_cta_texto as "experienciaCtaTexto",
        experiencia_cta_link as "experienciaCtaLink",
        encomiendas_landing_titulo as "encomiendasLandingTitulo",
        encomiendas_landing_descripcion as "encomiendasLandingDescripcion",
        encomiendas_landing_imagen as "encomiendasLandingImagen"
      FROM tbl_configuracion_sistema
      WHERE activo = true
      LIMIT 1
    `;

    if (!result || result.length === 0) {
      return res.json({
        config: {
          nombreEmpresa: 'Transportes',
          slogan: 'Viaja seguro, envía confiado',
          tiempoRotacionBanner: 5,
          experienciaCtaTexto: 'VER SERVICIOS',
          experienciaCtaLink: '/rutas-info'
        }
      });
    }

    res.json({ config: result[0] });
  } catch (error) {
    console.error('Error obteniendo config landing:', error);
    // Si hay error de columnas inexistentes, retornar valores básicos
    if (error.code === '42703' || error.code === '42P01') {
      return res.json({
        config: {
          nombreEmpresa: 'Transportes',
          slogan: 'Viaja seguro, envía confiado',
          tiempoRotacionBanner: 5
        }
      });
    }
    res.status(500).json({ error: 'Error al obtener configuración' });
  }
};

/**
 * Listar todos los banners (admin)
 * GET /api/landing/banners?tipo=banner|gallery
 */
const listarBanners = async (req, res) => {
  try {
    const { tipo } = req.query;

    let banners;

    if (tipo) {
      banners = await prisma.$queryRaw`
        SELECT
          id,
          titulo,
          subtitulo,
          imagen_path as "imagenPath",
          url_destino as "urlDestino",
          orden,
          activo,
          COALESCE(tipo, 'banner') as tipo,
          fecha_inicio as "fechaInicio",
          fecha_fin as "fechaFin",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM tbl_landing_banners
        WHERE tipo = ${tipo} OR (tipo IS NULL AND ${tipo} = 'banner')
        ORDER BY orden ASC, id ASC
      `;
    } else {
      banners = await prisma.$queryRaw`
        SELECT
          id,
          titulo,
          subtitulo,
          imagen_path as "imagenPath",
          url_destino as "urlDestino",
          orden,
          activo,
          COALESCE(tipo, 'banner') as tipo,
          fecha_inicio as "fechaInicio",
          fecha_fin as "fechaFin",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM tbl_landing_banners
        ORDER BY tipo ASC, orden ASC, id ASC
      `;
    }

    res.json({ banners });
  } catch (error) {
    console.error('Error listando banners:', error);
    if (error.code === '42P01' || error.code === '42703') {
      return res.json({ banners: [] });
    }
    res.status(500).json({ error: 'Error al listar banners' });
  }
};

/**
 * Crear banner o imagen de galería
 * POST /api/landing/banners
 */
const crearBanner = async (req, res) => {
  try {
    const { titulo, subtitulo, urlDestino, orden, activo, fechaInicio, fechaFin, imagenBase64, tipo } = req.body;

    let imagenPath = null;
    const tipoElemento = tipo || 'banner';

    // Si viene archivo por multer
    if (req.file) {
      imagenPath = await procesarBannerFile(req.file, tipoElemento);
    }
    // Si viene imagen en base64
    else if (imagenBase64) {
      imagenPath = await guardarBannerBase64(imagenBase64, tipoElemento);
    }

    if (!imagenPath) {
      return res.status(400).json({ error: 'Se requiere una imagen para el banner' });
    }

    const result = await prisma.$queryRaw`
      INSERT INTO tbl_landing_banners (
        titulo,
        subtitulo,
        imagen_path,
        url_destino,
        orden,
        activo,
        tipo,
        fecha_inicio,
        fecha_fin,
        user_id_registration,
        created_at,
        updated_at
      ) VALUES (
        ${titulo || null},
        ${subtitulo || null},
        ${imagenPath},
        ${urlDestino || null},
        ${parseInt(orden) || 0},
        ${activo !== false},
        ${tipoElemento},
        ${fechaInicio ? new Date(fechaInicio) : null},
        ${fechaFin ? new Date(fechaFin) : null},
        ${req.user.id},
        NOW(),
        NOW()
      )
      RETURNING
        id,
        titulo,
        subtitulo,
        imagen_path as "imagenPath",
        url_destino as "urlDestino",
        orden,
        activo,
        tipo,
        fecha_inicio as "fechaInicio",
        fecha_fin as "fechaFin"
    `;

    // Auditoría
    await registrarAuditoria(
      req.user.id,
      'BANNER_CREADO',
      'LANDING_BANNERS',
      result[0].id,
      result[0]
    );

    res.status(201).json({
      mensaje: 'Banner creado exitosamente',
      banner: result[0]
    });
  } catch (error) {
    console.error('Error creando banner:', error);
    res.status(500).json({ error: 'Error al crear banner' });
  }
};

/**
 * Actualizar banner o imagen de galería
 * PUT /api/landing/banners/:id
 */
const actualizarBanner = async (req, res) => {
  try {
    const { id } = req.params;
    const { titulo, subtitulo, urlDestino, orden, activo, fechaInicio, fechaFin, imagenBase64, tipo } = req.body;

    // Obtener banner actual para posible eliminación de imagen y tipo
    const bannerActual = await prisma.$queryRaw`
      SELECT imagen_path as "imagenPath", tipo FROM tbl_landing_banners WHERE id = ${parseInt(id)}
    `;

    if (!bannerActual || bannerActual.length === 0) {
      return res.status(404).json({ error: 'Banner no encontrado' });
    }

    let imagenPath = bannerActual[0].imagenPath;
    const tipoElemento = tipo || bannerActual[0].tipo || 'banner';

    // Si viene nueva imagen por multer
    if (req.file) {
      // Eliminar imagen anterior
      await eliminarArchivoBanner(bannerActual[0].imagenPath);
      imagenPath = await procesarBannerFile(req.file, tipoElemento);
    }
    // Si viene nueva imagen en base64
    else if (imagenBase64) {
      // Eliminar imagen anterior
      await eliminarArchivoBanner(bannerActual[0].imagenPath);
      imagenPath = await guardarBannerBase64(imagenBase64, tipoElemento);
    }

    const result = await prisma.$queryRaw`
      UPDATE tbl_landing_banners SET
        titulo = ${titulo || null},
        subtitulo = ${subtitulo || null},
        imagen_path = ${imagenPath},
        url_destino = ${urlDestino || null},
        orden = ${parseInt(orden) || 0},
        activo = ${activo !== false},
        tipo = COALESCE(${tipo || null}, tipo, 'banner'),
        fecha_inicio = ${fechaInicio ? new Date(fechaInicio) : null},
        fecha_fin = ${fechaFin ? new Date(fechaFin) : null},
        updated_at = NOW()
      WHERE id = ${parseInt(id)}
      RETURNING
        id,
        titulo,
        subtitulo,
        imagen_path as "imagenPath",
        url_destino as "urlDestino",
        orden,
        activo,
        tipo,
        fecha_inicio as "fechaInicio",
        fecha_fin as "fechaFin"
    `;

    // Auditoría
    await registrarAuditoria(
      req.user.id,
      'BANNER_ACTUALIZADO',
      'LANDING_BANNERS',
      parseInt(id),
      result[0]
    );

    res.json({
      mensaje: 'Banner actualizado exitosamente',
      banner: result[0]
    });
  } catch (error) {
    console.error('Error actualizando banner:', error);
    res.status(500).json({ error: 'Error al actualizar banner' });
  }
};

/**
 * Eliminar banner
 * DELETE /api/landing/banners/:id
 */
const eliminarBanner = async (req, res) => {
  try {
    const { id } = req.params;

    // Obtener banner para eliminar archivo
    const banner = await prisma.$queryRaw`
      SELECT imagen_path as "imagenPath" FROM tbl_landing_banners WHERE id = ${parseInt(id)}
    `;

    if (!banner || banner.length === 0) {
      return res.status(404).json({ error: 'Banner no encontrado' });
    }

    // Eliminar archivo de imagen
    await eliminarArchivoBanner(banner[0].imagenPath);

    // Eliminar registro
    await prisma.$executeRaw`DELETE FROM tbl_landing_banners WHERE id = ${parseInt(id)}`;

    // Auditoría
    await registrarAuditoria(
      req.user.id,
      'BANNER_ELIMINADO',
      'LANDING_BANNERS',
      parseInt(id),
      { id: parseInt(id) }
    );

    res.json({ mensaje: 'Banner eliminado exitosamente' });
  } catch (error) {
    console.error('Error eliminando banner:', error);
    res.status(500).json({ error: 'Error al eliminar banner' });
  }
};

/**
 * Reordenar banners
 * PUT /api/landing/banners/reorder
 */
const reordenarBanners = async (req, res) => {
  try {
    const { ordenes } = req.body; // Array de { id, orden }

    if (!Array.isArray(ordenes)) {
      return res.status(400).json({ error: 'Se requiere un array de órdenes' });
    }

    // Actualizar cada banner
    for (const item of ordenes) {
      await prisma.$executeRaw`
        UPDATE tbl_landing_banners SET orden = ${item.orden}, updated_at = NOW()
        WHERE id = ${item.id}
      `;
    }

    // Auditoría
    await registrarAuditoria(
      req.user.id,
      'BANNERS_REORDENADOS',
      'LANDING_BANNERS',
      null,
      { ordenes }
    );

    res.json({ mensaje: 'Banners reordenados exitosamente' });
  } catch (error) {
    console.error('Error reordenando banners:', error);
    res.status(500).json({ error: 'Error al reordenar banners' });
  }
};

/**
 * Actualizar configuración de landing
 * PUT /api/configuracion/landing
 */
const actualizarConfigLanding = async (req, res) => {
  try {
    const {
      slogan,
      emailContacto,
      whatsapp,
      facebookUrl,
      instagramUrl,
      youtubeUrl,
      tiktokUrl,
      tiempoRotacionBanner,
      experienciaTitulo,
      experienciaDescripcion,
      experienciaBadgeNumero,
      experienciaBadgeTexto,
      experienciaFeatures,
      experienciaCtaTexto,
      experienciaCtaLink,
      encomiendasLandingTitulo,
      encomiendasLandingDescripcion
    } = req.body;

    // Actualizar campos de landing en configuración activa
    await prisma.$executeRaw`
      UPDATE tbl_configuracion_sistema SET
        slogan = ${slogan || 'Viaja seguro, envía confiado'},
        email_contacto = ${emailContacto || null},
        whatsapp = ${whatsapp || null},
        facebook_url = ${facebookUrl || null},
        instagram_url = ${instagramUrl || null},
        youtube_url = ${youtubeUrl || null},
        tiktok_url = ${tiktokUrl || null},
        tiempo_rotacion_banner = ${parseInt(tiempoRotacionBanner) || 5},
        experiencia_titulo = ${experienciaTitulo || null},
        experiencia_descripcion = ${experienciaDescripcion || null},
        experiencia_badge_numero = ${experienciaBadgeNumero || null},
        experiencia_badge_texto = ${experienciaBadgeTexto || null},
        experiencia_features = ${experienciaFeatures || null},
        experiencia_cta_texto = ${experienciaCtaTexto || 'VER SERVICIOS'},
        experiencia_cta_link = ${experienciaCtaLink || '/rutas-info'},
        encomiendas_landing_titulo = ${encomiendasLandingTitulo || null},
        encomiendas_landing_descripcion = ${encomiendasLandingDescripcion || null},
        date_time_modification = NOW(),
        user_id_modification = ${req.user.id}
      WHERE activo = true
    `;

    // Auditoría
    await registrarAuditoria(
      req.user.id,
      'CONFIG_LANDING_ACTUALIZADA',
      'CONFIGURACION',
      null,
      req.body
    );

    res.json({ mensaje: 'Configuración de landing actualizada exitosamente' });
  } catch (error) {
    console.error('Error actualizando config landing:', error);
    res.status(500).json({ error: 'Error al actualizar configuración de landing' });
  }
};

/**
 * Obtener configuración de landing (admin)
 * GET /api/configuracion/landing
 */
const getConfigLandingAdmin = async (req, res) => {
  try {
    const result = await prisma.$queryRaw`
      SELECT
        COALESCE(slogan, 'Viaja seguro, envía confiado') as "slogan",
        email_contacto as "emailContacto",
        whatsapp,
        facebook_url as "facebookUrl",
        instagram_url as "instagramUrl",
        youtube_url as "youtubeUrl",
        tiktok_url as "tiktokUrl",
        COALESCE(tiempo_rotacion_banner, 5) as "tiempoRotacionBanner",
        imagen_experiencia as "imagenExperiencia",
        imagen_fondo_experiencia as "imagenFondoExperiencia",
        experiencia_titulo as "experienciaTitulo",
        experiencia_descripcion as "experienciaDescripcion",
        experiencia_badge_numero as "experienciaBadgeNumero",
        experiencia_badge_texto as "experienciaBadgeTexto",
        experiencia_features as "experienciaFeatures",
        experiencia_cta_texto as "experienciaCtaTexto",
        experiencia_cta_link as "experienciaCtaLink",
        encomiendas_landing_titulo as "encomiendasLandingTitulo",
        encomiendas_landing_descripcion as "encomiendasLandingDescripcion",
        encomiendas_landing_imagen as "encomiendasLandingImagen"
      FROM tbl_configuracion_sistema
      WHERE activo = true
      LIMIT 1
    `;

    if (!result || result.length === 0) {
      return res.json({
        config: {
          slogan: 'Viaja seguro, envía confiado',
          tiempoRotacionBanner: 5
        }
      });
    }

    res.json({ config: result[0] });
  } catch (error) {
    console.error('Error obteniendo config landing admin:', error);
    if (error.code === '42703') {
      return res.json({
        config: {
          slogan: 'Viaja seguro, envía confiado',
          tiempoRotacionBanner: 5
        }
      });
    }
    res.status(500).json({ error: 'Error al obtener configuración' });
  }
};

/**
 * Subir/actualizar imagen de la sección Experiencia
 * PUT /api/landing/config/imagen-experiencia
 */
const subirImagenExperiencia = async (req, res) => {
  try {
    let imagenPath = null;

    if (req.file) {
      imagenPath = await procesarBannerFile(req.file, 'banner');
    } else if (req.body.imagenBase64) {
      imagenPath = await guardarBannerBase64(req.body.imagenBase64, 'banner');
    }

    if (!imagenPath) {
      return res.status(400).json({ error: 'Se requiere una imagen' });
    }

    // Obtener imagen anterior para eliminarla
    const configActual = await prisma.$queryRaw`
      SELECT imagen_experiencia as "imagenExperiencia"
      FROM tbl_configuracion_sistema
      WHERE activo = true
      LIMIT 1
    `;

    if (configActual?.[0]?.imagenExperiencia) {
      await eliminarArchivoBanner(configActual[0].imagenExperiencia);
    }

    // Actualizar campo
    await prisma.$executeRaw`
      UPDATE tbl_configuracion_sistema SET
        imagen_experiencia = ${imagenPath},
        date_time_modification = NOW(),
        user_id_modification = ${req.user.id}
      WHERE activo = true
    `;

    await registrarAuditoria(
      req.user.id,
      'IMAGEN_EXPERIENCIA_ACTUALIZADA',
      'CONFIGURACION',
      null,
      { imagenPath }
    );

    res.json({
      mensaje: 'Imagen de experiencia actualizada exitosamente',
      imagenExperiencia: imagenPath
    });
  } catch (error) {
    console.error('Error subiendo imagen de experiencia:', error);
    res.status(500).json({ error: 'Error al subir imagen de experiencia' });
  }
};

/**
 * Eliminar imagen de la sección Experiencia
 * DELETE /api/landing/config/imagen-experiencia
 */
const eliminarImagenExperiencia = async (req, res) => {
  try {
    const configActual = await prisma.$queryRaw`
      SELECT imagen_experiencia as "imagenExperiencia"
      FROM tbl_configuracion_sistema
      WHERE activo = true
      LIMIT 1
    `;

    if (configActual?.[0]?.imagenExperiencia) {
      await eliminarArchivoBanner(configActual[0].imagenExperiencia);
    }

    await prisma.$executeRaw`
      UPDATE tbl_configuracion_sistema SET
        imagen_experiencia = NULL,
        date_time_modification = NOW(),
        user_id_modification = ${req.user.id}
      WHERE activo = true
    `;

    await registrarAuditoria(
      req.user.id,
      'IMAGEN_EXPERIENCIA_ELIMINADA',
      'CONFIGURACION',
      null,
      {}
    );

    res.json({ mensaje: 'Imagen de experiencia eliminada' });
  } catch (error) {
    console.error('Error eliminando imagen de experiencia:', error);
    res.status(500).json({ error: 'Error al eliminar imagen de experiencia' });
  }
};

/**
 * Subir/actualizar imagen de FONDO de la sección Experiencia
 * PUT /api/landing/config/imagen-fondo-experiencia
 */
const subirImagenFondoExperiencia = async (req, res) => {
  try {
    let imagenPath = null;

    if (req.file) {
      imagenPath = await procesarBannerFile(req.file, 'banner');
    } else if (req.body.imagenBase64) {
      imagenPath = await guardarBannerBase64(req.body.imagenBase64, 'banner');
    }

    if (!imagenPath) {
      return res.status(400).json({ error: 'Se requiere una imagen' });
    }

    const configActual = await prisma.$queryRaw`
      SELECT imagen_fondo_experiencia as "imagenFondoExperiencia"
      FROM tbl_configuracion_sistema
      WHERE activo = true
      LIMIT 1
    `;

    if (configActual?.[0]?.imagenFondoExperiencia) {
      await eliminarArchivoBanner(configActual[0].imagenFondoExperiencia);
    }

    await prisma.$executeRaw`
      UPDATE tbl_configuracion_sistema SET
        imagen_fondo_experiencia = ${imagenPath},
        date_time_modification = NOW(),
        user_id_modification = ${req.user.id}
      WHERE activo = true
    `;

    await registrarAuditoria(
      req.user.id,
      'IMAGEN_FONDO_EXPERIENCIA_ACTUALIZADA',
      'CONFIGURACION',
      null,
      { imagenPath }
    );

    res.json({
      mensaje: 'Imagen de fondo de experiencia actualizada exitosamente',
      imagenFondoExperiencia: imagenPath
    });
  } catch (error) {
    console.error('Error subiendo imagen de fondo experiencia:', error);
    res.status(500).json({ error: 'Error al subir imagen de fondo de experiencia' });
  }
};

/**
 * Eliminar imagen de FONDO de la sección Experiencia
 * DELETE /api/landing/config/imagen-fondo-experiencia
 */
const eliminarImagenFondoExperiencia = async (req, res) => {
  try {
    const configActual = await prisma.$queryRaw`
      SELECT imagen_fondo_experiencia as "imagenFondoExperiencia"
      FROM tbl_configuracion_sistema
      WHERE activo = true
      LIMIT 1
    `;

    if (configActual?.[0]?.imagenFondoExperiencia) {
      await eliminarArchivoBanner(configActual[0].imagenFondoExperiencia);
    }

    await prisma.$executeRaw`
      UPDATE tbl_configuracion_sistema SET
        imagen_fondo_experiencia = NULL,
        date_time_modification = NOW(),
        user_id_modification = ${req.user.id}
      WHERE activo = true
    `;

    await registrarAuditoria(
      req.user.id,
      'IMAGEN_FONDO_EXPERIENCIA_ELIMINADA',
      'CONFIGURACION',
      null,
      {}
    );

    res.json({ mensaje: 'Imagen de fondo de experiencia eliminada' });
  } catch (error) {
    console.error('Error eliminando imagen de fondo experiencia:', error);
    res.status(500).json({ error: 'Error al eliminar imagen de fondo de experiencia' });
  }
};

/**
 * Obtener iconos de experiencia (público)
 * GET /api/public/experiencia-iconos
 */
const getExperienciaIconosPublicos = async (req, res) => {
  try {
    const iconos = await prisma.$queryRaw`
      SELECT
        id,
        nombre_icono as "nombreIcono",
        etiqueta,
        orden
      FROM tbl_experiencia_iconos
      WHERE activo = true
      ORDER BY orden ASC, id ASC
    `;

    res.json({ iconos });
  } catch (error) {
    console.error('Error obteniendo iconos experiencia:', error);
    if (error.code === '42P01' || error.code === '42703') {
      return res.json({ iconos: [] });
    }
    res.status(500).json({ error: 'Error al obtener iconos de experiencia' });
  }
};

/**
 * Obtener iconos de experiencia (admin)
 * GET /api/landing/experiencia-iconos
 */
const getExperienciaIconosAdmin = async (req, res) => {
  try {
    const iconos = await prisma.$queryRaw`
      SELECT
        id,
        nombre_icono as "nombreIcono",
        etiqueta,
        orden,
        activo
      FROM tbl_experiencia_iconos
      ORDER BY orden ASC, id ASC
    `;

    res.json({ iconos });
  } catch (error) {
    console.error('Error obteniendo iconos experiencia admin:', error);
    if (error.code === '42P01' || error.code === '42703') {
      return res.json({ iconos: [] });
    }
    res.status(500).json({ error: 'Error al obtener iconos de experiencia' });
  }
};

/**
 * Crear icono de experiencia
 * POST /api/landing/experiencia-iconos
 */
const crearExperienciaIcono = async (req, res) => {
  try {
    const { nombreIcono, etiqueta } = req.body;

    if (!nombreIcono) {
      return res.status(400).json({ error: 'El nombre del icono es requerido' });
    }

    // Obtener el máximo orden actual
    const maxOrden = await prisma.$queryRaw`
      SELECT COALESCE(MAX(orden), -1) as max FROM tbl_experiencia_iconos
    `;

    const nuevoOrden = (maxOrden[0]?.max ?? -1) + 1;

    const result = await prisma.$queryRaw`
      INSERT INTO tbl_experiencia_iconos (nombre_icono, etiqueta, orden, activo)
      VALUES (${nombreIcono}, ${etiqueta || null}, ${nuevoOrden}, true)
      RETURNING
        id,
        nombre_icono as "nombreIcono",
        etiqueta,
        orden,
        activo
    `;

    await registrarAuditoria(
      req.user.id,
      'EXPERIENCIA_ICONO_CREADO',
      'EXPERIENCIA_ICONOS',
      result[0].id,
      result[0]
    );

    res.json({
      mensaje: 'Icono creado exitosamente',
      icono: result[0]
    });
  } catch (error) {
    console.error('Error creando icono experiencia:', error);
    res.status(500).json({ error: 'Error al crear icono de experiencia' });
  }
};

/**
 * Actualizar icono de experiencia
 * PUT /api/landing/experiencia-iconos/:id
 */
const actualizarExperienciaIcono = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombreIcono, etiqueta, activo } = req.body;

    if (!nombreIcono) {
      return res.status(400).json({ error: 'El nombre del icono es requerido' });
    }

    const result = await prisma.$queryRaw`
      UPDATE tbl_experiencia_iconos SET
        nombre_icono = ${nombreIcono},
        etiqueta = ${etiqueta || null},
        activo = ${activo !== undefined ? activo : true}
      WHERE id = ${parseInt(id)}
      RETURNING
        id,
        nombre_icono as "nombreIcono",
        etiqueta,
        orden,
        activo
    `;

    if (!result || result.length === 0) {
      return res.status(404).json({ error: 'Icono no encontrado' });
    }

    await registrarAuditoria(
      req.user.id,
      'EXPERIENCIA_ICONO_ACTUALIZADO',
      'EXPERIENCIA_ICONOS',
      parseInt(id),
      result[0]
    );

    res.json({
      mensaje: 'Icono actualizado exitosamente',
      icono: result[0]
    });
  } catch (error) {
    console.error('Error actualizando icono experiencia:', error);
    res.status(500).json({ error: 'Error al actualizar icono de experiencia' });
  }
};

/**
 * Eliminar icono de experiencia
 * DELETE /api/landing/experiencia-iconos/:id
 */
const eliminarExperienciaIcono = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await prisma.$queryRaw`
      DELETE FROM tbl_experiencia_iconos
      WHERE id = ${parseInt(id)}
      RETURNING id
    `;

    if (!result || result.length === 0) {
      return res.status(404).json({ error: 'Icono no encontrado' });
    }

    await registrarAuditoria(
      req.user.id,
      'EXPERIENCIA_ICONO_ELIMINADO',
      'EXPERIENCIA_ICONOS',
      parseInt(id),
      {}
    );

    res.json({ mensaje: 'Icono eliminado exitosamente' });
  } catch (error) {
    console.error('Error eliminando icono experiencia:', error);
    res.status(500).json({ error: 'Error al eliminar icono de experiencia' });
  }
};

// ============================================
// DESTINOS IMAGENES
// ============================================

/**
 * Obtener imágenes de destinos (público)
 * GET /api/public/destinos-imagenes
 */
const getDestinosImagenesPublico = async (req, res) => {
  try {
    const imagenes = await prisma.$queryRaw`
      SELECT id, ciudad, imagen_path as "imagenPath"
      FROM tbl_destinos_imagenes
      ORDER BY ciudad ASC
    `;
    res.json({ imagenes });
  } catch (error) {
    if (error.code === '42P01') return res.json({ imagenes: [] });
    console.error('Error obteniendo imágenes destinos:', error);
    res.status(500).json({ error: 'Error al obtener imágenes de destinos' });
  }
};

/**
 * Obtener banner de destinos (público)
 * GET /api/public/destinos-banner
 */
const getDestinosBannerPublico = async (req, res) => {
  try {
    const result = await prisma.$queryRaw`
      SELECT banner_destinos as "bannerDestinos"
      FROM tbl_configuracion_sistema
      WHERE activo = true
      LIMIT 1
    `;
    res.json({ banner: result?.[0]?.bannerDestinos || null });
  } catch (error) {
    console.error('Error obteniendo banner destinos:', error);
    res.json({ banner: null });
  }
};

/**
 * Listar imágenes de destinos (admin)
 * GET /api/landing/destinos-imagenes
 */
const getDestinosImagenesAdmin = async (req, res) => {
  try {
    const imagenes = await prisma.$queryRaw`
      SELECT id, ciudad, imagen_path as "imagenPath",
             date_time_registration as "fechaCreacion"
      FROM tbl_destinos_imagenes
      ORDER BY ciudad ASC
    `;
    res.json({ imagenes });
  } catch (error) {
    if (error.code === '42P01') return res.json({ imagenes: [] });
    console.error('Error obteniendo imágenes destinos admin:', error);
    res.status(500).json({ error: 'Error al obtener imágenes de destinos' });
  }
};

/**
 * Subir/actualizar imagen de destino
 * POST /api/landing/destinos-imagenes
 * Body: { ciudad } + file/imagenBase64
 */
const subirImagenDestino = async (req, res) => {
  try {
    const { ciudad } = req.body;
    if (!ciudad) return res.status(400).json({ error: 'Ciudad es requerida' });

    let imagenPath = null;
    if (req.file) {
      imagenPath = await procesarBannerFile(req.file, 'banner');
    } else if (req.body.imagenBase64) {
      imagenPath = await guardarBannerBase64(req.body.imagenBase64, 'banner');
    }
    if (!imagenPath) return res.status(400).json({ error: 'Se requiere una imagen' });

    // Obtener imagen anterior si existe
    const anterior = await prisma.$queryRaw`
      SELECT imagen_path as "imagenPath" FROM tbl_destinos_imagenes WHERE ciudad = ${ciudad} LIMIT 1
    `.catch(() => []);

    // Upsert
    const result = await prisma.$queryRaw`
      INSERT INTO tbl_destinos_imagenes (ciudad, imagen_path, date_time_registration, date_time_modification)
      VALUES (${ciudad}, ${imagenPath}, NOW(), NOW())
      ON CONFLICT (ciudad) DO UPDATE SET
        imagen_path = ${imagenPath},
        date_time_modification = NOW()
      RETURNING id, ciudad, imagen_path as "imagenPath"
    `;

    // Eliminar imagen anterior de S3/local
    if (anterior?.[0]?.imagenPath) {
      await eliminarArchivoBanner(anterior[0].imagenPath);
    }

    await registrarAuditoria(req.user.id, 'DESTINO_IMAGEN_SUBIDA', 'DESTINOS_IMAGENES', result[0]?.id, { ciudad });

    res.json({ mensaje: 'Imagen subida exitosamente', imagen: result[0] });
  } catch (error) {
    console.error('Error subiendo imagen destino:', error);
    res.status(500).json({ error: 'Error al subir imagen de destino' });
  }
};

/**
 * Eliminar imagen de destino
 * DELETE /api/landing/destinos-imagenes/:id
 */
const eliminarImagenDestino = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await prisma.$queryRaw`
      DELETE FROM tbl_destinos_imagenes WHERE id = ${parseInt(id)}
      RETURNING id, ciudad, imagen_path as "imagenPath"
    `;
    if (!result || result.length === 0) return res.status(404).json({ error: 'Imagen no encontrada' });

    await eliminarArchivoBanner(result[0].imagenPath);
    await registrarAuditoria(req.user.id, 'DESTINO_IMAGEN_ELIMINADA', 'DESTINOS_IMAGENES', parseInt(id), { ciudad: result[0].ciudad });

    res.json({ mensaje: 'Imagen eliminada exitosamente' });
  } catch (error) {
    console.error('Error eliminando imagen destino:', error);
    res.status(500).json({ error: 'Error al eliminar imagen de destino' });
  }
};

/**
 * Subir banner de página destinos
 * PUT /api/landing/destinos-banner
 */
const subirBannerDestinos = async (req, res) => {
  try {
    let imagenPath = null;
    if (req.file) {
      imagenPath = await procesarBannerFile(req.file, 'banner');
    } else if (req.body.imagenBase64) {
      imagenPath = await guardarBannerBase64(req.body.imagenBase64, 'banner');
    }
    if (!imagenPath) return res.status(400).json({ error: 'Se requiere una imagen' });

    const anterior = await prisma.$queryRaw`
      SELECT banner_destinos as "bannerDestinos" FROM tbl_configuracion_sistema WHERE activo = true LIMIT 1
    `.catch(() => []);

    await prisma.$executeRaw`
      UPDATE tbl_configuracion_sistema SET banner_destinos = ${imagenPath}, date_time_modification = NOW() WHERE activo = true
    `;

    if (anterior?.[0]?.bannerDestinos) {
      await eliminarArchivoBanner(anterior[0].bannerDestinos);
    }

    await registrarAuditoria(req.user.id, 'BANNER_DESTINOS_SUBIDO', 'CONFIGURACION', null, { imagenPath });

    res.json({ mensaje: 'Banner subido exitosamente', bannerPath: imagenPath });
  } catch (error) {
    console.error('Error subiendo banner destinos:', error);
    res.status(500).json({ error: 'Error al subir banner de destinos' });
  }
};

/**
 * Eliminar banner de página destinos
 * DELETE /api/landing/destinos-banner
 */
const eliminarBannerDestinos = async (req, res) => {
  try {
    const result = await prisma.$queryRaw`
      SELECT banner_destinos as "bannerDestinos" FROM tbl_configuracion_sistema WHERE activo = true LIMIT 1
    `;
    if (!result?.[0]?.bannerDestinos) return res.status(404).json({ error: 'No hay banner configurado' });

    await prisma.$executeRaw`
      UPDATE tbl_configuracion_sistema SET banner_destinos = NULL, date_time_modification = NOW() WHERE activo = true
    `;
    await eliminarArchivoBanner(result[0].bannerDestinos);

    await registrarAuditoria(req.user.id, 'BANNER_DESTINOS_ELIMINADO', 'CONFIGURACION', null, {});

    res.json({ mensaje: 'Banner eliminado exitosamente' });
  } catch (error) {
    console.error('Error eliminando banner destinos:', error);
    res.status(500).json({ error: 'Error al eliminar banner de destinos' });
  }
};

module.exports = {
  // Públicos
  getBannersPublicos,
  getGaleriaPublica,
  getConfigLandingPublica,
  getExperienciaIconosPublicos,
  getDestinosImagenesPublico,
  getDestinosBannerPublico,
  // Admin
  listarBanners,
  crearBanner,
  actualizarBanner,
  eliminarBanner,
  reordenarBanners,
  actualizarConfigLanding,
  getConfigLandingAdmin,
  subirImagenExperiencia,
  eliminarImagenExperiencia,
  subirImagenFondoExperiencia,
  eliminarImagenFondoExperiencia,
  getExperienciaIconosAdmin,
  crearExperienciaIcono,
  actualizarExperienciaIcono,
  eliminarExperienciaIcono,
  getDestinosImagenesAdmin,
  subirImagenDestino,
  eliminarImagenDestino,
  subirBannerDestinos,
  eliminarBannerDestinos
};
