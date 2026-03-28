// controller/riderLocationController.js
import prisma from '../config/prisma.js';

/**
 * POST /api/rider/location/go-online
 * Body: { latitude, longitude }
 * Marks rider as online and records their GPS.
 */
export const goOnline = async (req, res) => {
    try {
        const { latitude, longitude } = req.body;

        if (!latitude || !longitude) {
            return res.status(400).json({ success: false, error: 'latitude and longitude are required' });
        }

        const rider = await prisma.riders.findUnique({ where: { user_id: req.user.id } });
        if (!rider) return res.status(404).json({ success: false, error: 'Rider profile not found' });

        if (rider.verification_status !== 'VERIFIED') {
            return res.status(403).json({ success: false, error: 'Rider not verified' });
        }

        await prisma.$transaction([
            // Record location
            prisma.rider_locations.create({
                data: {
                    rider_id: rider.id,
                    latitude: parseFloat(latitude),
                    longitude: parseFloat(longitude),
                    is_online: true,
                },
            }),
            // Mark available
            prisma.riders.update({
                where: { id: rider.id },
                data: { is_available: true, updated_at: new Date() },
            }),
        ]);

        res.status(200).json({ success: true, message: 'You are now online' });
    } catch (err) {
        console.error('goOnline error:', err);
        res.status(500).json({ success: false, error: 'Failed to go online' });
    }
};

/**
 * POST /api/rider/location/go-offline
 * Marks rider as offline.
 */
export const goOffline = async (req, res) => {
    try {
        const rider = await prisma.riders.findUnique({ where: { user_id: req.user.id } });
        if (!rider) return res.status(404).json({ success: false, error: 'Rider profile not found' });

        await prisma.$transaction([
            // Mark latest location as offline
            prisma.rider_locations.updateMany({
                where: { rider_id: rider.id, is_online: true },
                data: { is_online: false },
            }),
            // Mark unavailable
            prisma.riders.update({
                where: { id: rider.id },
                data: { is_available: false, updated_at: new Date() },
            }),
        ]);

        res.status(200).json({ success: true, message: 'You are now offline' });
    } catch (err) {
        console.error('goOffline error:', err);
        res.status(500).json({ success: false, error: 'Failed to go offline' });
    }
};

/**
 * GET /api/rider/location/status
 * Returns rider's current online status and last known location.
 */
export const getLocationStatus = async (req, res) => {
    try {
        const rider = await prisma.riders.findUnique({ where: { user_id: req.user.id } });
        if (!rider) return res.status(404).json({ success: false, error: 'Rider profile not found' });

        const lastLocation = await prisma.rider_locations.findFirst({
            where: { rider_id: rider.id },
            orderBy: { recorded_at: 'desc' },
        });

        res.status(200).json({
            success: true,
            data: {
                is_available: rider.is_available,
                last_location: lastLocation
                    ? {
                          latitude: Number(lastLocation.latitude),
                          longitude: Number(lastLocation.longitude),
                          recorded_at: lastLocation.recorded_at,
                          is_online: lastLocation.is_online,
                      }
                    : null,
            },
        });
    } catch (err) {
        console.error('getLocationStatus error:', err);
        res.status(500).json({ success: false, error: 'Failed to get status' });
    }
};
