/*
 * timezone.js
 * 
 * Strict Timezone-Aware Datetime & Contact Hours Engine.
 * 
 * Enforces Indian Standard Time (IST: UTC+05:30 / 'Asia/Kolkata')
 * across all customer contact, policy guardian checks, and daily counters
 * regardless of host machine timezone (UTC, US/Pacific, Docker, etc.).
 */

const TIMEZONE_IST = 'Asia/Kolkata';

/**
 * Extract integer hour (0-23) in IST from a Date object or ISO timestamp.
 * 
 * @param {Date|string|number} inputDate - Date, ISO string, or epoch ms
 * @returns {number} Hour in IST (0 to 23)
 */
function getISTHour(inputDate = new Date()) {
  const date = inputDate instanceof Date ? inputDate : new Date(inputDate);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date provided to getISTHour: ${inputDate}`);
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE_IST,
    hour: 'numeric',
    hour12: false,
  });

  const hourStr = formatter.format(date);
  // Intl format can return "24" for midnight in some versions/locales
  const parsed = parseInt(hourStr, 10);
  return parsed === 24 ? 0 : parsed;
}

/**
 * Format a timestamp into an ISO-like string with explicit IST (+05:30) offset.
 * Example: "2026-03-05T14:30:00+05:30"
 * 
 * @param {Date|string|number} inputDate 
 * @returns {string} ISO-formatted string in IST
 */
function toISTString(inputDate = new Date()) {
  const date = inputDate instanceof Date ? inputDate : new Date(inputDate);
  if (isNaN(date.getTime())) return '';

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE_IST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  // formatToParts gives predictable, locale-independent parts
  const parts = formatter.formatToParts(date);
  const map = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }

  const hour = map.hour === '24' ? '00' : map.hour;
  return `${map.year}-${map.month}-${map.day}T${hour}:${map.minute}:${map.second}+05:30`;
}

/**
 * Get the calendar day key in IST (YYYY-MM-DD).
 * Used for calendar-day tracking (daily budgets, daily contact limits).
 * 
 * @param {Date|string|number} inputDate 
 * @returns {string} "YYYY-MM-DD" in IST
 */
function getISTDayKey(inputDate = new Date()) {
  const date = inputDate instanceof Date ? inputDate : new Date(inputDate);
  if (isNaN(date.getTime())) return '';

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE_IST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date); // en-CA produces YYYY-MM-DD
}

/**
 * Check whether a given timestamp or current moment falls within allowed IST contact hours.
 * 
 * @param {Date|string|number} inputDate - Timestamp to check
 * @param {number} startHour - Permissible start hour (e.g. 8)
 * @param {number} cutoffHour - Permissible cutoff hour (e.g. 22)
 * @returns {{ allowed: boolean, currentISTHour: number, formattedIST: string }}
 */
function isWithinISTContactHours(inputDate = new Date(), startHour = 8, cutoffHour = 22) {
  const istHour = getISTHour(inputDate);
  const allowed = istHour >= startHour && istHour < cutoffHour;
  return {
    allowed,
    currentISTHour: istHour,
    formattedIST: toISTString(inputDate),
  };
}

module.exports = {
  TIMEZONE_IST,
  getISTHour,
  toISTString,
  getISTDayKey,
  isWithinISTContactHours,
};
