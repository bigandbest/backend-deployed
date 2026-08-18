import { Worker } from 'bullmq';
import subOrderDao from '../dao/sub-order.dao.js';
import { handleSellerCancellation } from '../services/subOrderService.js';
import { bullmqRedis } from '../config/bullmq.js';

const QUEUE_NAME = 'seller-accept-timeout';

const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    const { subOrderId, sellerId } = job.data;

    const subOrder = await subOrderDao.getById(subOrderId);
    if (!subOrder) {
      return { skipped: true, reason: 'SUB_ORDER_NOT_FOUND' };
    }

    // Only ever auto-reject a sub-order still awaiting the seller's response.
    // If the seller already accepted (status='confirmed'), this must be a
    // no-op — handleSellerCancellation() is called with allowedFromStatuses
    // restricted to ['pending'] so it can never cancel an accepted order,
    // even if this check and the atomic claim inside it race.
    if (subOrder.fulfillment_status !== 'pending') {
      return { skipped: true, reason: 'ALREADY_TRANSITIONED', status: subOrder.fulfillment_status };
    }

    const result = await handleSellerCancellation(subOrderId, sellerId, {
      allowedFromStatuses: ['pending'],
    });

    return { timedOut: true, ...result };
  },
  {
    connection: bullmqRedis,
    concurrency: 5,
  }
);

worker.on('completed', (job) => {
  const result = job.returnvalue;
  if (result?.timedOut) {
    console.log(`[SellerAcceptTimeout] Sub-order ${job.data.subOrderId} auto-rejected on timeout (rerouted: ${result.rerouted})`);
  }
});

worker.on('failed', (job, err) => {
  console.error(`[SellerAcceptTimeout] Job ${job?.id} failed:`, err.message);
});

export const startSellerAcceptTimeoutWorker = () => {
  console.log('[SellerAcceptTimeout] Worker started');
};

export default worker;
