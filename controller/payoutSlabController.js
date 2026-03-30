// controller/payoutSlabController.js
// Admin CRUD for distance-based payout slabs.
import prisma from '../config/prisma.js';

/**
 * GET /api/admin/payout-slabs
 */
export const getSlabs = async (req, res) => {
    try {
        const slabs = await prisma.payout_slabs.findMany({
            orderBy: { min_km: 'asc' },
        });
        res.status(200).json({ success: true, data: slabs });
    } catch (err) {
        console.error('getSlabs error:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch payout slabs' });
    }
};

/**
 * POST /api/admin/payout-slabs
 * Body: { min_km, max_km?, payout_amount, effective_from?, effective_to? }
 */
export const createSlab = async (req, res) => {
    try {
        const { min_km, max_km, payout_amount, effective_from, effective_to } = req.body;

        if (min_km === undefined || payout_amount === undefined) {
            return res.status(400).json({ success: false, error: 'min_km and payout_amount are required' });
        }
        if (Number(min_km) < 0 || Number(payout_amount) < 0) {
            return res.status(400).json({ success: false, error: 'Values must be non-negative' });
        }
        if (max_km !== undefined && max_km !== null && Number(max_km) <= Number(min_km)) {
            return res.status(400).json({ success: false, error: 'max_km must be greater than min_km' });
        }

        const slab = await prisma.payout_slabs.create({
            data: {
                min_km: Number(min_km),
                max_km: max_km != null ? Number(max_km) : null,
                payout_amount: Number(payout_amount),
                is_active: true,
                effective_from: effective_from ? new Date(effective_from) : new Date(),
                effective_to: effective_to ? new Date(effective_to) : null,
                created_by: req.user.id,
            },
        });

        // Audit log
        await prisma.payout_audit_log.create({
            data: {
                changed_by: req.user.id,
                entity_type: 'payout_slabs',
                entity_id: slab.id,
                old_value: null,
                new_value: slab,
            },
        });

        res.status(201).json({ success: true, data: slab });
    } catch (err) {
        console.error('createSlab error:', err);
        res.status(500).json({ success: false, error: 'Failed to create payout slab' });
    }
};

/**
 * PATCH /api/admin/payout-slabs/:id
 */
export const updateSlab = async (req, res) => {
    try {
        const { id } = req.params;
        const { min_km, max_km, payout_amount, is_active, effective_from, effective_to } = req.body;

        const existing = await prisma.payout_slabs.findUnique({ where: { id: parseInt(id) } });
        if (!existing) return res.status(404).json({ success: false, error: 'Slab not found' });

        const updated = await prisma.payout_slabs.update({
            where: { id: parseInt(id) },
            data: {
                ...(min_km !== undefined && { min_km: Number(min_km) }),
                ...(max_km !== undefined && { max_km: max_km != null ? Number(max_km) : null }),
                ...(payout_amount !== undefined && { payout_amount: Number(payout_amount) }),
                ...(is_active !== undefined && { is_active }),
                ...(effective_from !== undefined && { effective_from: new Date(effective_from) }),
                ...(effective_to !== undefined && { effective_to: effective_to ? new Date(effective_to) : null }),
                updated_at: new Date(),
            },
        });

        await prisma.payout_audit_log.create({
            data: {
                changed_by: req.user.id,
                entity_type: 'payout_slabs',
                entity_id: updated.id,
                old_value: existing,
                new_value: updated,
            },
        });

        res.status(200).json({ success: true, data: updated });
    } catch (err) {
        console.error('updateSlab error:', err);
        res.status(500).json({ success: false, error: 'Failed to update payout slab' });
    }
};

/**
 * DELETE /api/admin/payout-slabs/:id
 * Soft-delete: sets is_active = false
 */
