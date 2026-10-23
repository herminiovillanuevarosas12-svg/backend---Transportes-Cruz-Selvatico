/**
 * Flota Controller
 * CRUD de conductores y buses (listas que se eligen al generar el manifiesto).
 * Ambos comparten el mismo flujo; cada uno define tabla, validación, formato, duplicados y referencias.
 */

const prisma = require('../config/prisma');
const { registrarAuditoria } = require('../services/auditoriaService');
const { utcNow } = require('../utils/dateUtils');
const {
  normalizarConductor,
  normalizarBus,
  formatearConductor,
  formatearBus,
  aColumnas
} = require('../services/flotaService');

/**
 * @param {Object} config
 * @param {string} config.modelo - Modelo Prisma
 * @param {string} config.entidad - Prefijo de auditoría (CONDUCTOR, BUS)
 * @param {string} config.nombre - Nombre visible en mensajes
 * @param {string} config.clave - Clave del objeto en la respuesta
 * @param {string} config.claveLista - Clave de la lista en la respuesta
 * @param {Function} config.normalizar - body -> { datos } | { error }
 * @param {Function} config.formatear - fila -> objeto de la API
 * @param {Object[]} config.orden - orderBy del listado
 * @param {Array<{columna: string, mensaje: string}>} config.duplicados - Columnas únicas entre activos
 * @param {Object} [config.incluir] - Relaciones que necesita formatear (include de Prisma)
 * @param {Array<{modelo: string, columna: string, mensaje: string}>} [config.referencias] - Columnas que
 *   apuntan a un registro de otro modelo, que debe existir y estar activo
 */
const crearControladorFlota = (config) => {
  const tabla = prisma[config.modelo];

  const buscarDuplicado = async (columnas, idExcluido = null) => {
    for (const { columna, mensaje } of config.duplicados) {
      const existente = await tabla.findFirst({
        where: {
          [columna]: columnas[columna],
          estado: 1,
          ...(idExcluido && { id: { not: idExcluido } })
        }
      });
      if (existente) return mensaje;
    }
    return null;
  };

  const buscarReferenciaInactiva = async (columnas) => {
    for (const { modelo, columna, mensaje } of config.referencias || []) {
      const activo = await prisma[modelo].findFirst({ where: { id: columnas[columna], estado: 1 } });
      if (!activo) return mensaje;
    }
    return null;
  };

  // Mensaje de error si las columnas a guardar duplican un activo o apuntan a un inactivo
  const validarColumnas = async (columnas, idExcluido = null) =>
    (await buscarDuplicado(columnas, idExcluido)) || buscarReferenciaInactiva(columnas);

  const buscarActivo = (id) => tabla.findFirst({ where: { id, estado: 1 } });

  const listar = async (req, res) => {
    try {
      const filas = await tabla.findMany({ where: { estado: 1 }, orderBy: config.orden, include: config.incluir });
      res.json({ [config.claveLista]: filas.map(config.formatear) });
    } catch (error) {
      console.error(`Error listando ${config.claveLista}:`, error);
      res.status(500).json({ error: `Error al listar ${config.claveLista}` });
    }
  };

  const crear = async (req, res) => {
    try {
      const { datos, error } = config.normalizar(req.body);
      if (error) {
        return res.status(400).json({ error });
      }

      const columnas = aColumnas(datos);
      const errorColumnas = await validarColumnas(columnas);
      if (errorColumnas) {
        return res.status(400).json({ error: errorColumnas });
      }

      const fila = await tabla.create({
        data: { ...columnas, estado: 1, user_id_registration: req.user.id },
        include: config.incluir
      });

      await registrarAuditoria(req.user.id, `${config.entidad}_CREADO`, config.entidad, fila.id, fila);

      res.status(201).json({
        mensaje: `${config.nombre} creado exitosamente`,
        [config.clave]: config.formatear(fila)
      });
    } catch (error) {
      console.error(`Error creando ${config.clave}:`, error);
      res.status(500).json({ error: `Error al crear ${config.clave}` });
    }
  };

  const actualizar = async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const anterior = await buscarActivo(id);
      if (!anterior) {
        return res.status(404).json({ error: `${config.nombre} no encontrado` });
      }

      const { datos, error } = config.normalizar(req.body);
      if (error) {
        return res.status(400).json({ error });
      }

      const columnas = aColumnas(datos);
      const errorColumnas = await validarColumnas(columnas, id);
      if (errorColumnas) {
        return res.status(400).json({ error: errorColumnas });
      }

      const fila = await tabla.update({
        where: { id },
        data: { ...columnas, user_id_modification: req.user.id, date_time_modification: utcNow() },
        include: config.incluir
      });

      await registrarAuditoria(req.user.id, `${config.entidad}_ACTUALIZADO`, config.entidad, id, {
        anterior,
        nuevo: fila
      });

      res.json({
        mensaje: `${config.nombre} actualizado exitosamente`,
        [config.clave]: config.formatear(fila)
      });
    } catch (error) {
      console.error(`Error actualizando ${config.clave}:`, error);
      res.status(500).json({ error: `Error al actualizar ${config.clave}` });
    }
  };

  // Soft delete: los manifiestos ya emitidos guardan su propia copia de los datos
  const eliminar = async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (!(await buscarActivo(id))) {
        return res.status(404).json({ error: `${config.nombre} no encontrado` });
      }

      const fila = await tabla.update({
        where: { id },
        data: { estado: 0, user_id_modification: req.user.id, date_time_modification: utcNow() }
      });

      await registrarAuditoria(req.user.id, `${config.entidad}_ELIMINADO`, config.entidad, id, fila);

      res.json({ mensaje: `${config.nombre} eliminado exitosamente` });
    } catch (error) {
      console.error(`Error eliminando ${config.clave}:`, error);
      res.status(500).json({ error: `Error al eliminar ${config.clave}` });
    }
  };

  return { listar, crear, actualizar, eliminar };
};

const conductores = crearControladorFlota({
  modelo: 'tbl_conductores',
  entidad: 'CONDUCTOR',
  nombre: 'Conductor',
  clave: 'conductor',
  claveLista: 'conductores',
  normalizar: normalizarConductor,
  formatear: formatearConductor,
  orden: [{ apellidos: 'asc' }, { nombres: 'asc' }],
  duplicados: [
    { columna: 'numero_documento', mensaje: 'Ya existe un conductor con ese documento' }
  ]
});

const buses = crearControladorFlota({
  modelo: 'tbl_buses',
  entidad: 'BUS',
  nombre: 'Bus',
  clave: 'bus',
  claveLista: 'buses',
  normalizar: normalizarBus,
  formatear: formatearBus,
  orden: [{ numero_interno: 'asc' }],
  duplicados: [
    { columna: 'placa', mensaje: 'Ya existe un bus con esa placa' },
    { columna: 'numero_interno', mensaje: 'Ya existe un bus con ese número' }
  ],
  incluir: { tbl_tipos_carro: { select: { nombre: true } } },
  referencias: [
    { modelo: 'tipoCarro', columna: 'id_tipo_carro', mensaje: 'El tipo de vehículo no existe o fue eliminado' }
  ]
});

module.exports = { conductores, buses };
