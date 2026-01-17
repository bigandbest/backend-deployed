import prisma from '../config/prisma.js';

class ServiceBookingDAO {
    async create(data) {
        return await prisma.service_bookings.create({
            data
        });
    }

    async getById(id) {
        return await prisma.service_bookings.findUnique({
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
                variant: {
                    include: {
                        product: {
                            select: {
                                name: true,
                                image: true
                            }
                        }
                    }
                },
                address: true,
                order_item: true
            }
        });
    }

    async updateStatus(id, status) {
        return await prisma.service_bookings.update({
            where: { id },
            data: {
                status,
                updated_at: new Date()
            }
        });
    }

    async update(id, data) {
        return await prisma.service_bookings.update({
            where: { id },
            data: {
                ...data,
                updated_at: new Date()
            }
        });
    }

    async listByUser(userId, pagination = {}) {
        const { page = 1, limit = 10 } = pagination;
        const skip = (page - 1) * limit;

        return await prisma.service_bookings.findMany({
            where: { user_id: userId },
            skip,
            take: limit,
            include: {
                variant: {
                    include: {
                        product: {
                            select: { name: true }
                        }
                    }
                }
            },
            orderBy: {
                scheduled_at: 'desc'
            }
        });
    }

    async listByProvider(providerId, status) {
        return await prisma.service_bookings.findMany({
            where: {
                provider_id: providerId,
                ...(status && { status })
            },
            include: {
                user: { select: { name: true, phone: true } },
                address: true,
                variant: {
                    include: {
                        product: { select: { name: true } }
                    }
                }
            },
            orderBy: {
                scheduled_at: 'asc'
            }
        });
    }

    async listAll(filters = {}, pagination = {}) {
        const { status, startDate, endDate } = filters;
        const { page = 1, limit = 10 } = pagination;
        const skip = (page - 1) * limit;

        const where = {
            ...(status && { status }),
            ...(startDate && endDate && {
                scheduled_at: {
                    gte: new Date(startDate),
                    lte: new Date(endDate)
                }
            })
        };

        const [items, total] = await Promise.all([
            prisma.service_bookings.findMany({
                where,
                skip,
                take: limit,
                include: {
                    user: { select: { name: true } },
                    variant: {
                        include: {
                            product: { select: { name: true } }
                        }
                    }
                },
                orderBy: {
                    created_at: 'desc'
                }
            }),
            prisma.service_bookings.count({ where })
        ]);

        return { items, total, page, limit };
    }
}

export default new ServiceBookingDAO();
