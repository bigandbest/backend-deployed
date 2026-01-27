import prisma from '../config/prisma.js';

class RefundRequestDAO {
    async create(data) {
        return await prisma.refund_requests.create({
            data
        });
    }

    async getById(id) {
        return await prisma.refund_requests.findUnique({
            where: { id: parseInt(id) }
        });
    }

    async listByOrder(orderId) {
        return await prisma.refund_requests.findMany({
            where: { order_id: orderId.toString() }
        });
    }

    async update(id, data) {
        return await prisma.refund_requests.update({
            where: { id: parseInt(id) },
            data
        });
    }

    async delete(id) {
        return await prisma.refund_requests.delete({
            where: { id: parseInt(id) }
        });
    }
}

export default new RefundRequestDAO();
