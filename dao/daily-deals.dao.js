import prisma from '../config/prisma.js';

class DailyDealsDAO {
    async create(data) {
        return await prisma.daily_deals.create({
            data: {
                ...data,
                banner_id: data.banner_id || null
            }
        });
    }

    async getById(id) {
        return await prisma.daily_deals.findUnique({
            where: { id },
            include: {
                add_banner: true
            }
        });
    }

    async list(filters = {}) {
        const { active } = filters;
        return await prisma.daily_deals.findMany({
            where: {
                ...(active !== undefined && { active })
            },
            include: {
                add_banner: true
            },
            orderBy: {
                sort_order: 'asc'
            }
        });
    }

    async update(id, data) {
        return await prisma.daily_deals.update({
            where: { id },
            data: {
                ...data,
                updated_at: new Date()
            }
        });
    }

    async delete(id) {
        return await prisma.daily_deals.delete({
            where: { id }
        });
    }
}

export default new DailyDealsDAO();
