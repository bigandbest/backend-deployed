import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
  retryStrategy: (times) => Math.min(times * 50, 2000),
  lazyConnect: false,
  enableReadyCheck: true,
  maxRetriesPerRequest: 3,
});

redis.on('error', (err) => console.error('[Redis] connection error:', err.message));
redis.on('ready', () => console.log('[Redis] connected'));

export default redis;
