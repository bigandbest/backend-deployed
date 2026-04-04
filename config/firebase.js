// Firebase Admin SDK Configuration
// Initializes Firebase for backend services:
// - FCM (push notifications)
// - Firestore (optional real-time updates)
// - Authentication (admin operations)

import admin from 'firebase-admin';

// Load service account key from environment or file
let serviceAccountKey;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    // Production: use environment variable
    serviceAccountKey = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
    // Development: load from file (should be in .gitignore)
    try {
        const fs = await import('fs');
        serviceAccountKey = JSON.parse(
            fs.readFileSync('serviceAccountKey.json', 'utf-8')
        );
    } catch (err) {
        console.warn('⚠️  serviceAccountKey.json not found. Firebase Admin SDK features will be disabled.');
        console.warn('To enable Firebase, provide serviceAccountKey.json in project root or set FIREBASE_SERVICE_ACCOUNT env var');
    }
}

// Initialize Firebase Admin SDK only if service account is available
if (serviceAccountKey && !admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccountKey),
        projectId: serviceAccountKey.project_id || process.env.FIREBASE_PROJECT_ID,
    });
    console.log('✅ Firebase Admin SDK initialized');
} else if (admin.apps.length) {
    console.log('✅ Firebase Admin SDK already initialized');
}

export default admin;
