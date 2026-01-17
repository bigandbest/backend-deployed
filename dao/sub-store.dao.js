import prisma from '../config/prisma.js';

class SubStoreDAO {
    async create(data) {
        return await prisma.subStore.create({
            data
        });
    }

    async getById(id) {
        return await prisma.subStore.findUnique({
            where: { id }
        });
    }

    async update(id, data) {
        return await prisma.subStore.update({
            where: { id },
            data: {
                ...data
            }
        });
    }

    async delete(id) {
        return await prisma.subStore.delete({
            where: { id }
        });
    }

    async listAll() {
        return await prisma.subStore.findMany({
            orderBy: { name: 'asc' }
        });
    }
}

export default new SubStoreDAO();
