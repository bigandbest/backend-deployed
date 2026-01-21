import prisma from '../config/prisma.js';

class StoreDAO {
    async create(data) {
        return await prisma.stores.create({
            data
        });
    }

    async getById(id) {
        return await prisma.stores.findUnique({
            where: { id }
        });
    }

    async update(id, data) {
        return await prisma.stores.update({
            where: { id },
            data: {
                ...data
            }
        });
    }

    async delete(id) {
        return await prisma.stores.delete({
            where: { id }
        });
    }

    async listAll() {
        return await prisma.stores.findMany({
            orderBy: { name: 'asc' }
        });
    }
}

export default new StoreDAO();
