/**
 * Date Utilities - Utilidades centralizadas para manejo de fechas
 *
 * REGLAS DE DISEÑO:
 * 1. Backend y DB operan SIEMPRE en UTC
 * 2. Frontend convierte a hora local SOLO para mostrar
 * 3. Contrato API: ISO 8601 con "Z" (UTC) - NUNCA fechas naive
 *
 * TIPOS DE DATOS:
 * - Instantes reales (createdAt, eventos, logs): timestamptz en DB
 * - Fechas civiles (cumpleaños, fecha documento): date en DB
 * - Horas de horario (hora salida): time en DB (interpretado como hora local Lima)
 */

/**
 * Obtiene la fecha/hora actual en UTC
 * @returns {Date} Fecha actual (internamente siempre UTC en JS)
 */
const utcNow = () => new Date();

/**
 * Convierte un Date a string ISO UTC con "Z"
 * @param {Date|string} date - Fecha a convertir
 * @returns {string} ISO 8601 con "Z" (ej: "2026-01-24T15:30:00.000Z")
 */
const toUtcIso = (date) => {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString();
};

/**
 * Parsea una fecha del cliente (API request)
 * Acepta SOLO:
 * - ISO 8601 con Z: "2026-01-24T15:30:00.000Z"
 * - ISO 8601 con offset: "2026-01-24T10:30:00-05:00"
 * - Epoch milliseconds (number)
 *
 * RECHAZA fechas naive (sin zona horaria)
 *
 * @param {string|number} input - Fecha del cliente
 * @param {string} fieldName - Nombre del campo (para mensajes de error)
 * @returns {{ date: Date|null, error: string|null }}
 */
const parseClientDateTime = (input, fieldName = 'fecha') => {
  if (input === null || input === undefined) {
    return { date: null, error: null };
  }

  // Epoch milliseconds
  if (typeof input === 'number') {
    const d = new Date(input);
    if (isNaN(d.getTime())) {
      return { date: null, error: `${fieldName}: epoch inválido` };
    }
    return { date: d, error: null };
  }

  if (typeof input !== 'string') {
    return { date: null, error: `${fieldName}: tipo inválido, esperado string o number` };
  }

  // ISO 8601 con Z o offset
  // Patrones válidos:
  // - 2026-01-24T15:30:00Z
  // - 2026-01-24T15:30:00.000Z
  // - 2026-01-24T10:30:00-05:00
  // - 2026-01-24T10:30:00+00:00
  const isoWithTz = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;

  if (isoWithTz.test(input)) {
    const d = new Date(input);
    if (isNaN(d.getTime())) {
      return { date: null, error: `${fieldName}: fecha inválida` };
    }
    return { date: d, error: null };
  }

  // Rechazar fechas naive
  return {
    date: null,
    error: `${fieldName}: formato inválido. Use ISO 8601 con timezone (ej: 2026-01-24T15:30:00Z)`
  };
};

/**
 * Parsea una fecha civil (solo fecha, sin hora)
 * Acepta: "YYYY-MM-DD" (interpretado como fecha civil, no instante)
 *
 * @param {string} input - Fecha en formato YYYY-MM-DD
 * @param {string} fieldName - Nombre del campo
 * @returns {{ date: Date|null, error: string|null }}
 */
const parseCivilDate = (input, fieldName = 'fecha') => {
  if (!input) {
    return { date: null, error: null };
  }

  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(input)) {
    return { date: null, error: `${fieldName}: formato inválido, use YYYY-MM-DD` };
  }

  const [year, month, day] = input.split('-').map(Number);
  // Crear fecha en UTC a medianoche para evitar problemas de timezone
  const d = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));

  if (isNaN(d.getTime())) {
    return { date: null, error: `${fieldName}: fecha inválida` };
  }

  return { date: d, error: null };
};

/**
 * Parsea una hora (HH:mm o HH:mm:ss)
 * Retorna un objeto con horas y minutos
 *
 * @param {string} input - Hora en formato HH:mm o HH:mm:ss
 * @param {string} fieldName - Nombre del campo
 * @returns {{ hours: number, minutes: number, seconds: number, error: string|null }}
 */
