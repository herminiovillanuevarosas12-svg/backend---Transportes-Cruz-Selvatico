/**
 * Destinos Publicos Controller
 * Controlador para gestion de destinos y festividades asociadas
 */

const prisma = require('../config/prisma');
const { registrarAuditoria } = require('../services/auditoriaService');
const { procesarBannerFile, eliminarArchivoBanner } = require('../middleware/bannerUpload');

/**
 * Obtener destinos publicos con paginacion
 * GET /api/public/destinos?page=1&limit=12&busqueda=texto
 */
const getDestinosPublicos = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const offset = (page - 1) * limit;
    const busqueda = req.query.busqueda || null;

    let totalResult;
    let destinos;

    if (busqueda) {
      const patron = `%${busqueda}%`;

      totalResult = await prisma.$queryRaw`
        SELECT COUNT(*)::int as total
        FROM tbl_destinos_publicos
        WHERE activo = true AND nombre ILIKE ${patron}
      `;

      destinos = await prisma.$queryRaw`
        SELECT
          id,
          slug,
          nombre,
          subtitulo,
          imagen_path as "imagenPath",
          precio_desde as "precioDesde",
          servicios_disponibles as "serviciosDisponibles",
          orden
        FROM tbl_destinos_publicos
        WHERE activo = true AND nombre ILIKE ${patron}
        ORDER BY orden ASC, id ASC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else {
      totalResult = await prisma.$queryRaw`
        SELECT COUNT(*)::int as total
        FROM tbl_destinos_publicos
        WHERE activo = true
      `;

      destinos = await prisma.$queryRaw`
        SELECT
          id,
          slug,
          nombre,
          subtitulo,
          imagen_path as "imagenPath",
          precio_desde as "precioDesde",
          servicios_disponibles as "serviciosDisponibles",
          orden
        FROM tbl_destinos_publicos
        WHERE activo = true
        ORDER BY orden ASC, id ASC
        LIMIT ${limit} OFFSET ${offset}
      `;
    }

    const total = totalResult[0].total;
    const totalPages = Math.ceil(total / limit);

    res.json({
      destinos,
      total,
      page,
      totalPages
    });
  } catch (error) {
    console.error('Error obteniendo destinos publicos:', error);
    const pgCode = error.code || error.meta?.code;
    if (pgCode === '42P01' || pgCode === '42703' || pgCode === 'P2010') {
      return res.json({ destinos: [], total: 0, page: 1, totalPages: 0 });
    }
    res.status(500).json({ error: 'Error al obtener destinos' });
  }
};

/**
 * Obtener destino por slug con festividades (publico)
 * GET /api/public/destinos/:slug
 */
const getDestinoBySlug = async (req, res) => {
  try {
    const { slug } = req.params;

    const result = await prisma.$queryRaw`
      SELECT
        id,
        slug,
        nombre,
        subtitulo,
        descripcion,
        imagen_path as "imagenPath",
        precio_desde as "precioDesde",
        servicios_disponibles as "serviciosDisponibles",
        orden,
        id_punto as "idPunto",
        direccion_terminal as "direccionTerminal",
        telefono_terminal as "telefonoTerminal",
        horarios_atencion as "horariosAtencion",
        altitud,
        temperatura,
        tiempo_viaje as "tiempoViaje",
        imagen_atractivos as "imagenAtractivos",
        descripcion_atractivos as "descripcionAtractivos"
      FROM tbl_destinos_publicos
      WHERE slug = ${slug} AND activo = true
    `;

    if (!result || result.length === 0) {
      return res.status(404).json({ error: 'Destino no encontrado' });
    }

    const destino = result[0];

    // Jalar festividades por id_punto (vinculo por ID, no por string)
    const festividades = destino.idPunto ? await prisma.$queryRaw`
      SELECT DISTINCT ON (f.id)
        f.id,
        f.titulo,
        f.descripcion,
        f.orden,
        (
          SELECT fi.imagen_path
          FROM tbl_festividades_imagenes fi
          WHERE fi.id_festividad = f.id
          ORDER BY fi.orden ASC, fi.id ASC
          LIMIT 1
        ) as "imagenPath"
      FROM tbl_festividades f
      WHERE f.activo = true AND f.id_punto = ${destino.idPunto}
      ORDER BY f.id DESC
    ` : [];

    res.json({
      destino: {
        ...destino,
        festividades
      }
    });
  } catch (error) {
    console.error('Error obteniendo destino por slug:', error);
    res.status(500).json({ error: 'Error al obtener destino' });
  }
};

/**
 * Listar todos los destinos (admin)
 * GET /api/destinos
 */
const listar = async (req, res) => {
  try {
    const destinos = await prisma.$queryRaw`
      SELECT
        id,
        slug,
        nombre,
        subtitulo,
        descripcion,
        imagen_path as "imagenPath",
        precio_desde as "precioDesde",
        servicios_disponibles as "serviciosDisponibles",
        orden,
        activo,
        id_punto as "idPunto",
        direccion_terminal as "direccionTerminal",
        telefono_terminal as "telefonoTerminal",
        horarios_atencion as "horariosAtencion",
        altitud,
        temperatura,
        tiempo_viaje as "tiempoViaje",
        imagen_atractivos as "imagenAtractivos",
        descripcion_atractivos as "descripcionAtractivos",
        date_time_registration as "createdAt",
        date_time_modification as "updatedAt"
      FROM tbl_destinos_publicos
      ORDER BY orden ASC, id ASC
    `;

    res.json({ destinos });
  } catch (error) {
    console.error('Error listando destinos:', error);
    const pgCode = error.code || error.meta?.code;
    if (pgCode === '42P01' || pgCode === '42703' || pgCode === 'P2010') {
      return res.json({ destinos: [] });
    }
    res.status(500).json({ error: 'Error al listar destinos' });
  }
};

/**
 * Crear destino (admin)
 * POST /api/destinos
 */
const crear = async (req, res) => {
  try {
    const { slug, nombre, subtitulo, descripcion, precioDesde, serviciosDisponibles, orden, direccionTerminal, telefonoTerminal, horariosAtencion, altitud, temperatura, tiempoViaje, descripcionAtractivos, idPunto } = req.body;

    // Derivar nombre del punto si se envió idPunto
    let nombreFinal = nombre;
    const idPuntoInt = idPunto ? parseInt(idPunto) : null;
    if (idPuntoInt) {
      const punto = await prisma.$queryRaw`SELECT ciudad FROM tbl_puntos WHERE id = ${idPuntoInt}`;
      if (punto.length > 0) {
        nombreFinal = punto[0].ciudad.trim();
      }
    }

    let imagenPath = null;
    let imagenAtractivos = null;

    if (req.files?.imagen?.[0]) {
      imagenPath = await procesarBannerFile(req.files.imagen[0], 'banner');
    }
    if (req.files?.imagenAtractivos?.[0]) {
      imagenAtractivos = await procesarBannerFile(req.files.imagenAtractivos[0], 'banner');
    }

    await prisma.$executeRaw`
      INSERT INTO tbl_destinos_publicos (
        slug,
        nombre,
        id_punto,
        subtitulo,
        descripcion,
        imagen_path,
        precio_desde,
        servicios_disponibles,
        orden,
        direccion_terminal,
        telefono_terminal,
        horarios_atencion,
        altitud,
        temperatura,
        tiempo_viaje,
        imagen_atractivos,
        descripcion_atractivos,
        activo,
        date_time_registration,
        date_time_modification
      ) VALUES (
        ${slug},
        ${nombreFinal},
        ${idPuntoInt},
        ${subtitulo || null},
        ${descripcion || null},
        ${imagenPath},
        ${precioDesde ? parseFloat(precioDesde) : null},
        ${serviciosDisponibles || null},
        ${parseInt(orden) || 0},
        ${direccionTerminal || null},
        ${telefonoTerminal || null},
        ${horariosAtencion || null},
        ${altitud || null},
        ${temperatura || null},
        ${tiempoViaje || null},
        ${imagenAtractivos},
        ${descripcionAtractivos || null},
        true,
        NOW(),
        NOW()
      )
    `;

    const insertado = await prisma.$queryRaw`
      SELECT
        id,
        slug,
        nombre,
        id_punto as "idPunto",
        subtitulo,
        descripcion,
        imagen_path as "imagenPath",
        precio_desde as "precioDesde",
        servicios_disponibles as "serviciosDisponibles",
        orden,
        activo,
        direccion_terminal as "direccionTerminal",
        telefono_terminal as "telefonoTerminal",
        horarios_atencion as "horariosAtencion",
        altitud,
        temperatura,
        tiempo_viaje as "tiempoViaje",
        imagen_atractivos as "imagenAtractivos",
        descripcion_atractivos as "descripcionAtractivos",
        date_time_registration as "createdAt",
        date_time_modification as "updatedAt"
      FROM tbl_destinos_publicos
      WHERE slug = ${slug}
      ORDER BY id DESC
      LIMIT 1
    `;

    await registrarAuditoria(
      req.user.id,
      'DESTINO_CREADO',
      'DESTINOS',
      insertado[0].id,
      insertado[0]
    );

    res.status(201).json({
      mensaje: 'Destino creado exitosamente',
      destino: insertado[0]
    });
  } catch (error) {
    console.error('Error creando destino:', error);
    res.status(500).json({ error: 'Error al crear destino' });
  }
};

/**
 * Actualizar destino (admin)
 * PUT /api/destinos/:id
 */
const actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const { slug, nombre, subtitulo, descripcion, precioDesde, serviciosDisponibles, orden, direccionTerminal, telefonoTerminal, horariosAtencion, altitud, temperatura, tiempoViaje, descripcionAtractivos, idPunto } = req.body;

    // Derivar nombre del punto si se envió idPunto
    let nombreFinal = nombre;
    const idPuntoInt = idPunto ? parseInt(idPunto) : null;
    if (idPuntoInt) {
      const punto = await prisma.$queryRaw`SELECT ciudad FROM tbl_puntos WHERE id = ${idPuntoInt}`;
      if (punto.length > 0) {
        nombreFinal = punto[0].ciudad.trim();
      }
    }

    const destinoActual = await prisma.$queryRaw`
      SELECT imagen_path as "imagenPath", imagen_atractivos as "imagenAtractivos"
      FROM tbl_destinos_publicos
      WHERE id = ${parseInt(id)}
    `;

    if (!destinoActual || destinoActual.length === 0) {
      return res.status(404).json({ error: 'Destino no encontrado' });
    }

    let imagenPath = destinoActual[0].imagenPath;
    let imagenAtractivos = destinoActual[0].imagenAtractivos;

    if (req.files?.imagen?.[0]) {
      await eliminarArchivoBanner(destinoActual[0].imagenPath);
      imagenPath = await procesarBannerFile(req.files.imagen[0], 'banner');
    }
    if (req.files?.imagenAtractivos?.[0]) {
      await eliminarArchivoBanner(destinoActual[0].imagenAtractivos);
      imagenAtractivos = await procesarBannerFile(req.files.imagenAtractivos[0], 'banner');
    }

    const result = await prisma.$queryRaw`
      UPDATE tbl_destinos_publicos SET
        slug = ${slug},
        nombre = ${nombreFinal},
        id_punto = ${idPuntoInt},
        subtitulo = ${subtitulo || null},
        descripcion = ${descripcion || null},
        imagen_path = ${imagenPath},
        precio_desde = ${precioDesde ? parseFloat(precioDesde) : null},
        servicios_disponibles = ${serviciosDisponibles || null},
        orden = ${parseInt(orden) || 0},
        direccion_terminal = ${direccionTerminal || null},
        telefono_terminal = ${telefonoTerminal || null},
        horarios_atencion = ${horariosAtencion || null},
        altitud = ${altitud || null},
        temperatura = ${temperatura || null},
        tiempo_viaje = ${tiempoViaje || null},
        imagen_atractivos = ${imagenAtractivos},
        descripcion_atractivos = ${descripcionAtractivos || null},
        date_time_modification = NOW()
      WHERE id = ${parseInt(id)}
      RETURNING
        id,
        slug,
        nombre,
        id_punto as "idPunto",
        subtitulo,
        descripcion,
        imagen_path as "imagenPath",
        precio_desde as "precioDesde",
        servicios_disponibles as "serviciosDisponibles",
        orden,
        activo,
        direccion_terminal as "direccionTerminal",
        telefono_terminal as "telefonoTerminal",
        horarios_atencion as "horariosAtencion",
        altitud,
        temperatura,
        tiempo_viaje as "tiempoViaje",
        imagen_atractivos as "imagenAtractivos",
        descripcion_atractivos as "descripcionAtractivos",
        date_time_registration as "createdAt",
        date_time_modification as "updatedAt"
    `;

    await registrarAuditoria(
      req.user.id,
      'DESTINO_ACTUALIZADO',
      'DESTINOS',
      parseInt(id),
      result[0]
    );

    res.json({
      mensaje: 'Destino actualizado exitosamente',
      destino: result[0]
    });
  } catch (error) {
    console.error('Error actualizando destino:', error);
    res.status(500).json({ error: 'Error al actualizar destino' });
  }
};

/**
 * Eliminar destino (admin) - CASCADE elimina festividades
 * DELETE /api/destinos/:id
 */
const eliminar = async (req, res) => {
  try {
    const { id } = req.params;

    const destino = await prisma.$queryRaw`
      SELECT imagen_path as "imagenPath", imagen_atractivos as "imagenAtractivos"
      FROM tbl_destinos_publicos
      WHERE id = ${parseInt(id)}
    `;

    if (!destino || destino.length === 0) {
      return res.status(404).json({ error: 'Destino no encontrado' });
    }

    if (destino[0].imagenPath) {
      await eliminarArchivoBanner(destino[0].imagenPath);
    }
    if (destino[0].imagenAtractivos) {
      await eliminarArchivoBanner(destino[0].imagenAtractivos);
    }

    await prisma.$executeRaw`
      DELETE FROM tbl_destinos_publicos WHERE id = ${parseInt(id)}
    `;

    await registrarAuditoria(
      req.user.id,
      'DESTINO_ELIMINADO',
      'DESTINOS',
      parseInt(id),
      { id: parseInt(id) }
    );

    res.json({ mensaje: 'Destino eliminado exitosamente' });
  } catch (error) {
    console.error('Error eliminando destino:', error);
    res.status(500).json({ error: 'Error al eliminar destino' });
  }
};

/**
 * Toggle activo/inactivo de destino (admin)
 * PATCH /api/destinos/:id/toggle
 */
const toggleActivo = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await prisma.$queryRaw`
      UPDATE tbl_destinos_publicos
      SET activo = NOT activo, date_time_modification = NOW()
      WHERE id = ${parseInt(id)}
      RETURNING id, activo
    `;

    if (!result || result.length === 0) {
      return res.status(404).json({ error: 'Destino no encontrado' });
    }

    await registrarAuditoria(
      req.user.id,
      'DESTINO_TOGGLE',
      'DESTINOS',
      parseInt(id),
      { activo: result[0].activo }
    );

    res.json({
      mensaje: `Destino ${result[0].activo ? 'activado' : 'desactivado'} exitosamente`,
      activo: result[0].activo
    });
  } catch (error) {
    console.error('Error toggling destino:', error);
    res.status(500).json({ error: 'Error al cambiar estado del destino' });
  }
};

/**
 * Crear festividad de destino (admin)
 * POST /api/destinos/:idDestino/festividades
 */
const crearFestividadDestino = async (req, res) => {
  try {
    const { idDestino } = req.params;
    const { titulo, descripcion, fecha_inicio, fecha_fin, orden } = req.body;

    const destinoExiste = await prisma.$queryRaw`
      SELECT id FROM tbl_destinos_publicos WHERE id = ${parseInt(idDestino)}
    `;

    if (!destinoExiste || destinoExiste.length === 0) {
      return res.status(404).json({ error: 'Destino no encontrado' });
    }

    await prisma.$executeRaw`
      INSERT INTO tbl_festividades_destino (
        id_destino,
        titulo,
        descripcion,
        fecha_inicio,
        fecha_fin,
        orden,
        activo,
        date_time_registration,
        date_time_modification
      ) VALUES (
        ${parseInt(idDestino)},
        ${titulo},
        ${descripcion || null},
        ${fecha_inicio ? new Date(fecha_inicio) : null},
        ${fecha_fin ? new Date(fecha_fin) : null},
        ${parseInt(orden) || 0},
        true,
        NOW(),
        NOW()
      )
    `;

    const insertada = await prisma.$queryRaw`
      SELECT
        id,
        id_destino as "idDestino",
        titulo,
        descripcion,
        fecha_inicio as "fechaInicio",
        fecha_fin as "fechaFin",
        orden,
        activo,
        date_time_registration as "createdAt",
        date_time_modification as "updatedAt"
      FROM tbl_festividades_destino
      WHERE id_destino = ${parseInt(idDestino)}
      ORDER BY id DESC
      LIMIT 1
    `;

    await registrarAuditoria(
      req.user.id,
      'FESTIVIDAD_DESTINO_CREADA',
      'FESTIVIDADES_DESTINO',
      insertada[0].id,
      insertada[0]
    );

    res.status(201).json({
      mensaje: 'Festividad creada exitosamente',
      festividad: insertada[0]
    });
  } catch (error) {
    console.error('Error creando festividad de destino:', error);
    res.status(500).json({ error: 'Error al crear festividad' });
  }
};

/**
 * Actualizar festividad de destino (admin)
 * PUT /api/destinos/festividades/:id
 */
const actualizarFestividadDestino = async (req, res) => {
  try {
    const { id } = req.params;
    const { titulo, descripcion, fecha_inicio, fecha_fin, orden } = req.body;

    const result = await prisma.$queryRaw`
      UPDATE tbl_festividades_destino SET
        titulo = ${titulo},
        descripcion = ${descripcion || null},
        fecha_inicio = ${fecha_inicio ? new Date(fecha_inicio) : null},
        fecha_fin = ${fecha_fin ? new Date(fecha_fin) : null},
        orden = ${parseInt(orden) || 0},
        date_time_modification = NOW()
      WHERE id = ${parseInt(id)}
      RETURNING
        id,
        id_destino as "idDestino",
        titulo,
        descripcion,
        fecha_inicio as "fechaInicio",
        fecha_fin as "fechaFin",
        orden,
        activo
    `;

    if (!result || result.length === 0) {
      return res.status(404).json({ error: 'Festividad no encontrada' });
    }

    await registrarAuditoria(
      req.user.id,
      'FESTIVIDAD_DESTINO_ACTUALIZADA',
      'FESTIVIDADES_DESTINO',
      parseInt(id),
      result[0]
    );

    res.json({
      mensaje: 'Festividad actualizada exitosamente',
      festividad: result[0]
    });
  } catch (error) {
    console.error('Error actualizando festividad de destino:', error);
    res.status(500).json({ error: 'Error al actualizar festividad' });
  }
};

/**
 * Eliminar festividad de destino (admin)
 * DELETE /api/destinos/festividades/:id
 */
const eliminarFestividadDestino = async (req, res) => {
  try {
    const { id } = req.params;

    const festividad = await prisma.$queryRaw`
      SELECT id FROM tbl_festividades_destino WHERE id = ${parseInt(id)}
    `;

    if (!festividad || festividad.length === 0) {
      return res.status(404).json({ error: 'Festividad no encontrada' });
    }

    await prisma.$executeRaw`
      DELETE FROM tbl_festividades_destino WHERE id = ${parseInt(id)}
    `;

    await registrarAuditoria(
      req.user.id,
      'FESTIVIDAD_DESTINO_ELIMINADA',
      'FESTIVIDADES_DESTINO',
      parseInt(id),
      { id: parseInt(id) }
    );

    res.json({ mensaje: 'Festividad eliminada exitosamente' });
  } catch (error) {
    console.error('Error eliminando festividad de destino:', error);
    res.status(500).json({ error: 'Error al eliminar festividad' });
  }
};

module.exports = {
  getDestinosPublicos,
  getDestinoBySlug,
  listar,
  crear,
  actualizar,
  eliminar,
  toggleActivo,
  crearFestividadDestino,
  actualizarFestividadDestino,
  eliminarFestividadDestino
};
