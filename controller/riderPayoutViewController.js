// controller/riderPayoutViewController.js
// Rider-facing payout views and dispute management.
import prisma from '../config/prisma.js';

/**
 * GET /api/rider/payouts
 * Rider's payout history — paginated, filterable by status/date.
 */
export const getMyPayouts = async (req, res) => {
    try {
        const rider = await prisma.riders.findUnique({ where: { user_id: req.user.id } });
        if (!rider) return res.status(404).json({ success: false, error: 'Rider profile not found' });

        const { status, from, to, page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const where = { rider_id: rider.id };
        if (status) where.status = status;
        if (from || to) {
            where.created_at = {};
            if (from) where.created_at.gte = new Date(from);
            if (to) where.created_at.lte = new Date(to);
        }

        const [payouts, total] = await Promise.all([
            prisma.rider_payouts.findMany({
                where,
                include: { slab: true },
                orderBy: { created_at: 'desc' },
                skip,
                take: parseInt(limit),
            }),
            prisma.rider_payouts.count({ where }),
        ]);

        res.status(200).json({
            success: true,
            data: payouts.map(formatPayout),
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit)),
            },
        });
    } catch (err) {
        console.error('getMyPayouts error:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch payouts' });
    }
};

/**
 * GET /api/rider/payouts/summary
 * Today / this week / this month totals.
 */
export const getPayoutSummary = async (req, res) => {
    try {
        const rider = await prisma.riders.findUnique({ where: { user_id: req.user.id } });
        if (!rider) return res.status(404).json({ success: false, error: 'Rider profile not found' });

        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfWeek = new Date(startOfDay);
        startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const [todayPayouts, weekPayouts, monthPayouts] = await Promise.all([
            prisma.rider_payouts.findMany({
                where: { rider_id: rider.id, status: 'PAID', paid_at: { gte: startOfDay } },
                select: { payout_amount: true },
            }),
            prisma.rider_payouts.findMany({
                where: { rider_id: rider.id, status: 'PAID', paid_at: { gte: startOfWeek } },
                select: { payout_amount: true },
            }),
            prisma.rider_payouts.findMany({
                where: { rider_id: rider.id, status: 'PAID', paid_at: { gte: startOfMonth } },
                select: { payout_amount: true },
            }),
        ]);

        const sum = (arr) => arr.reduce((acc, p) => acc + Number(p.payout_amount || 0), 0);

        res.status(200).json({
            success: true,
            data: {
                today: sum(todayPayouts),
                this_week: sum(weekPayouts),
                this_month: sum(monthPayouts),
            },
        });
    } catch (err) {
        console.error('getPayoutSummary error:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch summary' });
    }
};

/**
 * GET /api/rider/payouts/:id
 * Single payout detail with slab and leg breakdown.
 */
export const getPayoutDetail = async (req, res) => {
    try {
        const rider = await prisma.riders.findUnique({ where: { user_id: req.user.id } });
        if (!rider) return res.status(404).json({ success: false, error: 'Rider profile not found' });

        const payout = await prisma.rider_payouts.findUnique({
            where: { id: parseInt(req.params.id) },
            include: { slab: true, payout_disputes: true },
        });

        if (!payout) return res.status(404).json({ success: false, error: 'Payout not found' });
        if (payout.rider_id !== rider.id) {
            return res.status(403).json({ success: false, error: 'Not authorized' });
        }

        res.status(200).json({ success: true, data: formatPayout(payout) });
    } catch (err) {
        console.error('getPayoutDetail error:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch payout detail' });
    }
};

/**
 * POST /api/rider/payouts/:id/dispute
 * Body: { reason, note? }
 */
export const raiseDispute = async (req, res) => {
    try {
        const rider = await prisma.riders.findUnique({ where: { user_id: req.user.id } });
        if (!rider) return res.status(404).json({ success: false, error: 'Rider profile not found' });

        const { reason, note } = req.body;
        const validReasons = ['WRONG_DISTANCE', 'WRONG_AMOUNT', 'NOT_RECEIVED', 'OTHER'];

        if (!reason || !validReasons.includes(reason)) {
            return res.status(400).json({
                success: false,
                error: `reason must be one of: ${validReasons.join(', ')}`,
            });
        }

        const payout = await prisma.rider_payouts.findUnique({
            where: { id: parseInt(req.params.id) },
        });

        if (!payout) return res.status(404).json({ success: false, error: 'Payout not found' });
        if (payout.rider_id !== rider.id) {
            return res.status(403).json({ success: false, error: 'Not authorized' });
        }

        const existing = await prisma.payout_disputes.findFirst({
            where: { payout_id: payout.id, status: 'OPEN' },
        });
        if (existing) {
            return res.status(400).json({ success: false, error: 'An open dispute already exists for this payout' });
        }

        const dispute = await prisma.$transaction(async (tx) => {
            const d = await tx.payout_disputes.create({
                data: {
                    payout_id: payout.id,
                    rider_id: rider.id,
                    reason,
                    note: note || null,
                    status: 'OPEN',
                },
            });

            await tx.rider_payouts.update({
                where: { id: payout.id },
                data: { status: 'DISPUTED', updated_at: new Date() },
            });

            return d;
        });

        res.status(201).json({ success: true, data: dispute, message: 'Dispute raised successfully' });
    } catch (err) {
        console.error('raiseDispute error:', err);
        res.status(500).json({ success: false, error: 'Failed to raise dispute' });
    }
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatPayout(p) {
    return {
        id: p.id,
        sub_order_id: p.sub_order_id,
        parent_order_id: p.parent_order_id,
        route_type: p.route_type,
        leg1_km: p.leg1_km ? Number(p.leg1_km) : null,
        leg2_km: p.leg2_km ? Number(p.leg2_km) : null,
        total_km: p.total_km ? Number(p.total_km) : null,
        slab: p.slab
            ? {
                  min_km: Number(p.slab.min_km),
                  max_km: p.slab.max_km ? Number(p.slab.max_km) : null,
              }
            : null,
        payout_amount: p.payout_amount ? Number(p.payout_amount) : null,
        status: p.status,
        calculated_at: p.calculated_at,
        paid_at: p.paid_at,
        disputes: p.payout_disputes || [],
    };
}
