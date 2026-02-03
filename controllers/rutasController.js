/**
 * Rutas Controller
 * Controlador para gestion de rutas de transporte
 */

const prisma = require('../config/prisma');
const { registrarAuditoria } = require('../services/auditoriaService');
const { utcNow } = require('../utils/dateUtils');

/**
 * Listar todas las rutas
 * GET /api/rutas
 */
const listar = async (req, res) => {
  try {
    const rutas = await prisma.ruta.findMany({
      where: { estado: 1 },
      include: {
        puntoOrigen: {
          select: { id: true, nombre: true, ciudad: true }
        },
        puntoDestino: {
          select: { id: true, nombre: true, ciudad: true }
        },
        tipoCarro: {
          select: { id: true, nombre: true }
        }
      },
      orderBy: { id: 'asc' }
    });

    res.json({ rutas });
  } catch (error) {
    console.error('Error listando rutas:', error);
    res.status(500).json({ error: 'Error al listar rutas' });
  }
};

/**
 * Obtener ruta por ID
 * GET /api/rutas/:id
 */
const obtener = async (req, res) => {
  try {
    const { id } = req.params;

    const ruta = await prisma.ruta.findUnique({
      where: { id: parseInt(id) },
      include: {
        puntoOrigen: true,
        puntoDestino: true,
        tipoCarro: true,
        horarios: {
          where: { habilitado: true },
          orderBy: { horaSalida: 'asc' }
        }
      }
    });

    if (!ruta) {
      return res.status(404).json({ error: 'Ruta no encontrada' });
    }

    res.json({ ruta });
  } catch (error) {
    console.error('Error obteniendo ruta:', error);
    res.status(500).json({ error: 'Error al obtener ruta' });
  }
};

/**
 * Crear ruta
 * POST /api/rutas
 */
const crear = async (req, res) => {
  try {
    const { idPuntoOrigen, idPuntoDestino, precioPasaje, idTipoCarro } = req.body;

    // Validaciones
    if (!idPuntoOrigen || !idPuntoDestino || !precioPasaje || !idTipoCarro) {
      return res.status(400).json({
        error: 'Origen, destino, precio y tipo de carro son requeridos'
      });
    }

    if (idPuntoOrigen === idPuntoDestino) {
      return res.status(400).json({
        error: 'El origen debe ser diferente al destino'
      });
    }

    if (precioPasaje <= 0) {
      return res.status(400).json({
        error: 'El precio debe ser mayor a 0'
      });
    }

    // Verificar que el tipo de carro exista y esté activo
    const tipoCarro = await prisma.tipoCarro.findUnique({
      where: { id: parseInt(idTipoCarro) }
    });

    if (!tipoCarro || tipoCarro.estado !== 1) {
      return res.status(400).json({
        error: 'El tipo de carro no existe o está inactivo'
      });
    }

    // Verificar que no exista la ruta con el mismo origen, destino Y tipo de carro
    const rutaExistente = await prisma.ruta.findFirst({
      where: {
        idPuntoOrigen: parseInt(idPuntoOrigen),
        idPuntoDestino: parseInt(idPuntoDestino),
        idTipoCarro: parseInt(idTipoCarro)
      }
    });

    if (rutaExistente) {
      return res.status(400).json({
        error: 'Ya existe una ruta con ese origen, destino y tipo de carro'
      });
    }

    const ruta = await prisma.ruta.create({
      data: {
        idPuntoOrigen: parseInt(idPuntoOrigen),
        idPuntoDestino: parseInt(idPuntoDestino),
        idTipoCarro: parseInt(idTipoCarro),
        precioPasaje: parseFloat(precioPasaje),
        estado: 1,
        userIdRegistration: req.user.id
      },
      include: {
        puntoOrigen: true,
        puntoDestino: true,
        tipoCarro: true
      }
    });

    // Auditoria
    await registrarAuditoria(req.user.id, 'RUTA_CREADA', 'RUTA', ruta.id, ruta);

    res.status(201).json({
      mensaje: 'Ruta creada exitosamente',
      ruta
    });
  } catch (error) {
    console.error('Error creando ruta:', error);
    res.status(500).json({ error: 'Error al crear ruta' });
  }
};

