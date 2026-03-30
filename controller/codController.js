// controller/codController.js
// Admin management of COD (Cash on Delivery) collections.
// Riders collect cash at delivery; admin verifies the deposit, then unlocks the wallet.

import prisma from '../config/prisma.js';

/**
 * GET /api/admin/cod-collections
 * List all COD collections with optional status filter.
 */
export const listCodCollections = async (req, res) => {
    try {
        const { status, rider_id, page = 1, limit = 30 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const where = {};
        if (status) where.status = status;
        if (rider_id) where.rider_id = rider_id;

        const [collections, total] = await Promise.all([
            prisma.cod_collections.findMany({
                where,
                include: {
                    riders: { include: { users: { select: { name: true, phone: true } } } },
                    orders: { select: { id: true, total: true, payment_method: true, address: true } },
                },
                orderBy: { created_at: 'desc' },
                skip,
                take: parseInt(limit),
            }),
            prisma.cod_collections.count({ where }),
        ]);

        res.status(200).json({
            success: true,
            data: collections.map(c => ({
                id: c.id,
                order_id: c.order_id,
                rider_name: c.riders?.users?.name,
                rider_phone: c.riders?.users?.phone,
                amount_collected: Number(c.amount_collected),
                status: c.status,
                payment_proof: c.payment_proof,
                claimed_at: c.claimed_at,
                approved_at: c.approved_at,
                notes: c.notes,
                created_at: c.created_at,
            })),
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit)),
            },
        });
    } catch (err) {
        console.error('listCodCollections error:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch COD collections' });
    }
};

/**
 * POST /api/admin/cod-collections/:id/approve
 * Admin confirms they received the rider's cash deposit.
 * Unlocks the rider's wallet if no other PENDING_DEPOSIT collections remain.
 */
