/**
 * Auth Model
 * Consultas de autenticacion y usuarios
 */

const pool = require('../config/db');

/**
 * Buscar usuario por correo con su rol y permisos
 * @param {string} correo - Correo del usuario
 * @returns {Promise<Object|null>} Usuario con sus datos, rol y permisos
 */
const findUserByEmail = async (correo) => {
  const query = `
    SELECT
      u.id,
      u.nombres,
      u.correo,
      u.contrasena,
      u.id_rol,
      u.id_punto,
      r.nombre AS rol,
      COALESCE(
        json_agg(
          DISTINCT jsonb_build_object(
            'codigo', p.codigo,
            'nombre', p.nombre,
            'tipo', p.tipo,
            'recurso', p.recurso
          )
        ) FILTER (WHERE p.id IS NOT NULL),
        '[]'
      ) AS permisos
    FROM tbl_usuarios u
    JOIN tbl_roles r ON u.id_rol = r.id
    LEFT JOIN tbl_roles_permisos rp ON r.id = rp.id_rol AND rp.estado = 1
    LEFT JOIN tbl_permisos p ON rp.id_permiso = p.id AND p.estado = 1
    WHERE u.correo = $1
      AND u.estado = 1
    GROUP BY u.id, u.nombres, u.correo, u.contrasena, u.id_rol, u.id_punto, r.nombre
  `;

  const result = await pool.query(query, [correo]);

  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Buscar usuario por ID
 * @param {number} id - ID del usuario
 * @returns {Promise<Object|null>} Usuario con sus datos
 */
const findUserById = async (id) => {
  const query = `
    SELECT
      u.id,
      u.nombres,
      u.correo,
      u.id_rol,
      u.id_punto,
      r.nombre AS rol,
      COALESCE(
        json_agg(
          DISTINCT jsonb_build_object(
            'codigo', p.codigo,
            'nombre', p.nombre,
            'tipo', p.tipo,
            'recurso', p.recurso
          )
        ) FILTER (WHERE p.id IS NOT NULL),
        '[]'
      ) AS permisos
    FROM tbl_usuarios u
    JOIN tbl_roles r ON u.id_rol = r.id
    LEFT JOIN tbl_roles_permisos rp ON r.id = rp.id_rol AND rp.estado = 1
    LEFT JOIN tbl_permisos p ON rp.id_permiso = p.id AND p.estado = 1
    WHERE u.id = $1
      AND u.estado = 1
    GROUP BY u.id, u.nombres, u.correo, u.id_rol, u.id_punto, r.nombre
  `;

  const result = await pool.query(query, [id]);

  return result.rows.length > 0 ? result.rows[0] : null;
};

module.exports = {
  findUserByEmail,
  findUserById
};