export const deleteSlab = async (req, res) => {
    try {
        const { id } = req.params;

        const existing = await prisma.payout_slabs.findUnique({ where: { id: parseInt(id) } });
        if (!existing) return res.status(404).json({ success: false, error: 'Slab not found' });

        await prisma.payout_slabs.update({
            where: { id: parseInt(id) },
            data: { is_active: false, updated_at: new Date() },
        });

        await prisma.payout_audit_log.create({
            data: {
                changed_by: req.user.id,
                entity_type: 'payout_slabs',
                entity_id: parseInt(id),
                old_value: existing,
                new_value: { is_active: false },
            },
        });

        res.status(200).json({ success: true, message: 'Slab deactivated' });
    } catch (err) {
        console.error('deleteSlab error:', err);
        res.status(500).json({ success: false, error: 'Failed to deactivate slab' });
    }
};

/**
 * GET /api/admin/payout-slabs/preview?km=3.8
 * Test which slab applies for a given distance.
 */
export const previewSlab = async (req, res) => {
    try {
        const km = parseFloat(req.query.km);
        if (isNaN(km)) return res.status(400).json({ success: false, error: 'Provide ?km=<number>' });

        const now = new Date();
        const slab = await prisma.payout_slabs.findFirst({
            where: {
                is_active: true,
                effective_from: { lte: now },
                AND: [
                    { OR: [{ effective_to: null }, { effective_to: { gte: now } }] },
                    { min_km: { lte: km } },
                    { OR: [{ max_km: null }, { max_km: { gte: km } }] },
                ],
            },
            orderBy: { min_km: 'asc' },
        });

        if (!slab) {
            return res.status(200).json({ success: true, data: null, message: 'No active slab matches this distance' });
        }

        res.status(200).json({ success: true, data: { slab, payout_amount: Number(slab.payout_amount) } });
    } catch (err) {
        console.error('previewSlab error:', err);
        res.status(500).json({ success: false, error: 'Failed to preview slab' });
    }
};

/**
 * GET /api/admin/payout-slabs/history
 * Returns audit log for payout slab changes.
 */
export const getSlabHistory = async (req, res) => {
    try {
        const logs = await prisma.payout_audit_log.findMany({
            where: { entity_type: 'payout_slabs' },
            orderBy: { changed_at: 'desc' },
            take: 100,
        });
        res.status(200).json({ success: true, data: logs });
    } catch (err) {
        console.error('getSlabHistory error:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch history' });
    }
};

/**
 * POST /api/admin/payout/:payoutId/approve
 * Approve a PENDING or MANUAL_REVIEW payout — credits rider wallet.
 */
export const approvePayout = async (req, res) => {
    try {
        const { payoutId } = req.params;
        const { approvePayout: approve } = await import('../services/payoutService.js');
        await approve(parseInt(payoutId), req.user.id);
        res.status(200).json({ success: true, message: 'Payout approved and credited' });
    } catch (err) {
        console.error('approvePayout error:', err);
        res.status(400).json({ success: false, error: err.message });
    }
};

/**
 * GET /api/admin/payout/list
 * List all payouts (admin view) with filters.
 */
export const listAllPayouts = async (req, res) => {
    try {
        const { status, rider_id, page = 1, limit = 30 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const where = {};
        if (status) where.status = status;
        if (rider_id) where.rider_id = rider_id;

        const [payouts, total] = await Promise.all([
            prisma.rider_payouts.findMany({
                where,
                include: {
                    rider: { include: { users: { select: { name: true, phone: true } } } },
                    slab: true,
                },
                orderBy: { created_at: 'desc' },
                skip,
                take: parseInt(limit),
            }),
            prisma.rider_payouts.count({ where }),
        ]);

        res.status(200).json({
            success: true,
            data: payouts.map((p) => ({
                id: p.id,
                sub_order_id: p.sub_order_id,
                rider_name: p.rider?.users?.name,
                rider_phone: p.rider?.users?.phone,
                route_type: p.route_type,
                total_km: p.total_km ? Number(p.total_km) : null,
                payout_amount: p.payout_amount ? Number(p.payout_amount) : null,
                status: p.status,
                calculated_at: p.calculated_at,
                paid_at: p.paid_at,
            })),
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit)),
            },
        });
    } catch (err) {
        console.error('listAllPayouts error:', err);
        res.status(500).json({ success: false, error: 'Failed to list payouts' });
    }
};
