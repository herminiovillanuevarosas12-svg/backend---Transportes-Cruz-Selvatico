/**
 * Acceso a Encomiendas Service
 * Reglas de qué encomiendas ve un usuario con punto asignado y qué estados puede avanzar.
 * - Origen: ve sus encomiendas siempre.
 * - Destino: las ve en el listado desde que llegaron; por código (escaneo) desde que salen en ruta.
 * - Usuario sin punto (superadmin/administrador): sin restricciones.
 */

const { EstadoEncomienda } = require('@prisma/client');

const ROL_ORIGEN = 'ORIGEN';
const ROL_DESTINO = 'DESTINO';

// Flujo único de estados (solo hacia adelante)
const SIGUIENTE_ESTADO = Object.freeze({
  [EstadoEncomienda.REGISTRADO]: EstadoEncomienda.EN_ALMACEN,
  [EstadoEncomienda.EN_ALMACEN]: EstadoEncomienda.EN_RUTA,
  [EstadoEncomienda.EN_RUTA]: EstadoEncomienda.LLEGO_A_DESTINO,
  [EstadoEncomienda.LLEGO_A_DESTINO]: EstadoEncomienda.RETIRADO
});

// Qué punto puede llevar la encomienda a cada estado
const ROLES_POR_ESTADO_DESTINO = Object.freeze({
  [EstadoEncomienda.EN_ALMACEN]: [ROL_ORIGEN],
  [EstadoEncomienda.EN_RUTA]: [ROL_ORIGEN],
  [EstadoEncomienda.LLEGO_A_DESTINO]: [ROL_ORIGEN, ROL_DESTINO],
  [EstadoEncomienda.RETIRADO]: [ROL_DESTINO]
});

// Estados en que el destino ve la encomienda en el listado y por consulta directa
const ESTADOS_LISTADO_DESTINO = [EstadoEncomienda.LLEGO_A_DESTINO, EstadoEncomienda.RETIRADO];
const ESTADOS_CONSULTA_DESTINO = [EstadoEncomienda.EN_RUTA, ...ESTADOS_LISTADO_DESTINO];

const NOMBRE_ROL = { [ROL_ORIGEN]: 'origen', [ROL_DESTINO]: 'destino' };

// 'LLEGO_A_DESTINO' -> 'Llego a destino'
const etiquetaEstado = (estado) => {
  const texto = String(estado).replace(/_/g, ' ').toLowerCase();
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};

/**
 * Rol del punto del usuario respecto a la encomienda
 * @param {number|null} idPunto
 * @param {{idPuntoOrigen: number, idPuntoDestino: number}} encomienda
 * @returns {'ORIGEN'|'DESTINO'|null}
 */
const rolDelPunto = (idPunto, encomienda) => {
  if (idPunto === encomienda.idPuntoOrigen) return ROL_ORIGEN;
  if (idPunto === encomienda.idPuntoDestino) return ROL_DESTINO;
  return null;
};

/**
 * Filtro Prisma del listado para un usuario con punto
 * @param {number|null} idPunto
 * @returns {Object|null} null si el usuario no tiene punto (ve todo)
 */
const filtroListado = (idPunto) => {
  if (!idPunto) return null;
  return {
    OR: [
      { idPuntoOrigen: idPunto },
      { idPuntoDestino: idPunto, estadoActual: { in: ESTADOS_LISTADO_DESTINO } }
    ]
  };
};

/**
 * Consulta directa (código, id, impresión, QR)
 * @param {number|null} idPunto
 * @param {{idPuntoOrigen: number, idPuntoDestino: number, estadoActual: string}} encomienda
 * @returns {boolean}
 */
const puedeConsultar = (idPunto, encomienda) => {
  if (!idPunto) return true;
  const rol = rolDelPunto(idPunto, encomienda);
  if (rol === ROL_ORIGEN) return true;
  return rol === ROL_DESTINO && ESTADOS_CONSULTA_DESTINO.includes(encomienda.estadoActual);
};

/**
 * Siguiente estado de la encomienda y si el usuario puede aplicarlo
 * @param {number|null} idPunto
 * @param {Object} encomienda - idPuntoOrigen, idPuntoDestino, estadoActual y opcionalmente puntoOrigen/puntoDestino con nombre
 * @returns {{siguienteEstado: string|null, permitida: boolean, motivo: string|null}}
 */
const evaluarTransicion = (idPunto, encomienda) => {
  const siguienteEstado = SIGUIENTE_ESTADO[encomienda.estadoActual] || null;
  if (!siguienteEstado) {
    return { siguienteEstado: null, permitida: false, motivo: 'La encomienda no tiene un siguiente estado' };
  }
  if (!idPunto) {
    return { siguienteEstado, permitida: true, motivo: null };
  }

  const rol = rolDelPunto(idPunto, encomienda);
  if (!rol) {
    return { siguienteEstado, permitida: false, motivo: 'La encomienda no pertenece a su punto de operación' };
  }

  const rolesAutorizados = ROLES_POR_ESTADO_DESTINO[siguienteEstado];
  if (rolesAutorizados.includes(rol)) {
    return { siguienteEstado, permitida: true, motivo: null };
  }

  const rolAutorizado = rolesAutorizados[0];
  const punto = rolAutorizado === ROL_ORIGEN ? encomienda.puntoOrigen : encomienda.puntoDestino;
  const nombrePunto = punto?.nombre ? ` "${punto.nombre}"` : '';
  return {
    siguienteEstado,
    permitida: false,
    motivo: `Solo el punto de ${NOMBRE_ROL[rolAutorizado]}${nombrePunto} puede pasarla a ${etiquetaEstado(siguienteEstado)}`
  };
};

module.exports = {
  SIGUIENTE_ESTADO,
  rolDelPunto,
  filtroListado,
  puedeConsultar,
  evaluarTransicion
};
