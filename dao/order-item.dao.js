import prisma from '../utils/prisma.js';

class OrderItemDAO {
    async create(data) {
        return await prisma.order_items.create({ data });
    }

    async getById(id) {
        return await prisma.order_items.findUnique({
            where: { id },
            include: { variant: true, warehouse: true }
        });
    }

    async listByOrder(orderId) {
        return await prisma.order_items.findMany({
            where: { order_id: orderId },
            include: {
                variant: {
                    include: { product: { select: { name: true } } }
                }
            }
        });
    }

    async update(id, data) {
        return await prisma.order_items.update({
            where: { id },
            data
        });
    }

    async delete(id) {
        return await prisma.order_items.delete({
            where: { id }
        });
    }
}

export default new OrderItemDAO();
