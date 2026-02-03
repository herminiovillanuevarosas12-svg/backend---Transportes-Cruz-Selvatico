/**
 * Dashboard Controller
 * Controlador para metricas del dashboard
 */

const pool = require('../config/db');

/**
 * Ventas del dia
 * GET /api/dashboard/ventas-hoy
 */
const ventasHoy = async (req, res) => {
  try {
    const query = `
      SELECT COUNT(*) as total
      FROM tbl_tickets
      WHERE DATE(fecha_venta) = CURRENT_DATE
        AND estado = 'EMITIDO'
    `;

    const result = await pool.query(query);

    res.json({
      ventasHoy: parseInt(result.rows[0].total)
    });
  } catch (error) {
    console.error('Error obteniendo ventas del dia:', error);
    res.status(500).json({ error: 'Error al obtener ventas del dia' });
  }
};

/**
 * Encomiendas registradas hoy
 * GET /api/dashboard/encomiendas-hoy
 */
const encomiendasHoy = async (req, res) => {
  try {
    const query = `
      SELECT COUNT(*) as total
      FROM tbl_encomiendas
      WHERE DATE(date_time_registration) = CURRENT_DATE
    `;

    const result = await pool.query(query);

    res.json({
      encomiendasHoy: parseInt(result.rows[0].total)
    });
  } catch (error) {
    console.error('Error obteniendo encomiendas del dia:', error);
    res.status(500).json({ error: 'Error al obtener encomiendas del dia' });
  }
};

/**
 * Encomiendas entregadas (rango)
 * GET /api/dashboard/encomiendas-entregadas
 * Query params: fechaInicio, fechaFin
 */
const encomiendasEntregadas = async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = req.query;

    let query = `
      SELECT COUNT(*) as total
      FROM tbl_eventos_encomienda
      WHERE estado_destino = 'RETIRADO'
    `;

    const params = [];

    if (fechaInicio && fechaFin) {
      query += ` AND DATE(fecha_evento) BETWEEN $1 AND $2`;
      params.push(fechaInicio, fechaFin);
    } else {
      // Por defecto, ultimo mes
      query += ` AND fecha_evento >= CURRENT_DATE - INTERVAL '30 days'`;
    }

    const result = await pool.query(query, params);

    res.json({
      encomiendasEntregadas: parseInt(result.rows[0].total),
      rango: {
        inicio: fechaInicio || 'ultimos 30 dias',
        fin: fechaFin || 'hoy'
      }
    });
  } catch (error) {
    console.error('Error obteniendo encomiendas entregadas:', error);
    res.status(500).json({ error: 'Error al obtener encomiendas entregadas' });
  }
};

/**
 * Rutas mas usadas
 * GET /api/dashboard/rutas-mas-usadas
 * Query params: fechaInicio, fechaFin, limit
 */
