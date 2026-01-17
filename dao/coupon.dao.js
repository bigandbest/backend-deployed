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
            where: { code: code.toUpperCase() }
        });
    }

    async list(filters = {}, pagination = {}) {
        const { status, page = 1, limit = 20 } = { ...filters, ...pagination };
        const offset = (page - 1) * limit;
        
        const where = status ? { status } : {};
        
        const [items, total] = await Promise.all([
            prisma.coupons.findMany({
                where,
                skip: offset,
                take: limit,
                orderBy: { created_at: 'desc' },
                include: {
                    _count: {
                        select: { usages: true }
                    }
                }
            }),
            prisma.coupons.count({ where })
        ]);
        
        return { items, total, page, limit };
    }

    async update(id, data) {
        return await prisma.coupons.update({
            where: { id },
            data
        });
    }

    async updateStatus(id, status) {
        return await prisma.coupons.update({
            where: { id },
            data: { status }
        });
    }

    async delete(id) {
        return await prisma.coupons.update({
            where: { id },
            data: { status: 'DISABLED' }
        });
    }

    async getUsageHistory(couponId, pagination = {}) {
        const { page = 1, limit = 50 } = pagination;
        const offset = (page - 1) * limit;
        
        const [usage, total] = await Promise.all([
            prisma.coupon_usage.findMany({
                where: { coupon_id: couponId },
                skip: offset,
                take: limit,
                orderBy: { created_at: 'desc' }
            }),
            prisma.coupon_usage.count({
                where: { coupon_id: couponId }
            })
        ]);
        
        return { usage, total, page, limit };
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
