/**
 * Usuarios Controller
 * Controlador para gestion de usuarios
 */

const prisma = require('../config/prisma');
const bcrypt = require('bcrypt');
const { registrarAuditoria } = require('../services/auditoriaService');
const { utcNow } = require('../utils/dateUtils');

/**
 * Listar usuarios
 * GET /api/usuarios
 */
const listar = async (req, res) => {
  try {
    const usuarios = await prisma.usuario.findMany({
      where: { estado: 1 },
      select: {
        id: true,
        nombres: true,
        correo: true,
        idRol: true,
        idPunto: true,
        estado: true,
        dateTimeRegistration: true,
        rol: {
          select: { id: true, nombre: true }
        },
        punto: {
          select: { id: true, nombre: true }
        }
      },
      orderBy: { nombres: 'asc' }
    });

    res.json({ usuarios });
  } catch (error) {
    console.error('Error listando usuarios:', error);
    res.status(500).json({ error: 'Error al listar usuarios' });
  }
};

/**
 * Obtener usuario por ID
 * GET /api/usuarios/:id
 */
const obtener = async (req, res) => {
  try {
    const { id } = req.params;

    const usuario = await prisma.usuario.findUnique({
      where: { id: parseInt(id) },
      select: {
        id: true,
        nombres: true,
        correo: true,
        idRol: true,
        idPunto: true,
        estado: true,
        dateTimeRegistration: true,
        rol: {
          select: { id: true, nombre: true }
        },
        punto: {
          select: { id: true, nombre: true }
        }
      }
    });

    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json({ usuario });
  } catch (error) {
    console.error('Error obteniendo usuario:', error);
    res.status(500).json({ error: 'Error al obtener usuario' });
  }
};

/**
 * Crear usuario
 * POST /api/usuarios
 */
const crear = async (req, res) => {
  try {
    const { nombres, correo, contrasena, idRol, idPunto } = req.body;

    // Validaciones
    if (!nombres || !correo || !contrasena || !idRol) {
      return res.status(400).json({
        error: 'Nombres, correo, contrasena y rol son requeridos'
      });
    }

    // Verificar correo unico
    const existente = await prisma.usuario.findUnique({
      where: { correo }
    });

    if (existente) {
      return res.status(400).json({
        error: 'Ya existe un usuario con ese correo'
      });
    }

    // Hash de contrasena
    const contrasenaHash = await bcrypt.hash(contrasena, 10);

    const usuario = await prisma.usuario.create({
      data: {
        nombres,
        correo,
        contrasena: contrasenaHash,
        idRol: parseInt(idRol),
        idPunto: idPunto ? parseInt(idPunto) : null,
        estado: 1,
        userIdRegistration: req.user.id
      },
      select: {
        id: true,
        nombres: true,
        correo: true,
        idRol: true,
        idPunto: true,
        estado: true,
        rol: { select: { id: true, nombre: true } },
        punto: { select: { id: true, nombre: true } }
      }
    });

    // Auditoria
    await registrarAuditoria(req.user.id, 'USUARIO_CREADO', 'USUARIO', usuario.id, {
      nombres,
      correo,
      rol: usuario.rol.nombre
    });

    res.status(201).json({
      mensaje: 'Usuario creado exitosamente',
      usuario
    });
  } catch (error) {
    console.error('Error creando usuario:', error);
    res.status(500).json({ error: 'Error al crear usuario' });
  }
};

/**
 * Actualizar usuario
 * PUT /api/usuarios/:id
 */
const actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombres, correo, contrasena, idRol, idPunto, estado } = req.body;

    const usuarioExistente = await prisma.usuario.findUnique({
      where: { id: parseInt(id) }
    });

    if (!usuarioExistente) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Si cambia el correo, verificar que no exista
    if (correo && correo !== usuarioExistente.correo) {
      const existente = await prisma.usuario.findUnique({
        where: { correo }
      });
      if (existente) {
        return res.status(400).json({
          error: 'Ya existe un usuario con ese correo'
        });
      }
    }

    const data = {
      nombres: nombres || usuarioExistente.nombres,
      correo: correo || usuarioExistente.correo,
      idRol: idRol ? parseInt(idRol) : usuarioExistente.idRol,
      idPunto: idPunto !== undefined ? (idPunto ? parseInt(idPunto) : null) : usuarioExistente.idPunto,
      estado: estado !== undefined ? estado : usuarioExistente.estado,
      userIdModification: req.user.id,
      dateTimeModification: utcNow()
    };

    // Si se proporciona nueva contrasena
    if (contrasena) {
      data.contrasena = await bcrypt.hash(contrasena, 10);
    }

    const usuario = await prisma.usuario.update({
      where: { id: parseInt(id) },
      data,
      select: {
        id: true,
        nombres: true,
        correo: true,
        idRol: true,
        idPunto: true,
        estado: true,
        rol: { select: { id: true, nombre: true } },
        punto: { select: { id: true, nombre: true } }
      }
    });

    // Auditoria
    await registrarAuditoria(req.user.id, 'USUARIO_ACTUALIZADO', 'USUARIO', usuario.id, {
      cambios: data
    });

    res.json({
      mensaje: 'Usuario actualizado exitosamente',
      usuario
    });
  } catch (error) {
    console.error('Error actualizando usuario:', error);
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
};

/**
 * Toggle activar/desactivar usuario
 * PATCH /api/usuarios/:id/toggle
 */
const toggle = async (req, res) => {
  try {
    const { id } = req.params;

    const usuarioExistente = await prisma.usuario.findUnique({
      where: { id: parseInt(id) }
    });

    if (!usuarioExistente) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const usuario = await prisma.usuario.update({
      where: { id: parseInt(id) },
      data: {
        estado: usuarioExistente.estado === 1 ? 0 : 1,
        userIdModification: req.user.id,
        dateTimeModification: utcNow()
      },
      select: {
        id: true,
        nombres: true,
        correo: true,
        estado: true
      }
    });

    // Auditoria
    await registrarAuditoria(
      req.user.id,
      usuario.estado === 1 ? 'USUARIO_ACTIVADO' : 'USUARIO_DESACTIVADO',
      'USUARIO',
      usuario.id,
      { nombres: usuario.nombres }
    );

    res.json({
      mensaje: `Usuario ${usuario.estado === 1 ? 'activado' : 'desactivado'} exitosamente`,
      usuario
    });
  } catch (error) {
    console.error('Error toggle usuario:', error);
    res.status(500).json({ error: 'Error al cambiar estado del usuario' });
  }
};

module.exports = {
  listar,
  obtener,
  crear,
  actualizar,
  toggle
};
