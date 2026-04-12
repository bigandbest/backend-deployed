import 'dotenv/config';
import amqplib from 'amqplib';
import { geocodeAddress } from '../utils/geocode.js';
import { routeSubOrders } from '../services/fulfillmentRouter.js';
import prisma from '../config/prisma.js';

const RABBITMQ_URL = process.env.RABBITMQ_URL;

const QUEUES = {
  GEOCODE:     'geocode_order',
  FULFILLMENT: 'fulfillment_routing',
};

// Retry with exponential backoff
const withRetry = async (label, fn, maxAttempts = 3) => {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isLast = attempt === maxAttempts;
      console.warn(`[${label}] Attempt ${attempt}/${maxAttempts} failed: ${err.message}`);
      if (isLast) throw err;
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1))); // 1s, 2s, 4s
    }
  }
};

const startWorkers = async () => {
  let conn, ch;

  const connect = async () => {
    conn = await amqplib.connect(RABBITMQ_URL);
    ch = await conn.createChannel();

    await ch.assertQueue(QUEUES.GEOCODE,     { durable: true });
    await ch.assertQueue(QUEUES.FULFILLMENT, { durable: true });

    // Process one message at a time per worker process (fair dispatch)
    ch.prefetch(1);

    conn.on('close', () => {
      console.warn('[Workers] Connection closed — reconnecting in 5s');
      setTimeout(connect, 5000);
    });

    conn.on('error', err => {
      console.error('[Workers] Connection error:', err.message);
    });

    // ── Geocode worker ──────────────────────────────────────────────────────
    ch.consume(QUEUES.GEOCODE, async (msg) => {
      if (!msg) return;

      let payload;
      try {
        payload = JSON.parse(msg.content.toString());
      } catch {
        console.error('[geocode] Invalid JSON in message — discarding');
        ch.nack(msg, false, false);
        return;
      }

      const { orderId, addressString } = payload;
      console.log(`[geocode] Processing order ${orderId}`);

      try {
        await withRetry('geocode', async () => {
          const geo = await geocodeAddress(addressString);
          if (geo?.latitude && geo?.longitude) {
            await prisma.orders.update({
              where: { id: orderId },
              data: {
                delivery_latitude:  geo.latitude,
                delivery_longitude: geo.longitude,
              },
            });
            console.log(`[geocode] Coordinates saved for order ${orderId}`);
          } else {
            console.warn(`[geocode] No coordinates returned for order ${orderId}`);
          }
        });
        ch.ack(msg);
      } catch (err) {
        console.error(`[geocode] All retries failed for order ${orderId}:`, err.message);
        // nack without requeue — we've already retried 3 times internally
        ch.nack(msg, false, false);
      }
    });

    // ── Fulfillment routing worker ──────────────────────────────────────────
    ch.consume(QUEUES.FULFILLMENT, async (msg) => {
      if (!msg) return;

      let payload;
      try {
        payload = JSON.parse(msg.content.toString());
      } catch {
        console.error('[fulfillment] Invalid JSON in message — discarding');
        ch.nack(msg, false, false);
        return;
      }

      const { orderId } = payload;
      console.log(`[fulfillment] Routing sub-orders for order ${orderId}`);

      try {
        await withRetry('fulfillment', () => routeSubOrders(orderId));
        console.log(`[fulfillment] Routing complete for order ${orderId}`);
        ch.ack(msg);
      } catch (err) {
        console.error(`[fulfillment] All retries failed for order ${orderId}:`, err.message);
        ch.nack(msg, false, false);
      }
    });

    console.log('[Workers] Listening on all queues');
  };

  await connect();

  // Graceful shutdown — finish processing current message before exit
  const shutdown = async (signal) => {
    console.log(`[Workers] ${signal} received — shutting down gracefully`);
    try {
      await ch?.close();
      await conn?.close();
      await prisma.$disconnect();
    } catch {}
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
};

startWorkers().catch(err => {
  console.error('[Workers] Startup failed:', err.message);
  process.exit(1);
});
