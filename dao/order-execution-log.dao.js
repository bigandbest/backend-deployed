import prisma from '../config/prisma.js';

class OrderExecutionLogDAO {
    async create(data) {
        return await prisma.order_execution_logs.create({ data });
    }

    async getById(id) {
        return await prisma.order_execution_logs.findUnique({
            where: { id },
            include: { payment_retry_logs: true }
        });
    }

    async listByScheduledOrder(scheduledOrderId) {
        return await prisma.order_execution_logs.findMany({
            where: { scheduled_order_id: scheduledOrderId },
            orderBy: { attempt_number: 'desc' }
        });
    }

    async update(id, data) {
        return await prisma.order_execution_logs.update({
            where: { id },
            data
        });
    }

    async delete(id) {
        return await prisma.order_execution_logs.delete({
            where: { id }
        });
    }
}

export default new OrderExecutionLogDAO();
