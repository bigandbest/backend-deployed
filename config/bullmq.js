import { Queue, QueueEvents } from 'bullmq';
import Redis from 'ioredis';

const connection = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
  maxRetriesPerRequest: null, // required by BullMQ
  enableReadyCheck: false,
});

connection.on('error', (err) => console.error('[BullMQ Redis] error:', err.message));

export const priceUpdateQueue = new Queue('bulk-price-update', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

export const priceUpdateQueueEvents = new QueueEvents('bulk-price-update', { connection });

// Delayed job per seller-allocated sub-order — fires once at the accept
// deadline and auto-rejects if the seller still hasn't responded.
export const sellerAcceptTimeoutQueue = new Queue('seller-accept-timeout', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 200,
    removeOnFail: 500,
  },
});

export { connection as bullmqRedis };
