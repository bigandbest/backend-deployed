// services/payoutService.js
// Core payout calculation for the distance-slab system.
// Called after a sub-order is marked as delivered.

import prisma from '../config/prisma.js';
import { getTwoLegDistance } from '../utils/roadDistance.js';

/**
 * Calculate payout for a delivered sub-order and store a rider_payouts record.
 *
 * @param {string} subOrderId  - UUID of the delivered sub_order
 * @param {string} riderId     - UUID of the riders record (not user_id)
 * @returns {{ success: boolean, totalKm?: number, payoutAmount?: number, reason?: string }}
 */
export async function calculateAndCreatePayout(subOrderId, riderId) {
    try {
        // 1. Idempotency — skip if already calculated
        const existing = await prisma.rider_payouts.findUnique({
            where: { sub_order_id: subOrderId },
        });
        if (existing) return { success: true, skipped: true };

        // 2. Load sub-order with parent order
        const subOrder = await prisma.sub_orders.findUnique({
            where: { id: subOrderId },
            include: {
                parent_order: {
                    select: {
                        id: true,
                        delivery_latitude: true,
                        delivery_longitude: true,
                        delivery_pincode: true,
                    },
                },
            },
        });

        if (!subOrder) return { success: false, reason: 'SUB_ORDER_NOT_FOUND' };

        // 3. Zonal sub-orders have no rider payout
        if (subOrder.source_type === 'zonal') {
            return { success: false, reason: 'ZONAL_NO_PAYOUT' };
        }

        // 3b. Admin-completed deliveries never generate rider payout — the rider
        // may not have actually made this delivery. This is defense-in-depth on
        // top of the caller-side status filter in riderOrderController.js.
        if (subOrder.delivered_by === 'admin') {
            return { success: false, reason: 'ADMIN_DELIVERED_NO_PAYOUT' };
        }

        const order = subOrder.parent_order;

        // 4. Determine source coordinates (seller or warehouse)
        let sourceLat = null;
        let sourceLon = null;
        let routeType = 'WAREHOUSE';

        if (subOrder.source_type === 'seller' && subOrder.seller_id) {
            routeType = 'SELLER';
            const seller = await prisma.sellers.findUnique({
                where: { id: subOrder.seller_id },
                select: { latitude: true, longitude: true },
            });
            if (seller?.latitude && seller?.longitude) {
                sourceLat = Number(seller.latitude);
                sourceLon = Number(seller.longitude);
            }
        } else {
            const warehouse = await prisma.warehouses.findUnique({
                where: { id: subOrder.source_id },
                select: { latitude: true, longitude: true, location: true },
            });
            if (warehouse?.latitude && warehouse?.longitude) {
                sourceLat = Number(warehouse.latitude);
                sourceLon = Number(warehouse.longitude);
            }
        }

        // 5. Customer coordinates (prefer stored GPS, fall back to pincode_locations)
        let deliveryLat = order.delivery_latitude ? Number(order.delivery_latitude) : null;
        let deliveryLon = order.delivery_longitude ? Number(order.delivery_longitude) : null;

        if ((!deliveryLat || !deliveryLon) && order.delivery_pincode) {
            const pincodeRecord = await prisma.pincode_locations.findFirst({
                where: { pincode: order.delivery_pincode },
            });
            if (pincodeRecord?.latitude && pincodeRecord?.longitude) {
                deliveryLat = Number(pincodeRecord.latitude);
                deliveryLon = Number(pincodeRecord.longitude);
            }
        }

        // 6. Rider's last known location
        const lastLocation = await prisma.rider_locations.findFirst({
            where: { rider_id: riderId },
            orderBy: { recorded_at: 'desc' },
        });

        const pickupLat = lastLocation ? Number(lastLocation.latitude) : null;
        const pickupLon = lastLocation ? Number(lastLocation.longitude) : null;

        // 7. Calculate distances via OSRM road network (falls back to Haversine × 1.4)
        let leg1 = null;
        let leg2 = null;
        let totalKm = null;
        let distanceSource = 'haversine_fallback';

        if (sourceLat && sourceLon && deliveryLat && deliveryLon) {
            const roadResult = await getTwoLegDistance(
                pickupLat, pickupLon,    // rider location (may be null → leg1 = null)
                sourceLat, sourceLon,    // seller / warehouse (pickup point)
                deliveryLat, deliveryLon // customer delivery address
            );
            if (roadResult.source !== 'no_gps') {
                leg1 = roadResult.leg1Km;       // null when rider GPS unavailable
                leg2 = roadResult.leg2Km;
                totalKm = roadResult.totalKm;   // null when leg1 is null → MANUAL_REVIEW
                distanceSource = roadResult.source;
            }
        }

        // 8. Find matching active payout slab
        let slabId = null;
        let payoutAmount = null;
        let status = 'PENDING';

        if (totalKm !== null) {
            const now = new Date();
            const slab = await prisma.payout_slabs.findFirst({
                where: {
                    is_active: true,
                    effective_from: { lte: now },
                    AND: [
                        { OR: [{ effective_to: null }, { effective_to: { gte: now } }] },
                        { min_km: { lte: totalKm } },
                        { OR: [{ max_km: null }, { max_km: { gte: totalKm } }] },
                    ],
                },
                orderBy: { min_km: 'asc' },
            });

            if (slab) {
                slabId = slab.id;
                payoutAmount = Number(slab.payout_amount);
                status = 'PENDING';
            } else {
                status = 'MANUAL_REVIEW';
            }
        } else {
            status = 'MANUAL_REVIEW';
        }

        // 9. Store payout record
        await prisma.rider_payouts.create({
            data: {
                rider_id: riderId,
                sub_order_id: subOrderId,
                parent_order_id: subOrder.parent_order_id,
                route_type: routeType,
                pickup_latitude: pickupLat,
                pickup_longitude: pickupLon,
                source_latitude: sourceLat,
                source_longitude: sourceLon,
                delivery_latitude: deliveryLat,
                delivery_longitude: deliveryLon,
                leg1_km: leg1,
                leg2_km: leg2,
                total_km: totalKm,
                slab_id: slabId,
                payout_amount: payoutAmount,
                status,
                calculated_at: new Date(),
            },
        });

        return { success: true, totalKm, payoutAmount, status };
    } catch (err) {
        console.error('[payoutService] calculateAndCreatePayout error:', err);
        return { success: false, reason: err.message };
    }
}

