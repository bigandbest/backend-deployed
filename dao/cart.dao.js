import prisma from '../config/prisma.js';

class CartDAO {
    async addToCart(userId, variantId, quantity = 1, options = {}) {
        const { productId, isBidProduct = false, lockedBidId = null, bidUnitPrice = null } = options;

        // Check if item already exists in cart for this user and variant (or product if no variant)
        const whereClause = {
            user_id: userId,
            is_bid_product: isBidProduct,
            locked_bid_id: lockedBidId
        };

        if (variantId) {
            whereClause.variant_id = variantId;
        } else if (productId) {
            whereClause.product_id = productId;
            // Ensure we don't match items with variants if we mean to add a product-only item
            // But Prisma findFirst with explicit null for variant_id is tricky if undefined.
            // If variantId is null/undefined, we should check for variant_id: null
            whereClause.variant_id = null;
        }

        const existingItem = await prisma.cart_items.findFirst({
            where: whereClause
        });

        if (existingItem) {
            return await prisma.cart_items.update({
                where: { id: existingItem.id },
                data: {
                    quantity: existingItem.quantity + quantity
                }
            });
        }

        return await prisma.cart_items.create({
            data: {
                user_id: userId,
                product_id: productId, // Ensure productId is saved
                variant_id: variantId,
                quantity,
                is_bid_product: isBidProduct,
                locked_bid_id: lockedBidId,
                bid_unit_price: bidUnitPrice
            }
        });
    }

    async getCartItemById(id) {
        return await prisma.cart_items.findUnique({
            where: { id },
            include: {
                product: true,
                variant: true,
                locked_bid: true
            }
        });
    }

    async hasBidProducts(userId) {
        const count = await prisma.cart_items.count({
            where: {
                user_id: userId,
                is_bid_product: true
            }
        });
        return count > 0;
    }

    async getCartByUserId(userId) {
        return await prisma.cart_items.findMany({
            where: { user_id: userId },
            include: {
                product: true,
                variant: true,
                locked_bid: true
            },
            orderBy: { added_at: 'desc' }
        });
    }

    async updateQuantity(cartItemId, quantity) {
        return await prisma.cart_items.update({
            where: { id: cartItemId },
            data: { quantity }
        });
    }

    async removeFromCart(cartItemId) {
        return await prisma.cart_items.delete({
            where: { id: cartItemId }
        });
    }

    async clearCart(userId) {
        return await prisma.cart_items.deleteMany({
            where: { user_id: userId }
        });
    }

    async getCartCount(userId) {
        const result = await prisma.cart_items.aggregate({
            where: { user_id: userId },
            _sum: { quantity: true }
        });
        return result._sum.quantity || 0;
    }

    async removeByLockedBid(lockedBidId) {
        return await prisma.cart_items.deleteMany({
            where: { locked_bid_id: parseInt(lockedBidId) }
        });
    }
}

export default new CartDAO();
