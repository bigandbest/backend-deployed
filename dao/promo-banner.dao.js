import prisma from '../config/prisma.js';

class PromoBannerDAO {
    async create(data) {
        return await prisma.promo_banners.create({ data });
    }

    async getById(id) {
        return await prisma.promo_banners.findUnique({
            where: { id }
        });
    }

    async list(filters = {}) {
        const { active = true } = filters;
        return await prisma.promo_banners.findMany({
            where: {
                ...(active !== undefined && { active })
            },
            orderBy: { display_order: 'asc' }
        });
    }

    async update(id, data) {
        return await prisma.promo_banners.update({
            where: { id },
            data: {
                ...data,
                updated_at: new Date()
            }
        });
    }

    async delete(id) {
        return await prisma.promo_banners.delete({
            where: { id }
        });
    }
}

export default new PromoBannerDAO();
