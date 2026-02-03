/**
 * Auth Controller
 * Controlador de autenticacion
 */

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { findUserByEmail, findUserById } = require('../models/authModel');

/**
 * Login - Iniciar sesion
 * POST /api/auth/login
 */
const login = async (req, res) => {
  const { correo, contrasena } = req.body;

  // Validaciones basicas
  if (!correo || !contrasena) {
    return res.status(400).json({
      error: 'Correo y contrasena son requeridos'
    });
  }

  try {
    // Buscar usuario con su rol y permisos
    const usuario = await findUserByEmail(correo);

    if (!usuario) {
      return res.status(404).json({
        error: 'Correo no registrado o usuario inactivo'
      });
    }

    // Comparar contrasenas
    const coincide = await bcrypt.compare(contrasena, usuario.contrasena);
    if (!coincide) {
      return res.status(401).json({
        error: 'Contrasena incorrecta'
      });
    }

    // Generar token
    const token = jwt.sign(
      {
        id: usuario.id,
        correo: usuario.correo,
        id_rol: usuario.id_rol,
        id_punto: usuario.id_punto
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '4h' }
    );

    // Responder con datos del usuario + permisos
    res.json({
      mensaje: 'Login exitoso',
      token,
      usuario: {
        id: usuario.id,
        nombres: usuario.nombres,
        correo: usuario.correo,
        id_rol: usuario.id_rol,
        id_punto: usuario.id_punto,
        rol: usuario.rol,
        permisos: usuario.permisos
      }
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({
      error: 'Error al iniciar sesion'
    });
  }
};

/**
 * Logout - Cerrar sesion
 * POST /api/auth/logout
 */
const logout = async (req, res) => {
  // JWT es stateless, el logout se maneja en el cliente
  // Aqui podriamos agregar el token a una blacklist si se requiere
  res.json({
    mensaje: 'Sesion cerrada exitosamente'
  });
};

/**
 * Me - Obtener usuario actual
 * GET /api/auth/me
 */
const me = async (req, res) => {
  try {
    const usuario = await findUserById(req.user.id);

    if (!usuario) {
      return res.status(404).json({
        error: 'Usuario no encontrado'
      });
    }

    res.json({
      usuario: {
        id: usuario.id,
        nombres: usuario.nombres,
        correo: usuario.correo,
        id_rol: usuario.id_rol,
        id_punto: usuario.id_punto,
        rol: usuario.rol,
        permisos: usuario.permisos
      }
    });
  } catch (error) {
    console.error('Error en me:', error);
    res.status(500).json({
      error: 'Error al obtener usuario'
    });
  }
};

module.exports = {
  login,
  logout,
  me
};
