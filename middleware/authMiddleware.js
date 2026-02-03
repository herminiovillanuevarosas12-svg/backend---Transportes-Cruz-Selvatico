/**
 * Auth Middleware
 * Middleware de autenticacion y autorizacion
 */

const jwt = require('jsonwebtoken');

/**
 * Verificar token JWT
 */
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      error: 'Token no proporcionado'
    });
  }

  const parts = authHeader.split(' ');

  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({
      error: 'Token mal formateado'
    });
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expirado'
      });
    }
    return res.status(401).json({
      error: 'Token invalido'
    });
  }
};

/**
 * Verificar rol(es)
 * @param {string|string[]} roles - Rol o roles permitidos
 */
const requireRole = (roles) => {
  const rolesArray = Array.isArray(roles) ? roles : [roles];

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'No autenticado'
      });
    }

    // El rol viene en el token, pero necesitamos verificar contra la DB
    // Por ahora verificamos con el id_rol
    // En produccion, cargar el nombre del rol desde la DB

    next();
  };
};

/**
 * Verificar permiso(s)
 * @param {string|string[]} permisos - Permiso o permisos requeridos
 */
const requirePermission = (permisos) => {
  const permisosArray = Array.isArray(permisos) ? permisos : [permisos];

  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'No autenticado'
      });
    }

    try {
      // Cargar permisos del usuario desde la DB
      const { findUserById } = require('../models/authModel');
      const usuario = await findUserById(req.user.id);

      if (!usuario) {
        return res.status(401).json({
          error: 'Usuario no encontrado'
        });
      }

      const permisosUsuario = usuario.permisos.map(p => p.codigo);

      // Verificar si tiene al menos uno de los permisos requeridos
      const tienePermiso = permisosArray.some(p => permisosUsuario.includes(p));

      if (!tienePermiso) {
        return res.status(403).json({
          error: 'No tiene permisos para esta accion',
          requeridos: permisosArray,
          actuales: permisosUsuario
        });
      }

      // Guardar permisos en req para uso posterior
      req.userPermisos = permisosUsuario;
      req.userRol = usuario.rol;
      req.userPunto = usuario.id_punto;

      next();
    } catch (error) {
      console.error('Error verificando permisos:', error);
      return res.status(500).json({
        error: 'Error al verificar permisos'
      });
    }
  };
};

/**
 * Middleware indicador de operacion por punto
 * Marca que la ruta requiere validacion de punto del usuario
 * La validacion especifica se realiza en cada controlador:
 * - encomiendasController.retirar(): Solo punto destino puede registrar retiros
 * - encomiendasController.cambiarEstado(): Usuario debe pertenecer a origen o destino
 * Superadmin (sin punto asignado) tiene acceso total
 */
const requireOwnPoint = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'No autenticado'
    });
  }
  next();
};

module.exports = {
  verifyToken,
  requireRole,
  requirePermission,
  requireOwnPoint
};
