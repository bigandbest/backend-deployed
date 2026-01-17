import prisma from '../config/prisma.js';

class OrderDAO {
    async create(data) {
        return await prisma.orders.create({
            data
        });
    }

    async getById(id) {
        return await prisma.orders.findUnique({
            where: { id },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phone: true
                    }
                },
                order_items: {
                    include: {
                        variant: {
                            include: {
                                product: {
                                    select: {
                                        name: true,
                                        image: true
                                    }
                                }
                            }
                        }
                    }
                },
                tracking: {
                    orderBy: {
                        timestamp: 'desc'
                    }
                },
                coupon_usage: {
                    include: {
                        coupon: true
                    }
                }
            }
        });
    }

    async update(id, data) {
        return await prisma.orders.update({
            where: { id },
            data: {
                ...data,
                updated_at: new Date()
            }
        });
    }

    async logicalDelete(id) {
        return await prisma.orders.update({
            where: { id },
            data: {
                is_deleted: true,
                updated_at: new Date()
            }
        });
    }

    async delete(id) {
        return await prisma.orders.delete({
            where: { id }
        });
    }

    async listByUser(userId, pagination = {}) {
        const { page = 1, limit = 10 } = pagination;
        const skip = (page - 1) * limit;

        return await prisma.orders.findMany({
            where: {
                user_id: userId,
                is_deleted: false
            },
            skip,
            take: limit,
            orderBy: {
                created_at: 'desc'
            },
            include: {
                _count: {
                    select: { order_items: true }
                }
            }
        });
    }

    async listAll(filters = {}, pagination = {}) {
        const { status, isDeleted = false, paymentMethod, userId } = filters;
        const { page = 1, limit = 10 } = pagination;
        const skip = (page - 1) * limit;

        const whereClause = {
            is_deleted: isDeleted
        };

        if (status) whereClause.status = status;
        if (paymentMethod) whereClause.payment_method = paymentMethod;
        if (userId) whereClause.user_id = userId;

        const [items, total] = await Promise.all([
            prisma.orders.findMany({
                where: whereClause,
                skip,
                take: limit,
                orderBy: {
                    created_at: 'desc'
                },
                include: {
                    user: {
                        select: { name: true }
                    }
                }
            }),
            prisma.orders.count({
                where: whereClause
            })
        ]);

        return { items, total, page, limit };
    }
}

export default new OrderDAO();