/**
 * Approve a pending payout (admin action).
 * Credits rider wallet and marks status PAID.
 *
 * @param {number} payoutId
 * @param {string} adminUserId - UUID of the approving admin user
 */
export async function approvePayout(payoutId, adminUserId) {
    const payout = await prisma.rider_payouts.findUnique({
        where: { id: payoutId },
        include: { rider: { include: { users: true } } },
    });

    if (!payout) throw new Error('Payout not found');
    if (!['PENDING', 'MANUAL_REVIEW'].includes(payout.status)) {
        throw new Error(`Cannot approve payout in ${payout.status} status`);
    }
    if (!payout.payout_amount || Number(payout.payout_amount) <= 0) {
        throw new Error('Payout amount is zero — set amount before approving');
    }

    const riderUserId = payout.rider.user_id;

    await prisma.$transaction(async (tx) => {
        // Ensure wallet exists
        let wallet = await tx.wallets.findFirst({ where: { user_id: riderUserId } });
        if (!wallet) {
            wallet = await tx.wallets.create({
                data: { user_id: riderUserId, balance: 0 },
            });
        }

        const balanceBefore = wallet.balance;
        const newBalance = Number(balanceBefore) + Number(payout.payout_amount);

        await tx.wallets.update({
            where: { id: wallet.id },
            data: { balance: newBalance, updated_at: new Date(), version: { increment: 1 } },
        });

        await tx.wallet_transactions.create({
            data: {
                wallet_id: wallet.id,
                user_id: riderUserId,
                transaction_type: 'CREDIT',
                amount: payout.payout_amount,
                balance_before: balanceBefore,
                balance_after: newBalance,
                status: 'COMPLETED',
                description: `Rider payout for sub-order #${payout.sub_order_id}`,
                reference_id: payout.sub_order_id,   // UUID of the sub-order
                reference_type: 'rider_payout',
                created_by: adminUserId,
            },
        });

        await tx.rider_payouts.update({
            where: { id: payoutId },
            data: { status: 'PAID', paid_at: new Date(), updated_at: new Date() },
        });

        // Audit log
        await tx.payout_audit_log.create({
            data: {
                changed_by: adminUserId,
                entity_type: 'rider_payouts',
                entity_id: payoutId,
                old_value: { status: payout.status },
                new_value: { status: 'PAID', paid_at: new Date().toISOString() },
            },
        });
    });
}
