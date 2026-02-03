/**
 * Roles Controller
 * Controlador para gestion de roles
 */

const prisma = require('../config/prisma');

/**
 * Listar roles activos
 * GET /api/roles
 */
const listar = async (req, res) => {
  try {
    const roles = await prisma.rol.findMany({
      where: { estado: 1 },
      select: {
        id: true,
        nombre: true
      },
      orderBy: { id: 'asc' }
    });

    // Mapear nombres amigables
    const rolesConLabel = roles.map(rol => ({
      id: rol.id,
      nombre: rol.nombre,
      label: getLabelRol(rol.nombre)
    }));

    res.json({ roles: rolesConLabel });
  } catch (error) {
    console.error('Error listando roles:', error);
    res.status(500).json({ error: 'Error al listar roles' });
  }
};

/**
 * Obtener label amigable para rol
 */
const getLabelRol = (nombre) => {
  const labels = {
    'SUPER_ADMIN': 'Super Administrador',
    'ADMINISTRADOR': 'Administrador',
    'PUNTO_VENTA': 'Punto de Venta',
    'ALMACEN': 'Almacen'
  };
  return labels[nombre] || nombre;
};

module.exports = {
  listar
};
