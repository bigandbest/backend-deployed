import admin from 'firebase-admin';

let messagingInstance = null;

export function getFirebaseMessaging() {
  if (messagingInstance) return messagingInstance;

  const projectId   = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey  = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    console.warn('[Firebase] FCM env vars not set — push notifications disabled');
    return null;
  }

  const app = admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  }, 'fcm');

  messagingInstance = admin.messaging(app);
  console.log('[Firebase] FCM initialized');
  return messagingInstance;
}
