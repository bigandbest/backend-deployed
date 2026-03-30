// services/sellerEarningsService.js
// Credits seller wallet when their sub-order is delivered.
// Earnings = sum(seller_offer_price * quantity) - platform_fee per item category
//
// BUSINESS RULE:
//   BBM sells at X (admin/customer price).
//   Seller accepted bid at Y (offer_price in seller_products).
//   Platform deducts fee% from Y (based on product category).
//   Net credit to seller wallet = Y - (Y * fee%)

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

        // 3. Calculate total earnings after platform fee.
        //    Use seller's ACCEPTED OFFER PRICE (from seller_products) as the base,
        //    NOT item.unit_price which is the customer-facing admin selling price.
        let totalEarnings = 0;
        const earningsBreakdown = [];

        for (const item of items) {
            const product = item.variant?.product;

            // Look up the seller's accepted offer price for this variant
            let sellerOfferPrice = null;
            if (item.variant?.id) {
                const sellerProduct = await prisma.seller_products.findFirst({
                    where: {
                        seller_id: sellerId,
                        variant_id: item.variant.id,
                    },
                    select: { offer_price: true },
                });
                if (sellerProduct?.offer_price != null) {
                    sellerOfferPrice = Number(sellerProduct.offer_price);
                }
            }

            // Fallback to unit_price if seller offer price not recorded
            const basePrice = sellerOfferPrice ?? Number(item.unit_price);
            const itemTotal = basePrice * item.quantity;

            let feePercent = 0;
            try {
                const feeResolution = await resolveApplicablePlatformFee({
                    categoryId: product?.category?.id,
                    subcategoryId: product?.subcategory?.id,
                    groupId: product?.group?.id,
                });
                feePercent = Number(feeResolution?.fee_percentage || 0);
            } catch {
                // If fee resolution fails, proceed with 0% so delivery is not blocked
                feePercent = 0;
            }

            const platformCharge = parseFloat(((itemTotal * feePercent) / 100).toFixed(2));
            const netEarnings = parseFloat((itemTotal - platformCharge).toFixed(2));
            totalEarnings += netEarnings;

            earningsBreakdown.push({
                variant_id: item.variant?.id,
                quantity: item.quantity,
                offer_price: basePrice,
                item_total: itemTotal,
                fee_percent: feePercent,
                platform_charge: platformCharge,
                net_earnings: netEarnings,
            });
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

            const feeNote = earningsBreakdown.length === 1
                ? `${earningsBreakdown[0].fee_percent}% category fee deducted`
                : 'category fee per item deducted';

            await tx.wallet_transactions.create({
                data: {
                    wallet_id: wallet.id,
                    user_id: seller.user_id,
                    transaction_type: 'CREDIT',
                    amount: totalEarnings,
                    balance_before: balanceBefore,
                    balance_after: newBalance,
                    status: 'COMPLETED',
                    description: `Seller earnings for sub-order #${subOrderId} (${feeNote})`,
                    reference_id: subOrderId,
                    reference_type: 'seller_earnings',
                },
            });
        });

        return { success: true, totalEarnings, breakdown: earningsBreakdown };
    } catch (err) {
        console.error('[sellerEarningsService] creditSellerEarnings error:', err);
        return { success: false, reason: err.message };
    }
}
