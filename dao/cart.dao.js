import prisma from '../utils/prisma.js';

class CartDAO {
    async addToCart(userId, variantId, quantity = 1, options = {}) {
        const { isBidProduct = false, lockedBidId = null, bidUnitPrice = null } = options;

        // Check if item already exists in cart for this user and variant
        // Note: For bid products, we might want separate entries if bid IDs differ.
        // For simplicity, we'll treat non-bid products as unique by (user, variant).
        const existingItem = await prisma.cart_items.findFirst({
            where: {
                user_id: userId,
                variant_id: variantId,
                is_bid_product: isBidProduct,
                locked_bid_id: lockedBidId
            }
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
                variant_id: variantId,
                quantity,
                is_bid_product: isBidProduct,
                locked_bid_id: lockedBidId,
                bid_unit_price: bidUnitPrice
            }
        });
    }

    async getCartByUserId(userId) {
        return await prisma.cart_items.findMany({
            where: { user_id: userId },
            include: {
                variant: {
                    include: {
                        product: {
                            select: {
                                name: true,
                                image: true,
                                vertical: true
                            }
                        }
                    }
                }
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
}

export default new CartDAO();
