/**
 * Filtros del listado de encomiendas
 */

// Parámetros de ruta: campo de Prisma y nombre para el mensaje de error
const CAMPOS_RUTA = [
  { campo: 'idPuntoOrigen', etiqueta: 'El origen' },
  { campo: 'idPuntoDestino', etiqueta: 'El destino' }
];

const ENTERO_POSITIVO = /^[1-9]\d*$/;

/**
 * Filtro por ruta (origen y/o destino) a partir de la query del listado
 * @param {{idPuntoOrigen?: string, idPuntoDestino?: string}} query - Valores vacíos o ausentes no filtran
 * @returns {{filtro: Object} | {error: string}}
 */
const filtroRuta = (query = {}) => {
  const filtro = {};

  for (const { campo, etiqueta } of CAMPOS_RUTA) {
    const valor = query[campo];
    if (valor === undefined || valor === '') continue;

    if (typeof valor !== 'string' || !ENTERO_POSITIVO.test(valor)) {
      return { error: `${etiqueta} del filtro no es válido` };
    }
    filtro[campo] = Number(valor);
  }

  return { filtro };
};

module.exports = { filtroRuta };
