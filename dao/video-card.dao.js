import prisma from '../config/prisma.js';

class VideoCardDAO {
    async create(data) {
        return await prisma.video_cards.create({ data });
    }

    async list(filters = {}) {
        const { active } = filters;
        return await prisma.video_cards.findMany({
            where: {
                ...(active !== undefined && { active })
            },
            orderBy: { position: 'asc' }
        });
    }

    async getAll() {
        return await this.list({ active: undefined });
    }

    async getActive() {
        return await this.list({ active: true });
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
