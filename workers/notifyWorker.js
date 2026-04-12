import 'dotenv/config';
import { getChannel, QUEUE_NOTIFY_ME } from '../lib/queue.js';
import prisma from '../config/prisma.js';

const startWorker = async () => {
  const ch = await getChannel();
  await ch.assertQueue(QUEUE_NOTIFY_ME, { durable: true });
  ch.prefetch(1);

  console.log(`[Worker:${QUEUE_NOTIFY_ME}] Listening`);

  ch.consume(QUEUE_NOTIFY_ME, async (msg) => {
    if (!msg) return;

    let payload;
    try {
      payload = JSON.parse(msg.content.toString());
    } catch {
      console.error(`[Worker:${QUEUE_NOTIFY_ME}] Invalid JSON — discarding`);
      ch.nack(msg, false, false);
      return;
    }

    const { user_id, product_id, variant_id, timestamp } = payload;

    try {
      await prisma.stock_notify_requests.upsert({
        where: { user_id_product_id: { user_id, product_id } },
        update: { notified: false, notified_at: null, variant_id: variant_id || null },
        create: { user_id, product_id, variant_id: variant_id || null },
      });

      console.log(`[Worker:${QUEUE_NOTIFY_ME}] Registered notify for user=${user_id} product=${product_id} (queued at ${timestamp})`);
      ch.ack(msg);
    } catch (err) {
      console.error(`[Worker:${QUEUE_NOTIFY_ME}] DB write failed:`, err.message);
      ch.nack(msg, false, false);
    }
  });

  const shutdown = async (signal) => {
    console.log(`[Worker:${QUEUE_NOTIFY_ME}] ${signal} — shutting down`);
    try { await ch.close(); } catch {}
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
};

startWorker().catch((err) => {
  console.error(`[Worker:${QUEUE_NOTIFY_ME}] Startup failed:`, err.message);
  process.exit(1);
});
