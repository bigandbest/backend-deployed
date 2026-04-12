import 'dotenv/config';
import { getChannel, QUEUE_ENQUIRY } from '../lib/queue.js';
import prisma from '../config/prisma.js';

const startWorker = async () => {
  const ch = await getChannel();
  await ch.assertQueue(QUEUE_ENQUIRY, { durable: true });
  ch.prefetch(1);

  console.log(`[Worker:${QUEUE_ENQUIRY}] Listening`);

  ch.consume(QUEUE_ENQUIRY, async (msg) => {
    if (!msg) return;

    let payload;
    try {
      payload = JSON.parse(msg.content.toString());
    } catch {
      console.error(`[Worker:${QUEUE_ENQUIRY}] Invalid JSON — discarding`);
      ch.nack(msg, false, false);
      return;
    }

    const {
      user_id,
      product_id,
      variant_id,
      quantity = 1,
      message = '',
      need_by,
      templates = [],
      timestamp,
    } = payload;

    try {
      const templateText = templates.length > 0 ? `Templates: ${templates.join(', ')}\n` : '';
      const fullMessage = `${templateText}${message}`.trim();

      await prisma.product_enquiries.create({
        data: {
          user_id,
          product_id,
          variant_id: variant_id || null,
          quantity: parseInt(quantity) || 1,
          message: fullMessage || 'Out-of-stock enquiry',
          delivery_timeline: need_by || null,
          status: 'OPEN',
          company_name: 'OUT_OF_STOCK_ENQUIRY',
        },
      });

      console.log(`[Worker:${QUEUE_ENQUIRY}] Saved enquiry for user=${user_id} product=${product_id} (queued at ${timestamp})`);
      ch.ack(msg);
    } catch (err) {
      console.error(`[Worker:${QUEUE_ENQUIRY}] DB write failed:`, err.message);
      ch.nack(msg, false, false);
    }
  });

  const shutdown = async (signal) => {
    console.log(`[Worker:${QUEUE_ENQUIRY}] ${signal} — shutting down`);
    try { await ch.close(); } catch {}
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
};

startWorker().catch((err) => {
  console.error(`[Worker:${QUEUE_ENQUIRY}] Startup failed:`, err.message);
  process.exit(1);
});
