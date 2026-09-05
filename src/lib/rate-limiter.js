/*
 * rate-limiter.js
 * 
 * In-memory sliding window rate limiter for API endpoints.
 * Tracks request timestamps per key (e.g. merchant_id or IP).
 * 
 * Automatically expires and cleans up old entries to prevent memory leaks.
 */

class RateLimiter {
  constructor() {
    this.store = new Map();
    // Periodically clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Check if request is allowed under rate limit rules.
   * 
   * @param {string} key - Identifier (e.g. merchant_id, IP address)
   * @param {Object} options
   * @param {number} options.limit - Max allowed requests in window (default 30)
   * @param {number} options.windowMs - Time window in milliseconds (default 60000 = 1 min)
   * @returns {Object} { allowed: boolean, remaining: number, resetTimeMs: number, retryAfterSec: number, total: number }
   */
  check(key, options = {}) {
    const limit = options.limit || 30;
    const windowMs = options.windowMs || 60000;
    const now = Date.now();
    const windowStart = now - windowMs;

    let timestamps = this.store.get(key);
    if (!timestamps) {
      timestamps = [];
      this.store.set(key, timestamps);
    }

    // Filter out timestamps outside the active window
    const validTimestamps = timestamps.filter(t => t > windowStart);
    this.store.set(key, validTimestamps);

    const count = validTimestamps.length;
    const allowed = count < limit;

    if (allowed) {
      validTimestamps.push(now);
    }

    const oldestTimestamp = validTimestamps[0] || now;
    const resetTimeMs = oldestTimestamp + windowMs;
    const retryAfterSec = Math.max(1, Math.ceil((resetTimeMs - now) / 1000));
    const remaining = Math.max(0, limit - (allowed ? count + 1 : count));

    return {
      allowed,
      limit,
      remaining,
      resetTimeMs,
      retryAfterSec,
      total: allowed ? count + 1 : count,
    };
  }

  /**
   * Reset rate limit state for a key (useful in testing)
   */
  reset(key) {
    if (key) {
      this.store.delete(key);
    } else {
      this.store.clear();
    }
  }

  /**
   * Remove keys with no active timestamps
   */
  cleanup() {
    const now = Date.now();
    for (const [key, timestamps] of this.store.entries()) {
      const active = timestamps.filter(t => t > now - 3600000); // 1 hour max
      if (active.length === 0) {
        this.store.delete(key);
      } else {
        this.store.set(key, active);
      }
    }
  }
}

const defaultLimiter = new RateLimiter();

module.exports = {
  RateLimiter,
  rateLimiter: defaultLimiter,
  checkRateLimit: (key, opts) => defaultLimiter.check(key, opts),
};