const rutasMasUsadas = async (req, res) => {
  try {
    const { fechaInicio, fechaFin, limit = 10 } = req.query;

    let query = `
      SELECT
        r.id,
        po.nombre as origen,
        pd.nombre as destino,
        COUNT(t.id) as total_tickets
      FROM tbl_tickets t
      JOIN tbl_viajes v ON t.id_viaje = v.id
      JOIN tbl_rutas r ON v.id_ruta = r.id
      JOIN tbl_puntos po ON r.id_punto_origen = po.id
      JOIN tbl_puntos pd ON r.id_punto_destino = pd.id
      WHERE t.estado = 'EMITIDO'
    `;

    const params = [];
    let paramIndex = 1;

    if (fechaInicio && fechaFin) {
      query += ` AND DATE(t.fecha_venta) BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      params.push(fechaInicio, fechaFin);
      paramIndex += 2;
    }

    query += `
      GROUP BY r.id, po.nombre, pd.nombre
      ORDER BY total_tickets DESC
      LIMIT $${paramIndex}
    `;
    params.push(parseInt(limit));

    const result = await pool.query(query, params);

    res.json({
      rutasMasUsadas: result.rows
    });
  } catch (error) {
    console.error('Error obteniendo rutas mas usadas:', error);
    res.status(500).json({ error: 'Error al obtener rutas mas usadas' });
  }
};

/**
 * Top puntos por origen
 * GET /api/dashboard/puntos-origen
 * Query params: tipo (tickets|encomiendas|ambos), limit
 */
const puntosOrigen = async (req, res) => {
  try {
    const { tipo = 'ambos', limit = 10 } = req.query;

    let resultados = {};

    // Tickets por origen
    if (tipo === 'tickets' || tipo === 'ambos') {
      const queryTickets = `
        SELECT p.id, p.nombre, COUNT(t.id) as total
        FROM tbl_tickets t
        JOIN tbl_viajes v ON t.id_viaje = v.id
        JOIN tbl_rutas r ON v.id_ruta = r.id
        JOIN tbl_puntos p ON r.id_punto_origen = p.id
        WHERE t.estado = 'EMITIDO'
        GROUP BY p.id, p.nombre
        ORDER BY total DESC
        LIMIT $1
      `;
      const resTickets = await pool.query(queryTickets, [parseInt(limit)]);
      resultados.tickets = resTickets.rows;
    }

    // Encomiendas por origen
    if (tipo === 'encomiendas' || tipo === 'ambos') {
      const queryEncomiendas = `
        SELECT p.id, p.nombre, COUNT(e.id) as total
        FROM tbl_encomiendas e
        JOIN tbl_puntos p ON e.id_punto_origen = p.id
        GROUP BY p.id, p.nombre
        ORDER BY total DESC
        LIMIT $1
      `;
      const resEncomiendas = await pool.query(queryEncomiendas, [parseInt(limit)]);
      resultados.encomiendas = resEncomiendas.rows;
    }

    res.json({
      puntosOrigen: resultados
    });
  } catch (error) {
    console.error('Error obteniendo puntos origen:', error);
    res.status(500).json({ error: 'Error al obtener puntos origen' });
  }
};

/**
 * Top puntos por destino
 * GET /api/dashboard/puntos-destino
 * Query params: tipo (tickets|encomiendas|ambos), limit
 */
const puntosDestino = async (req, res) => {
  try {
    const { tipo = 'ambos', limit = 10 } = req.query;

    let resultados = {};

    // Tickets por destino
    if (tipo === 'tickets' || tipo === 'ambos') {
      const queryTickets = `
        SELECT p.id, p.nombre, COUNT(t.id) as total
        FROM tbl_tickets t
        JOIN tbl_viajes v ON t.id_viaje = v.id
        JOIN tbl_rutas r ON v.id_ruta = r.id
        JOIN tbl_puntos p ON r.id_punto_destino = p.id
        WHERE t.estado = 'EMITIDO'
        GROUP BY p.id, p.nombre
        ORDER BY total DESC
        LIMIT $1
      `;
      const resTickets = await pool.query(queryTickets, [parseInt(limit)]);
      resultados.tickets = resTickets.rows;
    }

    // Encomiendas por destino
    if (tipo === 'encomiendas' || tipo === 'ambos') {
      const queryEncomiendas = `
        SELECT p.id, p.nombre, COUNT(e.id) as total
        FROM tbl_encomiendas e
        JOIN tbl_puntos p ON e.id_punto_destino = p.id
        GROUP BY p.id, p.nombre
        ORDER BY total DESC
        LIMIT $1
      `;
      const resEncomiendas = await pool.query(queryEncomiendas, [parseInt(limit)]);
      resultados.encomiendas = resEncomiendas.rows;
    }

    res.json({
      puntosDestino: resultados
    });
  } catch (error) {
    console.error('Error obteniendo puntos destino:', error);
    res.status(500).json({ error: 'Error al obtener puntos destino' });
  }
};

/**
 * Ingreso total del dia (pasajes + encomiendas)
 * GET /api/dashboard/ingreso-dia
 * Query params: fechaInicio, fechaFin
 */
const ingresoDia = async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = req.query;

    let condicionFechaTickets = `DATE(t.fecha_venta) = CURRENT_DATE`;
    let condicionFechaEncomiendas = `DATE(e.date_time_registration) = CURRENT_DATE`;
    const params = [];

    if (fechaInicio && fechaFin) {
      condicionFechaTickets = `DATE(t.fecha_venta) BETWEEN $1 AND $2`;
      condicionFechaEncomiendas = `DATE(e.date_time_registration) BETWEEN $1 AND $2`;
      params.push(fechaInicio, fechaFin);
    }

    const queryPasajes = `
      SELECT COALESCE(SUM(COALESCE(t.precio_final, t.precio_original, 0)), 0) as total
      FROM tbl_tickets t
      WHERE t.estado = 'EMITIDO'
        AND ${condicionFechaTickets}
    `;

    const queryEncomiendas = `
      SELECT COALESCE(SUM(COALESCE(e.precio_final, e.precio_calculado, 0)), 0) as total
      FROM tbl_encomiendas e
      WHERE ${condicionFechaEncomiendas}
    `;

    const [resPasajes, resEncomiendas] = await Promise.all([
      pool.query(queryPasajes, params),
      pool.query(queryEncomiendas, params)
    ]);

    const ingresoPasajes = parseFloat(resPasajes.rows[0].total);
    const ingresoEncomiendas = parseFloat(resEncomiendas.rows[0].total);

    res.json({
      ingresoTotal: ingresoPasajes + ingresoEncomiendas,
      ingresoPasajes,
      ingresoEncomiendas
    });
  } catch (error) {
    console.error('Error obteniendo ingreso del dia:', error);
    res.status(500).json({ error: 'Error al obtener ingreso del dia' });
  }
};

/**
 * Ingreso por pasajes con desglose por agencia
 * GET /api/dashboard/ingreso-pasajes
 * Query params: fechaInicio, fechaFin
 */
const ingresoPasajes = async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = req.query;

    let condicionFecha = `DATE(t.fecha_venta) = CURRENT_DATE`;
    const params = [];
    let paramIndex = 1;

    if (fechaInicio && fechaFin) {
      condicionFecha = `DATE(t.fecha_venta) BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      params.push(fechaInicio, fechaFin);
      paramIndex += 2;
    }

    // Total general
    const queryTotal = `
      SELECT
        COALESCE(SUM(COALESCE(t.precio_final, t.precio_original, 0)), 0) as total,
        COUNT(t.id) as cantidad
      FROM tbl_tickets t
      WHERE t.estado = 'EMITIDO'
        AND ${condicionFecha}
    `;

    // Desglose por agencia (punto de origen de la ruta)
    const queryPorAgencia = `
      SELECT
        p.id as agencia_id,
        p.nombre as agencia_nombre,
        p.tipo as agencia_tipo,
        COALESCE(SUM(COALESCE(t.precio_final, t.precio_original, 0)), 0) as total,
        COUNT(t.id) as cantidad
      FROM tbl_tickets t
      JOIN tbl_viajes v ON t.id_viaje = v.id
      JOIN tbl_rutas r ON v.id_ruta = r.id
      JOIN tbl_puntos p ON r.id_punto_origen = p.id
      WHERE t.estado = 'EMITIDO'
        AND ${condicionFecha}
      GROUP BY p.id, p.nombre, p.tipo
      ORDER BY total DESC
    `;

    const [resTotal, resPorAgencia] = await Promise.all([
      pool.query(queryTotal, params),
      pool.query(queryPorAgencia, params)
    ]);

    res.json({
      total: parseFloat(resTotal.rows[0].total),
      cantidad: parseInt(resTotal.rows[0].cantidad),
      porAgencia: resPorAgencia.rows.map(row => ({
        ...row,
        total: parseFloat(row.total),
        cantidad: parseInt(row.cantidad)
      }))
    });
  } catch (error) {
    console.error('Error obteniendo ingreso por pasajes:', error);
    res.status(500).json({ error: 'Error al obtener ingreso por pasajes' });
  }
};

