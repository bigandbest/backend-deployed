import prisma from '../config/prisma.js';
import { getFirebaseMessaging } from '../config/firebase.js';

/**
 * Register or update an FCM token for a user.
 */
export async function registerFCMToken(userId, token, device) {
  await prisma.fcm_tokens.upsert({
    where: { token },
    update: { userId: userId, device, updated_at: new Date() },
    create: { userId: userId, token, device },
  });
}

/**
 * Remove a stale FCM token (called when FCM returns registration-token-not-registered).
 */
export async function removeFCMToken(token) {
  try {
    await prisma.fcm_tokens.delete({ where: { token } });
  } catch {
    // Already removed — safe to ignore
  }
}

/**
 * Send a push notification to all devices of a user.
 * @returns {{ sent: number, failed: number }}
 */
export async function sendToUser(userId, notification) {
  const messaging = getFirebaseMessaging();
  if (!messaging) return { sent: 0, failed: 0 };

  const records = await prisma.fcm_tokens.findMany({ where: { userId: userId } });
  if (!records.length) return { sent: 0, failed: 0 };

  const tokens = records.map(r => r.token);

  const message = {
    tokens,
    notification: {
      title: notification.title,
      body:  notification.body,
    },
    data: notification.data ?? {},
    android: {
      priority: 'high',
      notification: {
        channelId: notification.channelId ?? 'default',
        sound: 'default',
      },
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          badge: notification.badge ?? 1,
        },
      },
    },
  };

  const response = await messaging.sendEachForMulticast(message);

  // Clean up stale tokens
  const staleCleanup = response.responses
    .map((r, i) => ({ r, token: tokens[i] }))
    .filter(({ r }) => r.error?.code === 'messaging/registration-token-not-registered')
    .map(({ token }) => removeFCMToken(token));

  await Promise.allSettled(staleCleanup);

  return { sent: response.successCount, failed: response.failureCount };
}

/**
 * Send a push notification by phone number (looks up userId first).
 */
export async function sendToPhone(phone, notification) {
  const user = await prisma.users.findFirst({ where: { phone }, select: { id: true } });
  if (!user) return { sent: 0, failed: 0 };
  return sendToUser(user.id, notification);
}

/**
 * Get all FCM token records for a user (excluding the given token, for cross-device notify).
 */
export async function getOtherTokens(userId, excludeToken) {
  return prisma.fcm_tokens.findMany({
    where: { userId: userId, NOT: { token: excludeToken ?? '' } },
    select: { token: true },
  });
}
