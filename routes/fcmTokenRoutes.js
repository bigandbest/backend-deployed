// FCM Token Management Routes
import express from 'express';
import { authenticateToken } from '../middleware/authenticate.js';
import {
    registerFCMToken,
    getFCMToken,
    removeFCMToken,
} from '../controller/fcmTokenController.js';

const router = express.Router();

/**
 * POST /api/fcm/register-token
 * Register or update FCM token for push notifications
 * Body: { userId, fcmToken, role }
 */
router.post('/register-token', registerFCMToken);

/**
 * GET /api/fcm/token/:userId
 * Get user's current FCM token (for debugging)
 */
router.get('/token/:userId', getFCMToken);

/**
 * DELETE /api/fcm/token/:userId
 * Remove FCM token on logout
 */
router.delete('/token/:userId', removeFCMToken);

export default router;
