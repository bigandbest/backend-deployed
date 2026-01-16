import prisma from '../utils/prisma.js';

class StoreDAO {
    async createStore(data) {
        return await prisma.recommended_store.create({
            data
        });
    }

    async getStoreById(id) {
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

    async updateStore(id, data) {
        return await prisma.recommended_store.update({
            where: { id },
            data
        });
    }

    async deleteStore(id) {
        return await prisma.recommended_store.delete({
            where: { id }
        });
    }

    async listStores(activeOnly = true) {
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

export default new StoreDAO();