const parseTime = (input, fieldName = 'hora') => {
  if (!input) {
    return { hours: null, minutes: null, seconds: null, error: `${fieldName}: es requerido` };
  }

  const timePattern = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
  const match = input.match(timePattern);

  if (!match) {
    return { hours: null, minutes: null, seconds: null, error: `${fieldName}: formato inválido, use HH:mm` };
  }

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = match[3] ? parseInt(match[3], 10) : 0;

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) {
    return { hours: null, minutes: null, seconds: null, error: `${fieldName}: valores fuera de rango` };
  }

  return { hours, minutes, seconds, error: null };
};

/**
 * Crea un Date para almacenar una hora de horario
 * IMPORTANTE: Las horas de horario representan horas civiles de Perú (America/Lima)
 * Pero como Prisma/Postgres las almacena sin timezone, usamos una fecha fija
 * con la hora especificada para evitar conversiones de timezone.
 *
 * @param {number} hours - Hora (0-23)
 * @param {number} minutes - Minutos (0-59)
 * @param {number} seconds - Segundos (0-59)
 * @returns {Date}
 */
const createTimeForDB = (hours, minutes, seconds = 0) => {
  // Usamos 1970-01-01 como fecha base fija
  // La hora se interpreta como hora civil (Perú), sin conversión de timezone
  // Prisma enviará esto como TIME sin timezone a PostgreSQL
  const d = new Date(Date.UTC(1970, 0, 1, hours, minutes, seconds, 0));
  return d;
};

/**
 * Extrae hora y minutos de un campo TIME de la base de datos
 * @param {Date|string} timeValue - Valor del campo TIME
 * @returns {{ hours: number, minutes: number }}
 */
const extractTimeFromDB = (timeValue) => {
  if (!timeValue) return { hours: 0, minutes: 0 };

  const d = timeValue instanceof Date ? timeValue : new Date(timeValue);

  // Para campos TIME, extraemos UTC hours/minutes porque así los guardamos
  return {
    hours: d.getUTCHours(),
    minutes: d.getUTCMinutes()
  };
};

/**
 * Formatea una hora para mostrar en API (formato HH:mm, 24h)
 * @param {Date|string} timeValue - Valor del campo TIME
 * @returns {string} Hora formateada "HH:mm"
 */
const formatTimeForAPI = (timeValue) => {
  const { hours, minutes } = extractTimeFromDB(timeValue);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

/**
 * Obtiene la fecha actual en Perú como string YYYY-MM-DD
 * Útil para generar códigos de tracking/tickets
 * @returns {string} Fecha en formato YYYYMMDD
 */
const getFechaPeruYYYYMMDD = () => {
  const now = new Date();
  // Usar Intl para obtener componentes de fecha en zona horaria Lima
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  // en-CA devuelve formato YYYY-MM-DD
  return formatter.format(now).replace(/-/g, '');
};

/**
 * Verifica si una hora (en formato de BD) ya pasó para hoy
 * Compara con la hora actual en Perú
 * @param {Date|string} timeValue - Hora del horario (campo TIME de BD)
 * @returns {boolean} true si la hora ya pasó
 */
const hasTimePassed = (timeValue) => {
  const { hours: scheduleHours, minutes: scheduleMinutes } = extractTimeFromDB(timeValue);

  // Obtener hora actual en Perú
  const now = new Date();
  const peruTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Lima' }));
  const currentHours = peruTime.getHours();
  const currentMinutes = peruTime.getMinutes();

  // Comparar
  if (scheduleHours < currentHours) return true;
  if (scheduleHours === currentHours && scheduleMinutes <= currentMinutes) return true;
  return false;
};

/**
 * Verifica si una fecha (YYYY-MM-DD) es hoy en Perú
 * @param {string} dateStr - Fecha en formato YYYY-MM-DD
 * @returns {boolean}
 */
const isToday = (dateStr) => {
  const todayPeru = getFechaPeruYYYYMMDD();
  const inputDate = dateStr.replace(/-/g, '');
  return todayPeru === inputDate;
};

/**
 * Verifica si una fecha es anterior a hoy en Perú
 * @param {string} dateStr - Fecha en formato YYYY-MM-DD
 * @returns {boolean}
 */
const isBeforeToday = (dateStr) => {
  const todayPeru = getFechaPeruYYYYMMDD();
  const inputDate = dateStr.replace(/-/g, '');
  return inputDate < todayPeru;
};

module.exports = {
  utcNow,
  toUtcIso,
  parseClientDateTime,
  parseCivilDate,
  parseTime,
  createTimeForDB,
  extractTimeFromDB,
  formatTimeForAPI,
  getFechaPeruYYYYMMDD,
  hasTimePassed,
  isToday,
  isBeforeToday
};