/**
 * Ingreso por encomiendas con desglose por agencia
 * GET /api/dashboard/ingreso-encomiendas
 * Query params: fechaInicio, fechaFin
 */
const ingresoEncomiendas = async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = req.query;

    let condicionFecha = `DATE(e.date_time_registration) = CURRENT_DATE`;
    const params = [];
    let paramIndex = 1;

    if (fechaInicio && fechaFin) {
      condicionFecha = `DATE(e.date_time_registration) BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      params.push(fechaInicio, fechaFin);
      paramIndex += 2;
    }

    // Total general
    const queryTotal = `
      SELECT
        COALESCE(SUM(COALESCE(e.precio_final, e.precio_calculado, 0)), 0) as total,
        COUNT(e.id) as cantidad
      FROM tbl_encomiendas e
      WHERE ${condicionFecha}
    `;

    // Desglose por agencia (punto de origen)
    const queryPorAgencia = `
      SELECT
        p.id as agencia_id,
        p.nombre as agencia_nombre,
        p.tipo as agencia_tipo,
        COALESCE(SUM(COALESCE(e.precio_final, e.precio_calculado, 0)), 0) as total,
        COUNT(e.id) as cantidad
      FROM tbl_encomiendas e
      JOIN tbl_puntos p ON e.id_punto_origen = p.id
      WHERE ${condicionFecha}
      GROUP BY p.id, p.nombre, p.tipo
      ORDER BY total DESC
    `;

    const [resTotal, resPorAgencia] = await Promise.all([
      pool.query(queryTotal, params),
      pool.query(queryPorAgencia, params)
    ]);

    res.json({
      total: parseFloat(resTotal.rows[0].total),
      cantidad: parseInt(resTotal.rows[0].cantidad),
      porAgencia: resPorAgencia.rows.map(row => ({
        ...row,
        total: parseFloat(row.total),
        cantidad: parseInt(row.cantidad)
      }))
    });
  } catch (error) {
    console.error('Error obteniendo ingreso por encomiendas:', error);
    res.status(500).json({ error: 'Error al obtener ingreso por encomiendas' });
  }
};

module.exports = {
  ventasHoy,
  encomiendasHoy,
  encomiendasEntregadas,
  rutasMasUsadas,
  puntosOrigen,
  puntosDestino,
  ingresoDia,
  ingresoPasajes,
  ingresoEncomiendas
};
