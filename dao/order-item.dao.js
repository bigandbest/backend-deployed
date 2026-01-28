import prisma from '../config/prisma.js';

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
                    include: {
                        product: { select: { name: true, media: true } },
                        media: true
                    }
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

    async createMany(items) {
        return await prisma.order_items.createMany({
            data: items
        });
    }

    async deleteByOrder(orderId) {
        return await prisma.order_items.deleteMany({
            where: { order_id: orderId }
        });
    }
}

export default new OrderItemDAO();
