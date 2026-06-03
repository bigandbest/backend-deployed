import { Worker } from 'bullmq';
import prisma from '../config/prisma.js';
import { priceUpdateQueue, bullmqRedis } from '../config/bullmq.js';

const QUEUE_NAME = 'bulk-price-update';

const processRow = async (row) => {
  const { variant_id, new_price, new_old_price, new_discount_percentage } = row;

  const variant = await prisma.product_variants.findUnique({
    where: { id: variant_id },
    select: { id: true, product_id: true },
  });

  if (!variant) {
    return { variant_id, status: 'error', reason: 'Variant not found' };
  }

  // Compute discount if not provided but both prices are present
  let discount = new_discount_percentage != null ? parseFloat(new_discount_percentage) : null;
  const price = parseFloat(new_price);
  const oldPrice = new_old_price != null && new_old_price !== '' ? parseFloat(new_old_price) : null;

  if (discount == null && oldPrice != null && oldPrice > 0) {
    discount = parseFloat((((oldPrice - price) / oldPrice) * 100).toFixed(2));
  }

  const updateData = { price };
  if (oldPrice != null) updateData.old_price = oldPrice;
  if (discount != null) updateData.discount_percentage = discount;

  await prisma.product_variants.update({
    where: { id: variant_id },
    data: updateData,
  });

  // Invalidate Redis product cache
  try {
    const cacheKey = `product:${variant.product_id}`;
    await bullmqRedis.del(cacheKey);
  } catch (_) {
    // Cache eviction failure is non-fatal
  }

  return {
    variant_id,
    status: 'success',
    new_price: price,
    new_old_price: oldPrice,
    new_discount_percentage: discount,
  };
};

const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    if (job.name === 'cleanup') {
      await runCleanup();
      return { cleaned: true };
    }

    const { rows } = job.data;
    const total = rows.length;
    const results = [];
    let done = 0;
    let errorCount = 0;

    for (const row of rows) {
      try {
        const result = await processRow(row);
        results.push(result);
        if (result.status === 'error') errorCount++;
      } catch (err) {
        results.push({ variant_id: row.variant_id, status: 'error', reason: err.message });
        errorCount++;
      }
      done++;
      await job.updateProgress({ done, total, errorCount });
    }

    return { results, total, errorCount };
  },
  {
    connection: bullmqRedis,
    concurrency: 1,
  }
);

worker.on('completed', (job) => {
  console.log(`[BulkPrice] Job ${job.id} completed: ${job.returnvalue?.total} rows processed`);
});

worker.on('failed', (job, err) => {
  console.error(`[BulkPrice] Job ${job?.id} failed:`, err.message);
});

const runCleanup = async () => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const completed = await priceUpdateQueue.getCompleted();
  const failed = await priceUpdateQueue.getFailed();

  for (const job of [...completed, ...failed]) {
    if (job.finishedOn && job.finishedOn < cutoff) {
      await job.remove();
    }
  }
  console.log('[BulkPrice] Cleanup cron finished');
};

export const startBulkPriceWorker = async () => {
  // Register hourly cleanup cron (idempotent — BullMQ deduplicates by jobId)
  await priceUpdateQueue.add('cleanup', {}, {
    repeat: { pattern: '0 * * * *' },
    jobId: 'bulk-price-cleanup-cron',
  });
  console.log('[BulkPrice] Worker started');
};

export default worker;
