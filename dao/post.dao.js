import prisma from '../config/prisma.js';

class PostDAO {
    async create(data) {
        return await prisma.post.create({ data });
    }

    async getById(id) {
        return await prisma.post.findUnique({
            where: { id },
            include: { author: { select: { name: true, email: true } } }
        });
    }

    async list(filters = {}) {
        const { published, authorId } = filters;
        return await prisma.post.findMany({
            where: {
                ...(published !== undefined && { published }),
                ...(authorId && { authorId })
            },
            orderBy: { id: 'desc' }
        });
    }

    async update(id, data) {
        return await prisma.post.update({
            where: { id },
            data
        });
    }

    async delete(id) {
        return await prisma.post.delete({
            where: { id }
        });
    }
}

export default new PostDAO();
