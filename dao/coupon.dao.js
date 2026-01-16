import prisma from '../utils/prisma.js';

class CouponDAO {
    async create(data) {
        return await prisma.coupons.create({ data });
    }

    async getById(id) {
        return await prisma.coupons.findUnique({
            where: { id },
            include: { usages: true }
        });
    }

    async getByCode(code) {
        return await prisma.coupons.findUnique({
            where: { code }
        });
    }

    async list(filters = {}) {
        const { status = 'ACTIVE' } = filters;
        return await prisma.coupons.findMany({
            where: { status },
            orderBy: { created_at: 'desc' }
        });
    }

    async update(id, data) {
        return await prisma.coupons.update({
            where: { id },
            data
        });
    }

    async delete(id) {
        return await prisma.coupons.delete({ where: { id } });
    }

    async validateCoupon(code, userId, orderValue) {
        const coupon = await this.getByCode(code);
        if (!coupon || coupon.status !== 'ACTIVE') return { valid: false, message: 'Invalid or inactive coupon' };

        const now = new Date();
        if (now < coupon.valid_from || now > coupon.valid_to) return { valid: false, message: 'Coupon expired' };

        if (orderValue < (coupon.min_order_value || 0)) {
            return { valid: false, message: `Minimum order value of ${coupon.min_order_value} required` };
        }

        // Check total usage
        const totalUsage = await prisma.coupon_usage.count({ where: { coupon_id: coupon.id } });
        if (coupon.usage_limit_total && totalUsage >= coupon.usage_limit_total) {
            return { valid: false, message: 'Coupon usage limit reached' };
        }

        // Check per user usage
        const userUsage = await prisma.coupon_usage.count({ where: { coupon_id: coupon.id, user_id: userId } });
        if (coupon.usage_limit_per_user && userUsage >= coupon.usage_limit_per_user) {
            return { valid: false, message: 'You have already used this coupon' };
        }

        return { valid: true, coupon };
    }
}

export default new CouponDAO();
