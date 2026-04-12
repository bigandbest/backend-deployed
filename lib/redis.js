// REQUIRES: ioredis (already installed)
// Thin wrapper around the existing ioredis singleton.
// All methods swallow errors — Redis failure must NEVER crash the API.
import redis from '../config/redis.js';

export const getRedisClient = () => redis;

/**
 * Get a JSON value from Redis.
 * Returns parsed value or null on miss/error.
 */
export const redisGet = async (key) => {
  try {
    const val = await redis.get(key);
    return val ? JSON.parse(val) : null;
  } catch (err) {
    console.error(`[Redis] get error for key "${key}":`, err.message);
    return null;
  }
};

/**
 * Set a JSON value in Redis with an expiry.
 * Silently no-ops on error.
 */
export const redisSet = async (key, value, ttlSeconds) => {
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (err) {
    console.error(`[Redis] set error for key "${key}":`, err.message);
  }
};

/**
 * Delete one or more exact keys.
 */
export const redisDel = async (...keys) => {
  try {
    if (!keys.length) return;
    await redis.del(...keys);
  } catch (err) {
    console.error(`[Redis] del error for keys "${keys.join(', ')}":`, err.message);
  }
};

/**
 * Delete all keys matching a glob pattern (SCAN + DEL).
 * Never throws.
 */
export const redisDelPattern = async (pattern) => {
  try {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== '0');
  } catch (err) {
    console.error(`[Redis] delPattern error for pattern "${pattern}":`, err.message);
  }
};

/**
 * Bulk get — returns array of parsed values (null for misses/errors).
 */
export const redisMGet = async (keys) => {
  try {
    if (!keys.length) return [];
    const values = await redis.mget(...keys);
    return values.map((v) => (v ? JSON.parse(v) : null));
  } catch (err) {
    console.error('[Redis] mget error:', err.message);
    return keys.map(() => null);
  }
};
