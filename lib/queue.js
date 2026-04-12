// REQUIRES: amqplib (already installed)
// Singleton RabbitMQ publisher for product side-effect queues.
// Separate from the existing config/rabbitmq.js which handles order queues.
// Failures are swallowed — queue outage must never cause a 500.
import amqplib from 'amqplib';

// ── Queue name constants ──────────────────────────────────────────────────────
export const QUEUE_NOTIFY_ME = 'product.notify_me';
export const QUEUE_ENQUIRY   = 'product.enquiry';
export const QUEUE_REVIEW    = 'product.review';

const QUEUES = [QUEUE_NOTIFY_ME, QUEUE_ENQUIRY, QUEUE_REVIEW];

let connection = null;
let channel    = null;
let connecting = false;

/**
 * Returns a ready amqplib channel, creating the connection on first call.
 * Reuses the existing connection on subsequent calls.
 */
export const getChannel = async () => {
  if (channel) return channel;

  // Spin-wait if another call is already connecting
  if (connecting) {
    await new Promise((r) => setTimeout(r, 100));
    return getChannel();
  }

  connecting = true;
  try {
    connection = await amqplib.connect(process.env.RABBITMQ_URL);
    channel = await connection.createChannel();

    for (const queue of QUEUES) {
      await channel.assertQueue(queue, { durable: true });
    }

    connection.on('close', () => {
      console.warn('[Queue] Connection closed — will reconnect on next publish');
      connection = null;
      channel = null;
    });

    connection.on('error', (err) => {
      console.error('[Queue] Connection error:', err.message);
      connection = null;
      channel = null;
    });

    return channel;
  } finally {
    connecting = false;
  }
};

/**
 * Publish a job to a named queue.
 * Asserts the queue as durable and sends a persistent message.
 * Never throws — errors are logged and swallowed.
 */
export const publishToQueue = async (queueName, payload) => {
  try {
    const ch = await getChannel();
    ch.sendToQueue(
      queueName,
      Buffer.from(JSON.stringify(payload)),
      { persistent: true },
    );
  } catch (err) {
    console.error(`[Queue] Failed to publish to "${queueName}":`, err.message);
  }
};
