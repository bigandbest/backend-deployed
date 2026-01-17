import prisma from '../config/prisma.js';

class CouponUsageDAO {
    async recordUsage(data) {
        return await prisma.coupon_usage.create({ data });
    }

    async getByOrderId(order_id) {
        return await prisma.coupon_usage.findUnique({
            where: { order_id },
            include: { coupon: true }
        });
    }

    async getUserUsages(user_id) {
        return await prisma.coupon_usage.findMany({
            where: { user_id },
            include: { coupon: true, order: true },
            orderBy: { applied_at: 'desc' }
        });
    }

    async updateStatus(id, status) {
        return await prisma.coupon_usage.update({
            where: { id },
            data: { status, updated_at: new Date() }
        });
    }
}

export default new CouponUsageDAO();