/**
 * Actualizar ruta
 * PUT /api/rutas/:id
 */
const actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const { precioPasaje, estado, idTipoCarro } = req.body;

    const rutaExistente = await prisma.ruta.findUnique({
      where: { id: parseInt(id) }
    });

    if (!rutaExistente) {
      return res.status(404).json({ error: 'Ruta no encontrada' });
    }

    // Si se cambia el tipo de carro, validar que exista y que no haya duplicados
    let nuevoIdTipoCarro = rutaExistente.idTipoCarro;
    if (idTipoCarro && parseInt(idTipoCarro) !== rutaExistente.idTipoCarro) {
      // Verificar que el tipo de carro exista y esté activo
      const tipoCarro = await prisma.tipoCarro.findUnique({
        where: { id: parseInt(idTipoCarro) }
      });

      if (!tipoCarro || tipoCarro.estado !== 1) {
        return res.status(400).json({
          error: 'El tipo de carro no existe o está inactivo'
        });
      }

      // Verificar que no exista otra ruta con el mismo origen, destino y nuevo tipo de carro
      const rutaDuplicada = await prisma.ruta.findFirst({
        where: {
          idPuntoOrigen: rutaExistente.idPuntoOrigen,
          idPuntoDestino: rutaExistente.idPuntoDestino,
          idTipoCarro: parseInt(idTipoCarro),
          id: { not: parseInt(id) }
        }
      });

      if (rutaDuplicada) {
        return res.status(400).json({
          error: 'Ya existe una ruta con ese origen, destino y tipo de carro'
        });
      }

      nuevoIdTipoCarro = parseInt(idTipoCarro);
    }

    // Se puede editar precio, estado y tipo de carro (no origen/destino)
    const ruta = await prisma.ruta.update({
      where: { id: parseInt(id) },
      data: {
        precioPasaje: precioPasaje ? parseFloat(precioPasaje) : rutaExistente.precioPasaje,
        estado: estado !== undefined ? estado : rutaExistente.estado,
        idTipoCarro: nuevoIdTipoCarro,
        userIdModification: req.user.id,
        dateTimeModification: utcNow()
      },
      include: {
        puntoOrigen: true,
        puntoDestino: true,
        tipoCarro: true
      }
    });

    // Auditoria
    await registrarAuditoria(req.user.id, 'RUTA_ACTUALIZADA', 'RUTA', ruta.id, {
      anterior: rutaExistente,
      nuevo: ruta
    });

    res.json({
      mensaje: 'Ruta actualizada exitosamente',
      ruta
    });
  } catch (error) {
    console.error('Error actualizando ruta:', error);
    res.status(500).json({ error: 'Error al actualizar ruta' });
  }
};

/**
 * Eliminar/desactivar ruta
 * DELETE /api/rutas/:id
 */
const eliminar = async (req, res) => {
  try {
    const { id } = req.params;

    const rutaExistente = await prisma.ruta.findUnique({
      where: { id: parseInt(id) }
    });

    if (!rutaExistente) {
      return res.status(404).json({ error: 'Ruta no encontrada' });
    }

    const ruta = await prisma.ruta.update({
      where: { id: parseInt(id) },
      data: {
        estado: 0,
        userIdModification: req.user.id,
        dateTimeModification: utcNow()
      }
    });

    // Auditoria
    await registrarAuditoria(req.user.id, 'RUTA_ELIMINADA', 'RUTA', ruta.id, ruta);

    res.json({
      mensaje: 'Ruta eliminada exitosamente'
    });
  } catch (error) {
    console.error('Error eliminando ruta:', error);
    res.status(500).json({ error: 'Error al eliminar ruta' });
  }
};

module.exports = {
  listar,
  obtener,
  crear,
  actualizar,
  eliminar
};
