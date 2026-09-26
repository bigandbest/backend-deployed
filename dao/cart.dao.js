import prisma from '../config/prisma.js';

class CartDAO {
    async addToCart(userId, variantId, quantity = 1, options = {}) {
        const { isBidProduct = false, bidUnitPrice = null } = options;

        if (!variantId) {
            throw new Error('variant_id is required for cart operations');
        }

        // Check if item already exists in cart for this user and variant
        const existingItem = await prisma.cart_items.findFirst({
            where: {
                user_id: userId,
                variant_id: variantId,
                is_bid_product: isBidProduct,
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
                bid_unit_price: bidUnitPrice
            }
        });
    }

    // Schema relation names are product_variants / products / product_media; callers use the
    // shorter variant / product / media shape, so map it here once.
    _withVariantShape(item) {
        if (!item) return item;
        const { product_variants: pv, ...rest } = item;
        if (!pv) return { ...rest, variant: null };
        const { products, product_media, ...variantRest } = pv;
        return {
            ...rest,
            variant: {
                ...variantRest,
                product: products,
                media: product_media || [],
            },
        };
    }

    async getCartItemById(id) {
        const item = await prisma.cart_items.findUnique({
            where: { id },
            include: { product_variants: { include: { products: true } } }
        });
        return this._withVariantShape(item);
    }

    async getCartByUserId(userId) {
        const rows = await prisma.cart_items.findMany({
            where: { user_id: userId },
            include: {
                product_variants: {
                    include: {
                        inventory: true,
                        product_media: { take: 1 },
                        products: { include: { media: { where: { is_primary: true }, take: 1 } } }
                    }
                }
            },
            orderBy: { added_at: 'desc' }
        });
        return rows.map((r) => this._withVariantShape(r));
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
