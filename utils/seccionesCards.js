/**
 * Logica pura de las secciones de cards de /encomiendas-info
 * (tbl_encomiendas_secciones_cards + tbl_encomiendas_ventajas).
 */

// Largo de la columna titulo (VARCHAR(200)) en ambas tablas
const TITULO_MAX = 200;

const ERRORES_ESQUEMA_PENDIENTE = ['42P01', '42703'];

const esTextoVacio = (valor) => valor === undefined || valor === null || String(valor).trim() === '';

/**
 * Valida y normaliza un titulo obligatorio.
 * @returns {{ titulo: string|null, error: string|null }}
 */
const validarTitulo = (valor) => {
  if (esTextoVacio(valor)) {
    return { titulo: null, error: 'El título es obligatorio' };
  }
  const titulo = String(valor).trim();
  if (titulo.length > TITULO_MAX) {
    return { titulo: null, error: `El título no puede superar ${TITULO_MAX} caracteres` };
  }
  return { titulo, error: null };
};

/**
 * Un orden valido es un array no vacio de enteros positivos sin repetir.
 */
const validarIdsOrden = (ids) =>
  Array.isArray(ids) &&
  ids.length > 0 &&
  ids.every((id) => Number.isInteger(id) && id > 0) &&
  new Set(ids).size === ids.length;

/**
 * Cambios de una card a partir del body (multipart): solo los campos enviados,
 * para que la edicion inline de un campo no borre los demas.
 * @returns {{ cambios: object, quitarImagen: boolean, error: string|null }}
 */
const construirCambiosCard = (body) => {
  const datos = body || {};
  const cambios = {};
  const enviado = (campo) => Object.prototype.hasOwnProperty.call(datos, campo) && datos[campo] !== undefined;

  if (enviado('titulo')) {
    const { titulo, error } = validarTitulo(datos.titulo);
    if (error) return { cambios: {}, quitarImagen: false, error };
    cambios.titulo = titulo;
  }
  if (enviado('descripcion')) {
    cambios.descripcion = esTextoVacio(datos.descripcion) ? null : String(datos.descripcion).trim();
  }
  if (enviado('icono')) {
    cambios.icono = esTextoVacio(datos.icono) ? null : String(datos.icono).trim();
  }

  const quitarImagen = datos.quitarImagen === true || datos.quitarImagen === 'true';

  return { cambios, quitarImagen, error: null };
};

/**
 * Anida las cards dentro de su seccion (card.idSeccion === seccion.id),
 * respetando el orden en que llegan ambas listas.
 */
const agruparSecciones = (secciones, cards, { omitirVacias = false } = {}) => {
  const cardsPorSeccion = new Map();
  for (const card of cards) {
    if (!cardsPorSeccion.has(card.idSeccion)) cardsPorSeccion.set(card.idSeccion, []);
    cardsPorSeccion.get(card.idSeccion).push(card);
  }

  const resultado = secciones.map((seccion) => ({
    ...seccion,
    cards: cardsPorSeccion.get(seccion.id) || []
  }));

  return omitirVacias ? resultado.filter((seccion) => seccion.cards.length > 0) : resultado;
};

/**
 * Tabla o columna inexistente: el script SQL aun no se corrio en este entorno.
 * Prisma envuelve el codigo de Postgres en error.meta.code.
 */
const esErrorEsquemaPendiente = (error) =>
  ERRORES_ESQUEMA_PENDIENTE.includes(error?.code) ||
  ERRORES_ESQUEMA_PENDIENTE.includes(error?.meta?.code);

module.exports = {
  TITULO_MAX,
  validarTitulo,
  validarIdsOrden,
  construirCambiosCard,
  agruparSecciones,
  esErrorEsquemaPendiente
};
