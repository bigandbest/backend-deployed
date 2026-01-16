import prisma from '../utils/prisma.js';

class SmallPromoCardDAO {
    async create(data) {
        return await prisma.small_promo_cards.create({ data });
    }

    async getById(id) {
        return await prisma.small_promo_cards.findUnique({
            where: { id }
        });
    }

    async list(filters = {}) {
        const { active = true } = filters;
        return await prisma.small_promo_cards.findMany({
            where: {
                ...(active !== undefined && { is_active: active })
            },
            orderBy: { display_order: 'asc' }
        });
    }

    async update(id, data) {
        return await prisma.small_promo_cards.update({
            where: { id },
            data: {
                ...data,
                updated_at: new Date()
            }
        });
    }

    async delete(id) {
        return await prisma.small_promo_cards.delete({
            where: { id }
        });
    }
}

export default new SmallPromoCardDAO();
