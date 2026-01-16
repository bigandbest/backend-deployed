import prisma from '../utils/prisma.js';

class ScheduledOrderDAO {
    async create(data) {
        return await prisma.scheduled_orders.create({ data });
    }

    async getById(id) {
        return await prisma.scheduled_orders.findUnique({
            where: { id },
            include: {
                warehouse: true,
                slot: true,
                execution_logs: { orderBy: { created_at: 'desc' } },
                payment_retry_logs: { orderBy: { created_at: 'desc' } }
            }
        });
    }

    async listByUser(userId, pagination = {}) {
        const { page = 1, limit = 10 } = pagination;
        const skip = (page - 1) * limit;

        return await prisma.scheduled_orders.findMany({
            where: { user_id: userId },
            skip,
            take: limit,
            orderBy: { created_at: 'desc' }
        });
    }

    async updateStatus(id, status, failureReason = null) {
        return await prisma.scheduled_orders.update({
            where: { id },
            data: {
                status,
                ...(failureReason && { failure_reason: failureReason }),
                updated_at: new Date()
            }
        });
    }

    async incrementAttempts(id) {
        return await prisma.scheduled_orders.update({
            where: { id },
            data: {
                execution_attempts: { increment: 1 },
                last_execution_attempt: new Date(),
                updated_at: new Date()
            }
        });
    }

    async update(id, data) {
        return await prisma.scheduled_orders.update({
            where: { id },
            data: {
                ...data,
                updated_at: new Date()
            }
        });
    }

    async delete(id) {
        return await prisma.scheduled_orders.delete({
            where: { id }
        });
    }
}

export default new ScheduledOrderDAO();
