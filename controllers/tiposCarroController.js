/**
 * Tipos de Carro Controller
 * Controlador para gestión de tipos de vehículo
 */

const prisma = require('../config/prisma');
const { registrarAuditoria } = require('../services/auditoriaService');
const { utcNow } = require('../utils/dateUtils');

/**
 * Listar todos los tipos de carro activos
 * GET /api/tipos-carro
 */
const listar = async (req, res) => {
  try {
    const tiposCarro = await prisma.tipoCarro.findMany({
      where: { estado: 1 },
      orderBy: { nombre: 'asc' }
    });

    res.json({ tiposCarro });
  } catch (error) {
    console.error('Error listando tipos de carro:', error);
    res.status(500).json({ error: 'Error al listar tipos de carro' });
  }
};

/**
 * Obtener tipo de carro por ID
 * GET /api/tipos-carro/:id
 */
const obtener = async (req, res) => {
  try {
    const { id } = req.params;

    const tipoCarro = await prisma.tipoCarro.findUnique({
      where: { id: parseInt(id) }
    });

    if (!tipoCarro) {
      return res.status(404).json({ error: 'Tipo de carro no encontrado' });
    }

    res.json({ tipoCarro });
  } catch (error) {
    console.error('Error obteniendo tipo de carro:', error);
    res.status(500).json({ error: 'Error al obtener tipo de carro' });
  }
};

/**
 * Crear tipo de carro
 * POST /api/tipos-carro
 */
const crear = async (req, res) => {
  try {
    const { nombre, descripcion } = req.body;

    // Validaciones
    if (!nombre || nombre.trim() === '') {
      return res.status(400).json({
        error: 'El nombre es requerido'
      });
    }

    // Verificar que no exista un tipo con el mismo nombre
    const existente = await prisma.tipoCarro.findFirst({
      where: {
        nombre: nombre.trim(),
        estado: 1
      }
    });

    if (existente) {
      return res.status(400).json({
        error: 'Ya existe un tipo de carro con ese nombre'
      });
    }

    const tipoCarro = await prisma.tipoCarro.create({
      data: {
        nombre: nombre.trim(),
        descripcion: descripcion?.trim() || null,
        estado: 1,
        createdBy: req.user.id,
        createdAt: utcNow()
      }
    });

    // Auditoría
    await registrarAuditoria(req.user.id, 'TIPO_CARRO_CREADO', 'TIPO_CARRO', tipoCarro.id, tipoCarro);

    res.status(201).json({
      mensaje: 'Tipo de carro creado exitosamente',
      tipoCarro
    });
  } catch (error) {
    console.error('Error creando tipo de carro:', error);
    res.status(500).json({ error: 'Error al crear tipo de carro' });
  }
};

/**
 * Actualizar tipo de carro
 * PUT /api/tipos-carro/:id
 */
const actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion, estado } = req.body;

    const tipoExistente = await prisma.tipoCarro.findUnique({
      where: { id: parseInt(id) }
    });

    if (!tipoExistente) {
      return res.status(404).json({ error: 'Tipo de carro no encontrado' });
    }

    // Si se cambia el nombre, verificar que no exista otro con el mismo nombre
    if (nombre && nombre.trim() !== tipoExistente.nombre) {
      const duplicado = await prisma.tipoCarro.findFirst({
        where: {
          nombre: nombre.trim(),
          estado: 1,
          id: { not: parseInt(id) }
        }
      });

      if (duplicado) {
        return res.status(400).json({
          error: 'Ya existe un tipo de carro con ese nombre'
        });
      }
    }

    const tipoCarro = await prisma.tipoCarro.update({
      where: { id: parseInt(id) },
      data: {
        nombre: nombre?.trim() || tipoExistente.nombre,
        descripcion: descripcion !== undefined ? (descripcion?.trim() || null) : tipoExistente.descripcion,
        estado: estado !== undefined ? estado : tipoExistente.estado,
        updatedBy: req.user.id,
        updatedAt: utcNow()
      }
    });

    // Auditoría
    await registrarAuditoria(req.user.id, 'TIPO_CARRO_ACTUALIZADO', 'TIPO_CARRO', tipoCarro.id, {
      anterior: tipoExistente,
      nuevo: tipoCarro
    });

    res.json({
      mensaje: 'Tipo de carro actualizado exitosamente',
      tipoCarro
    });
  } catch (error) {
    console.error('Error actualizando tipo de carro:', error);
    res.status(500).json({ error: 'Error al actualizar tipo de carro' });
  }
};

/**
 * Eliminar/desactivar tipo de carro (soft delete)
 * DELETE /api/tipos-carro/:id
 */
const eliminar = async (req, res) => {
  try {
    const { id } = req.params;

    const tipoExistente = await prisma.tipoCarro.findUnique({
      where: { id: parseInt(id) }
    });

    if (!tipoExistente) {
      return res.status(404).json({ error: 'Tipo de carro no encontrado' });
    }

    // Verificar si hay rutas usando este tipo
    const rutasConTipo = await prisma.ruta.count({
      where: {
        idTipoCarro: parseInt(id),
        estado: 1
      }
    });

    if (rutasConTipo > 0) {
      return res.status(400).json({
        error: `No se puede eliminar. Hay ${rutasConTipo} ruta(s) activa(s) usando este tipo de carro`
      });
    }

    // Soft delete
    const tipoCarro = await prisma.tipoCarro.update({
      where: { id: parseInt(id) },
      data: {
        estado: 0,
        updatedBy: req.user.id,
        updatedAt: utcNow()
      }
    });

    // Auditoría
    await registrarAuditoria(req.user.id, 'TIPO_CARRO_ELIMINADO', 'TIPO_CARRO', tipoCarro.id, tipoCarro);

    res.json({
      mensaje: 'Tipo de carro eliminado exitosamente'
    });
  } catch (error) {
    console.error('Error eliminando tipo de carro:', error);
    res.status(500).json({ error: 'Error al eliminar tipo de carro' });
  }
};

module.exports = {
  listar,
  obtener,
  crear,
  actualizar,
  eliminar
};
