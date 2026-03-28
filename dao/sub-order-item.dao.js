import prisma from '../config/prisma.js';

class SubOrderItemDAO {
    /**
     * Create multiple sub-order items in bulk
     */
    async createMany(items) {
        return await prisma.sub_order_items.createMany({
            data: items.map((item) => ({
                sub_order_id: item.sub_order_id,
                product_id: item.product_id,
                variant_id: item.variant_id,
                quantity: item.quantity,
                unit_price: item.unit_price,
            })),
        });
    }

    /**
     * List items for a specific sub-order
     */
    async listBySubOrderId(subOrderId) {
        return await prisma.sub_order_items.findMany({
            where: { sub_order_id: subOrderId },
            include: {
                product: {
                    include: {
                        media: {
                            where: { is_primary: true },
                            orderBy: { sort_order: 'asc' },
                            take: 1,
                        },
                    },
                },
                variant: true,
            },
        });
    }

    /**
     * Delete all items for a sub-order (used when re-routing after cancellation)
     */
    async deleteBySubOrderId(subOrderId) {
        return await prisma.sub_order_items.deleteMany({
            where: { sub_order_id: subOrderId },
        });
    }

    /**
     * Get item by ID
     */
    async getById(id) {
        return await prisma.sub_order_items.findUnique({
            where: { id },
            include: {
                product: true,
                variant: true,
                sub_order: true,
            },
        });
    }
}

export default new SubOrderItemDAO();