export const approveCodDeposit = async (req, res) => {
    try {
        const { id } = req.params;
        const { notes } = req.body;
        const adminUserId = req.user.id;

        const collection = await prisma.cod_collections.findUnique({
            where: { id },
            include: { riders: { include: { users: true } } },
        });

        if (!collection) return res.status(404).json({ success: false, error: 'COD collection not found' });
        if (!['PENDING_DEPOSIT', 'DEPOSIT_CLAIMED'].includes(collection.status)) {
            return res.status(400).json({ success: false, error: `Cannot approve collection in ${collection.status} status` });
        }

        const riderUserId = collection.riders.user_id;

        await prisma.$transaction(async (tx) => {
            // Mark collection approved
            await tx.cod_collections.update({
                where: { id },
                data: {
                    status: 'APPROVED',
                    approved_by: adminUserId,
                    approved_at: new Date(),
                    notes: notes || null,
                    updated_at: new Date(),
                },
            });

            // Check if this rider has any remaining pending COD collections
            const pendingCount = await tx.cod_collections.count({
                where: {
                    rider_id: collection.rider_id,
                    status: { in: ['PENDING_DEPOSIT', 'DEPOSIT_CLAIMED'] },
                    id: { not: id },   // exclude the one we just approved
                },
            });

            // Unlock wallet only if no other pending COD orders remain
            if (pendingCount === 0) {
                const wallet = await tx.wallets.findFirst({ where: { user_id: riderUserId } });
                if (wallet && wallet.is_frozen && wallet.frozen_reason === 'COD_PENDING') {
                    await tx.wallets.update({
                        where: { id: wallet.id },
                        data: {
                            is_frozen: false,
                            frozen_reason: null,
                            frozen_by: null,
                            frozen_at: null,
                            updated_at: new Date(),
                        },
                    });
                }
            }
        });

        // Fetch updated state for response
        const pendingRemaining = await prisma.cod_collections.count({
            where: {
                rider_id: collection.rider_id,
                status: { in: ['PENDING_DEPOSIT', 'DEPOSIT_CLAIMED'] },
            },
        });

        res.status(200).json({
            success: true,
            message: pendingRemaining === 0
                ? 'COD deposit approved. Rider wallet unlocked.'
                : `COD deposit approved. Wallet remains locked — ${pendingRemaining} other pending COD order(s) still outstanding.`,
            wallet_unlocked: pendingRemaining === 0,
        });
    } catch (err) {
        console.error('approveCodDeposit error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * POST /api/admin/cod-collections/:id/reject
 * Admin rejects the deposit proof. Wallet stays locked.
 */
export const rejectCodDeposit = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const adminUserId = req.user.id;

        if (!reason) return res.status(400).json({ success: false, error: 'Rejection reason is required' });

        const collection = await prisma.cod_collections.findUnique({ where: { id } });
        if (!collection) return res.status(404).json({ success: false, error: 'COD collection not found' });
        if (!['PENDING_DEPOSIT', 'DEPOSIT_CLAIMED'].includes(collection.status)) {
            return res.status(400).json({ success: false, error: `Cannot reject collection in ${collection.status} status` });
        }

        await prisma.cod_collections.update({
            where: { id },
            data: {
                status: 'REJECTED',
                approved_by: adminUserId,
                approved_at: new Date(),
                rejected_reason: reason,
                updated_at: new Date(),
            },
        });

        res.status(200).json({
            success: true,
            message: 'COD deposit rejected. Rider wallet remains locked until valid proof is submitted.',
        });
    } catch (err) {
        console.error('rejectCodDeposit error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * POST /api/rider/cod/:orderId/claim-deposit
 * Rider marks that they have transferred the COD cash to the company account.
 * Optionally uploads payment proof URL.
 */
export const riderClaimDeposit = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { payment_proof } = req.body;

        const rider = await prisma.riders.findUnique({ where: { user_id: req.user.id } });
        if (!rider) return res.status(404).json({ success: false, error: 'Rider profile not found' });

        const collection = await prisma.cod_collections.findUnique({ where: { order_id: orderId } });
        if (!collection) return res.status(404).json({ success: false, error: 'COD collection not found for this order' });
        if (collection.rider_id !== rider.id) {
            return res.status(403).json({ success: false, error: 'This COD collection is not yours' });
        }
        if (collection.status !== 'PENDING_DEPOSIT') {
            return res.status(400).json({ success: false, error: `Cannot claim deposit in ${collection.status} status` });
        }

        await prisma.cod_collections.update({
            where: { order_id: orderId },
            data: {
                status: 'DEPOSIT_CLAIMED',
                payment_proof: payment_proof || null,
                claimed_at: new Date(),
                updated_at: new Date(),
            },
        });

        res.status(200).json({
            success: true,
            message: 'Deposit claim submitted. Admin will verify and unlock your wallet.',
        });
    } catch (err) {
        console.error('riderClaimDeposit error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * GET /api/rider/cod/pending
 * Rider views their pending COD collections.
 */
export const getRiderPendingCod = async (req, res) => {
    try {
        const rider = await prisma.riders.findUnique({ where: { user_id: req.user.id } });
        if (!rider) return res.status(404).json({ success: false, error: 'Rider profile not found' });

        const collections = await prisma.cod_collections.findMany({
            where: {
                rider_id: rider.id,
                status: { in: ['PENDING_DEPOSIT', 'DEPOSIT_CLAIMED'] },
            },
            include: {
                orders: { select: { id: true, total: true, address: true, tracking_number: true } },
            },
            orderBy: { created_at: 'desc' },
        });

        res.status(200).json({
            success: true,
            data: collections.map(c => ({
                id: c.id,
                order_id: c.order_id,
                order_total: Number(c.amount_collected),
                tracking_number: c.orders?.tracking_number,
                address: c.orders?.address,
                status: c.status,
                claimed_at: c.claimed_at,
                created_at: c.created_at,
            })),
        });
    } catch (err) {
        console.error('getRiderPendingCod error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};
