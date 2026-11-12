/**
 * Pruebas de middleware/authMiddleware.requireRole
 * Ejecutar: npm test (node --test)
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { requireRole } = require('../middleware/authMiddleware');
const { ROLES } = require('../config/roles');

const crearRes = () => {
  const res = { statusCode: null, body: null };
  res.status = (codigo) => { res.statusCode = codigo; return res; };
  res.json = (cuerpo) => { res.body = cuerpo; return res; };
  return res;
};

const ejecutar = async (req, roles) => {
  const res = crearRes();
  let siguiente = false;
  await requireRole(roles)(req, res, () => { siguiente = true; });
  return { res, siguiente };
};

describe('requireRole', () => {
  test('deja pasar al rol permitido', async () => {
    const { res, siguiente } = await ejecutar({ user: { id: 1 }, userRol: ROLES.SUPER_ADMIN }, ROLES.SUPER_ADMIN);
    assert.equal(siguiente, true);
    assert.equal(res.statusCode, null);
  });

  test('acepta una lista de roles', async () => {
    const { siguiente } = await ejecutar({ user: { id: 1 }, userRol: ROLES.SUPER_ADMIN }, [ROLES.SUPER_ADMIN, 'OTRO']);
    assert.equal(siguiente, true);
  });

  test('responde 403 a un rol no permitido aunque tenga permisos', async () => {
    const { res, siguiente } = await ejecutar({ user: { id: 2 }, userRol: 'ADMINISTRADOR' }, ROLES.SUPER_ADMIN);
    assert.equal(siguiente, false);
    assert.equal(res.statusCode, 403);
  });

  test('responde 401 sin usuario autenticado', async () => {
    const { res, siguiente } = await ejecutar({}, ROLES.SUPER_ADMIN);
    assert.equal(siguiente, false);
    assert.equal(res.statusCode, 401);
  });
});
