// FCM Token Management Controller
// Saves and manages Firebase Cloud Messaging tokens for push notifications

import prisma from '../config/prisma.js';

/**
 * POST /api/fcm/register-token
 * Save or update user's FCM token
 * Body: { userId, fcmToken, role: 'customer|seller|rider' }
 */
export const registerFCMToken = async (req, res) => {
    try {
        const { userId, fcmToken, role } = req.body;

        if (!userId || !fcmToken) {
            return res.status(400).json({
                success: false,
                error: 'userId and fcmToken are required'
            });
        }

        // Update user with FCM token
        await prisma.users.update({
            where: { id: userId },
            data: { fcm_token: fcmToken },
        });

        console.log(`✅ FCM token registered for user ${userId} (${role})`);

        res.json({ success: true, message: 'FCM token registered' });
    } catch (err) {
        console.error('FCM registration error:', err);
        res.status(500).json({ success: false, error: 'Failed to register FCM token' });
    }
};

/**
 * GET /api/fcm/token/:userId
 * Retrieve user's current FCM token (for debugging)
 */
export const getFCMToken = async (req, res) => {
    try {
        const { userId } = req.params;

        const user = await prisma.users.findUnique({
            where: { id: userId },
            select: { id: true, email: true, fcm_token: true },
        });

        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        res.json({
            success: true,
            fcmToken: user.fcm_token || null
        });
    } catch (err) {
        console.error('FCM fetch error:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch FCM token' });
    }
};

/**
 * DELETE /api/fcm/token/:userId
 * Remove FCM token (when user logs out)
 */
export const removeFCMToken = async (req, res) => {
    try {
        const { userId } = req.params;

        await prisma.users.update({
            where: { id: userId },
            data: { fcm_token: null },
        });

        res.json({ success: true, message: 'FCM token removed' });
    } catch (err) {
        console.error('FCM removal error:', err);
        res.status(500).json({ success: false, error: 'Failed to remove FCM token' });
    }
};
