/*
 * logger.js
 * 
 * Simple structured logging utility.
 * In a real production app, this would integrate with Sentry, DataDog, etc.
 */

const isDev = process.env.NODE_ENV !== 'production';

export const logger = {
  info: (msg, data = {}) => {
    if (isDev) console.log(`[INFO] ${msg}`, Object.keys(data).length ? data : '');
  },
  warn: (msg, data = {}) => {
    if (isDev) console.warn(`[WARN] ${msg}`, Object.keys(data).length ? data : '');
  },
  error: (msg, err, data = {}) => {
    console.error(`[ERROR] ${msg}`, err, Object.keys(data).length ? data : '');
    // Sentry.captureException(err, { extra: data }); // Stub for production
  },
  debug: (msg, data = {}) => {
    if (isDev) console.debug(`[DEBUG] ${msg}`, Object.keys(data).length ? data : '');
  },
  performance: (label, durationMs) => {
    if (isDev) console.info(`[PERF] ${label}: ${durationMs}ms`);
  }
};
