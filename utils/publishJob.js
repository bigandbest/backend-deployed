import { getRabbitChannel } from '../config/rabbitmq.js';

/**
 * Publish a job to a RabbitMQ queue.
 * Fails silently — a queue outage must never block order placement.
 *
 * @param {string} queue   - Queue name e.g. 'geocode_order'
 * @param {object} payload - JSON-serialisable job data
 */
export const publishJob = async (queue, payload) => {
  try {
    const ch = await getRabbitChannel();
    ch.sendToQueue(
      queue,
      Buffer.from(JSON.stringify(payload)),
      { persistent: true }  // message survives broker restart
    );
  } catch (err) {
    // Log but do not rethrow — queue failure must not fail the HTTP request
    console.error(`[publishJob] Failed to enqueue job on "${queue}":`, err.message);
  }
};
