import amqplib from 'amqplib';

let connection = null;
let channel = null;
let isConnecting = false;

const QUEUES = [
  'geocode_order',
  'fulfillment_routing',
];

export const getRabbitChannel = async () => {
  if (channel) return channel;

  // Prevent multiple simultaneous connection attempts at startup
  if (isConnecting) {
    await new Promise(resolve => setTimeout(resolve, 100));
    return getRabbitChannel();
  }

  isConnecting = true;

  try {
    connection = await amqplib.connect(process.env.RABBITMQ_URL);
    channel = await connection.createChannel();

    // Declare all queues as durable — messages survive broker restarts
    for (const queue of QUEUES) {
      await channel.assertQueue(queue, { durable: true });
    }

    // On unexpected connection close, clear refs so next call reconnects
    connection.on('close', () => {
      console.warn('[RabbitMQ] Connection closed — will reconnect on next publish');
      connection = null;
      channel = null;
    });

    connection.on('error', (err) => {
      console.error('[RabbitMQ] Connection error:', err.message);
      connection = null;
      channel = null;
    });

    console.log('[RabbitMQ] Connected and channels ready');
    return channel;
  } finally {
    isConnecting = false;
  }
};

export const closeRabbit = async () => {
  try {
    await channel?.close();
    await connection?.close();
  } catch {}
  channel = null;
  connection = null;
};
