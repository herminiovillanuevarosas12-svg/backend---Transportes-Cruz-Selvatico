/**
 * Precios Base Controller
 * CRUD para precios base de encomiendas
 */

const prisma = require('../config/prisma');
const { registrarAuditoria } = require('../services/auditoriaService');

/**
 * Listar todos los precios base activos
 * GET /api/precios-base-encomienda
 */
const listar = async (req, res) => {
  try {
    const precios = await prisma.$queryRaw`
      SELECT id, nombre, monto, activo,
             date_time_registration as "fechaCreacion"
      FROM tbl_precios_base_encomienda
      WHERE activo = true
      ORDER BY nombre ASC
    `;

    res.json({ preciosBase: precios });
  } catch (error) {
    console.error('Error listando precios base:', error);
    res.status(500).json({ error: 'Error al listar precios base' });
  }
};

/**
 * Crear precio base
 * POST /api/precios-base-encomienda
 */
const crear = async (req, res) => {
  try {
    const { nombre, monto } = req.body;

    if (!nombre || nombre.trim() === '') {
      return res.status(400).json({ error: 'El nombre es requerido' });
    }

    if (monto === undefined || monto === null || parseFloat(monto) < 0) {
      return res.status(400).json({ error: 'El monto debe ser mayor o igual a 0' });
    }

    const result = await prisma.$queryRaw`
      INSERT INTO tbl_precios_base_encomienda (nombre, monto, activo, user_id_registration, date_time_registration)
      VALUES (${nombre.trim()}, ${parseFloat(monto)}, true, ${req.user.id}, NOW())
      RETURNING id, nombre, monto, activo, date_time_registration as "fechaCreacion"
    `;

    await registrarAuditoria(req.user.id, 'PRECIO_BASE_CREADO', 'CONFIGURACION', result[0].id, result[0]);

    res.status(201).json({
      mensaje: 'Precio base creado exitosamente',
      precioBase: result[0]
    });
  } catch (error) {
    console.error('Error creando precio base:', error);
    res.status(500).json({ error: 'Error al crear precio base' });
  }
};

/**
 * Actualizar precio base
 * PUT /api/precios-base-encomienda/:id
 */
const actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, monto } = req.body;

    if (!nombre || nombre.trim() === '') {
      return res.status(400).json({ error: 'El nombre es requerido' });
    }

    if (monto === undefined || monto === null || parseFloat(monto) < 0) {
      return res.status(400).json({ error: 'El monto debe ser mayor o igual a 0' });
    }

    // Verificar que existe
    const existe = await prisma.$queryRaw`
      SELECT id FROM tbl_precios_base_encomienda WHERE id = ${parseInt(id)} AND activo = true
    `;

    if (!existe || existe.length === 0) {
      return res.status(404).json({ error: 'Precio base no encontrado' });
    }

    const result = await prisma.$queryRaw`
      UPDATE tbl_precios_base_encomienda
      SET nombre = ${nombre.trim()},
          monto = ${parseFloat(monto)},
          user_id_modification = ${req.user.id},
          date_time_modification = NOW()
      WHERE id = ${parseInt(id)}
      RETURNING id, nombre, monto, activo, date_time_registration as "fechaCreacion"
    `;

    await registrarAuditoria(req.user.id, 'PRECIO_BASE_ACTUALIZADO', 'CONFIGURACION', result[0].id, result[0]);

    res.json({
      mensaje: 'Precio base actualizado exitosamente',
      precioBase: result[0]
    });
  } catch (error) {
    console.error('Error actualizando precio base:', error);
    res.status(500).json({ error: 'Error al actualizar precio base' });
  }
};

/**
 * Eliminar precio base (soft delete)
 * DELETE /api/precios-base-encomienda/:id
 */
const eliminar = async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar que existe
    const existe = await prisma.$queryRaw`
      SELECT id FROM tbl_precios_base_encomienda WHERE id = ${parseInt(id)} AND activo = true
    `;

    if (!existe || existe.length === 0) {
      return res.status(404).json({ error: 'Precio base no encontrado' });
    }

    // Verificar que no está siendo usado por encomiendas
    const enUso = await prisma.$queryRaw`
      SELECT COUNT(*)::int as total FROM tbl_encomiendas WHERE id_precio_base = ${parseInt(id)}
    `;

    if (enUso[0].total > 0) {
      return res.status(400).json({
        error: `No se puede eliminar: este precio base está siendo usado por ${enUso[0].total} encomienda(s)`
      });
    }

    await prisma.$queryRaw`
      UPDATE tbl_precios_base_encomienda
      SET activo = false,
          user_id_modification = ${req.user.id},
          date_time_modification = NOW()
      WHERE id = ${parseInt(id)}
    `;

    await registrarAuditoria(req.user.id, 'PRECIO_BASE_ELIMINADO', 'CONFIGURACION', parseInt(id), { id: parseInt(id) });

    res.json({ mensaje: 'Precio base eliminado exitosamente' });
  } catch (error) {
    console.error('Error eliminando precio base:', error);
    res.status(500).json({ error: 'Error al eliminar precio base' });
  }
};

module.exports = {
  listar,
  crear,
  actualizar,
  eliminar
};
