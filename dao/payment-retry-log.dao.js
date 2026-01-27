import prisma from '../config/prisma.js';

class PaymentRetryLogDAO {
    async create(data) {
        return await prisma.payment_retry_logs.create({ data });
    }

    async getById(id) {
        return await prisma.payment_retry_logs.findUnique({
            where: { id },
            include: {
                scheduled_order: true,
                execution_log: true
            }
        });
    }

    async listByScheduledOrder(scheduledOrderId) {
        return await prisma.payment_retry_logs.findMany({
            where: { scheduled_order_id: scheduledOrderId },
            orderBy: { attempt_number: 'desc' }
        });
    }

    async update(id, data) {
        return await prisma.payment_retry_logs.update({
            where: { id },
            data
        });
    }

    async delete(id) {
        return await prisma.payment_retry_logs.delete({
            where: { id }
        });
    }
}

export default new PaymentRetryLogDAO();
