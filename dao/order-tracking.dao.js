import prisma from '../config/prisma.js';

class OrderTrackingDAO {
    async create(data) {
        return await prisma.order_tracking.create({ data });
    }

    async getTrackingHistory(orderId) {
        return await prisma.order_tracking.findMany({
            where: { order_id: orderId },
            orderBy: { timestamp: 'desc' }
        });
    }

    async update(id, data) {
        return await prisma.order_tracking.update({
            where: { id },
            data
        });
    }

    async delete(id) {
        return await prisma.order_tracking.delete({
            where: { id }
        });
    }
}

export default new OrderTrackingDAO();
