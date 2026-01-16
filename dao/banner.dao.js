import prisma from '../utils/prisma.js';

class BannerDAO {
    async create(data) {
        return await prisma.banners.create({ data });
    }

    async getById(id) {
        return await prisma.banners.findUnique({
            where: { id },
            include: { recommended_stores: true }
        });
    }

    async list(filters = {}) {
        const { type, active = true, is_mobile } = filters;
        return await prisma.banners.findMany({
            where: {
                ...(type && { banner_type: type }),
                ...(active !== undefined && { active }),
                ...(is_mobile !== undefined && { is_mobile })
            },
            orderBy: { display_order: 'asc' }
        });
    }

    async update(id, data) {
        return await prisma.banners.update({
            where: { id },
            data
        });
    }

    async delete(id) {
        return await prisma.banners.delete({ where: { id } });
    }
}

export default new BannerDAO();
