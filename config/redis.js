import Redis from 'ioredis';

let redisClient = null;

export function getRedisClient() {
  if (redisClient) return redisClient;

  redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 5) {
        console.error('[Redis] Max retries exceeded');
        return null;
      }
      const delay = Math.min(times * 200, 2000);
      console.warn(`[Redis] Retrying connection in ${delay}ms (attempt ${times})`);
      return delay;
    },
    reconnectOnError(err) {
      const targets = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
      return targets.some(e => err.message.includes(e));
    },
    enableOfflineQueue: true,
    connectTimeout: 10000,
    lazyConnect: false,
  });

  redisClient.on('connect', () => console.log('[Redis] Connected'));
  redisClient.on('ready', () => console.log('[Redis] Ready'));
  redisClient.on('error', (err) => console.error('[Redis] Error:', err.message));
  redisClient.on('close', () => console.warn('[Redis] Connection closed'));
  redisClient.on('reconnecting', () => console.warn('[Redis] Reconnecting...'));

  return redisClient;
}

export async function closeRedis() {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    console.log('[Redis] Disconnected gracefully');
  }
}

export async function pingRedis() {
  try {
    const result = await getRedisClient().ping();
    return result === 'PONG';
  } catch {
    return false;
  }
}
