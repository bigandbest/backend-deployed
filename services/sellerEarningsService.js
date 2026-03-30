// services/sellerEarningsService.js
// Credits seller wallet when their sub-order is delivered.
// Earnings = sum(unit_price * quantity) - platform_fee per item

import prisma from '../config/prisma.js';
import { resolveApplicablePlatformFee } from './platformFeeService.js';

/**
 * Credit seller wallet for a delivered seller-type sub-order.
 * Idempotent: checks for existing credit transaction before proceeding.
 *
 * @param {string} subOrderId  - UUID of the delivered sub_order
 * @param {string} sellerId    - UUID of the seller
 */
export async function creditSellerEarnings(subOrderId, sellerId) {
    try {
        // 1. Idempotency — skip if already credited
        const existing = await prisma.wallet_transactions.findFirst({
            where: {
                reference_id: subOrderId,
                reference_type: 'seller_earnings',
                status: 'COMPLETED',
            },
        });
        if (existing) return { success: true, skipped: true };

        // 2. Load sub-order items with product/variant/category info for fee resolution
        const items = await prisma.sub_order_items.findMany({
            where: { sub_order_id: subOrderId },
            include: {
                variant: {
                    include: {
                        product: {
                            include: {
                                category: { select: { id: true } },
                                subcategory: { select: { id: true } },
                                group: { select: { id: true } },
                            },
                        },
                    },
                },
            },
        });

        if (!items.length) return { success: false, reason: 'NO_ITEMS' };

        // 3. Calculate total earnings after platform fee
        let totalEarnings = 0;
        for (const item of items) {
            const itemTotal = Number(item.unit_price) * item.quantity;
            let feePercent = 0;

            try {
                const feeResolution = await resolveApplicablePlatformFee({
                    categoryId: item.variant?.product?.category?.id,
                    subcategoryId: item.variant?.product?.subcategory?.id,
                    groupId: item.variant?.product?.group?.id,
                });
                feePercent = Number(feeResolution?.fee_percentage || 0);
            } catch {
                // If fee resolution fails, proceed with 0% fee so delivery is not blocked
                feePercent = 0;
            }

            const platformCharge = (itemTotal * feePercent) / 100;
            totalEarnings += itemTotal - platformCharge;
        }

        totalEarnings = parseFloat(totalEarnings.toFixed(2));
        if (totalEarnings <= 0) return { success: false, reason: 'ZERO_EARNINGS' };

        // 4. Get seller's user_id for wallet lookup
        const seller = await prisma.sellers.findUnique({
            where: { id: sellerId },
            select: { user_id: true },
        });
        if (!seller) return { success: false, reason: 'SELLER_NOT_FOUND' };

        // 5. Credit wallet inside a transaction
        await prisma.$transaction(async (tx) => {
            let wallet = await tx.wallets.findFirst({ where: { user_id: seller.user_id } });
            if (!wallet) {
                wallet = await tx.wallets.create({
                    data: { user_id: seller.user_id, balance: 0 },
                });
            }

            const balanceBefore = wallet.balance;
            const newBalance = Number(balanceBefore) + totalEarnings;

            await tx.wallets.update({
                where: { id: wallet.id },
                data: { balance: newBalance, updated_at: new Date(), version: { increment: 1 } },
            });

            await tx.wallet_transactions.create({
                data: {
                    wallet_id: wallet.id,
                    user_id: seller.user_id,
                    transaction_type: 'CREDIT',
                    amount: totalEarnings,
                    balance_before: balanceBefore,
                    balance_after: newBalance,
                    status: 'COMPLETED',
                    description: `Seller earnings for sub-order #${subOrderId}`,
                    reference_id: subOrderId,
                    reference_type: 'seller_earnings',
                },
            });
        });

        return { success: true, totalEarnings };
    } catch (err) {
        console.error('[sellerEarningsService] creditSellerEarnings error:', err);
        return { success: false, reason: err.message };
    }
}
