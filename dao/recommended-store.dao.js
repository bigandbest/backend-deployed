import prisma from '../config/prisma.js';

class RecommendedStoreDAO {
    async create(data) {
        return await prisma.recommended_store.create({
            data
        });
    }

    async getById(id) {
        return await prisma.recommended_store.findUnique({
            where: { id },
            include: {
                banner: true,
                _count: {
                    select: { products: true }
                }
            }
        });
    }

    async update(id, data) {
        return await prisma.recommended_store.update({
            where: { id },
            data
        });
    }

    async delete(id) {
        return await prisma.recommended_store.delete({
            where: { id }
        });
    }

    async list(filters = {}) {
        const { activeOnly = true } = filters;
        return await prisma.recommended_store.findMany({
            where: activeOnly ? { is_active: true } : {},
            include: {
                banner: {
                    select: { image_url: true, link: true }
                }
            },
            orderBy: { name: 'asc' }
        });
    }
}

export default new RecommendedStoreDAO();
