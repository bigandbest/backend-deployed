import 'dotenv/config';
import { getChannel, QUEUE_REVIEW } from '../lib/queue.js';
import prisma from '../config/prisma.js';
import { redisDel } from '../lib/redis.js';
import { reviewsKey, productKey } from '../lib/cacheKeys.js';

const startWorker = async () => {
  const ch = await getChannel();
  await ch.assertQueue(QUEUE_REVIEW, { durable: true });
  ch.prefetch(1);

  console.log(`[Worker:${QUEUE_REVIEW}] Listening`);

  ch.consume(QUEUE_REVIEW, async (msg) => {
    if (!msg) return;

    let payload;
    try {
      payload = JSON.parse(msg.content.toString());
    } catch {
      console.error(`[Worker:${QUEUE_REVIEW}] Invalid JSON — discarding`);
      ch.nack(msg, false, false);
      return;
    }

    const {
      product_id,
      user_id,
      user_name,
      user_email,
      rating,
      comment,
      timestamp,
    } = payload;

    try {
      await prisma.product_reviews.create({
        data: {
          product_id,
          user_id: user_id || null,
          user_name,
          user_email: user_email || null,
          rating: parseInt(rating),
          comment,
          is_verified_purchase: false,
        },
      });

      // Invalidate review list and product (rating average embedded in product response)
      await Promise.all([
        redisDel(reviewsKey(product_id)),
        redisDel(productKey(product_id)),
      ]);

      console.log(`[Worker:${QUEUE_REVIEW}] Saved review for product=${product_id} (queued at ${timestamp})`);
      ch.ack(msg);
    } catch (err) {
      console.error(`[Worker:${QUEUE_REVIEW}] DB write failed:`, err.message);
      ch.nack(msg, false, false);
    }
  });

  const shutdown = async (signal) => {
    console.log(`[Worker:${QUEUE_REVIEW}] ${signal} — shutting down`);
    try { await ch.close(); } catch {}
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
};

startWorker().catch((err) => {
  console.error(`[Worker:${QUEUE_REVIEW}] Startup failed:`, err.message);
  process.exit(1);
});
