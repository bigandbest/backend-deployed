import prisma from '../utils/prisma.js';

class VideoCardDAO {
    async create(data) {
        return await prisma.video_cards.create({ data });
    }

    async list(filters = {}) {
        const { active = true } = filters;
        return await prisma.video_cards.findMany({
            where: {
                ...(active !== undefined && { active })
            },
            orderBy: { position: 'asc' }
        });
    }

    async getById(id) {
        return await prisma.video_cards.findUnique({
            where: { id }
        });
    }

    async update(id, data) {
        return await prisma.video_cards.update({
            where: { id },
            data: {
                ...data,
                updated_at: new Date()
            }
        });
    }

    async delete(id) {
        return await prisma.video_cards.delete({
            where: { id }
        });
    }
}

export default new VideoCardDAO();
