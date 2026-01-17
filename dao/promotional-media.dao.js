import prisma from '../config/prisma.js';

class PromotionalMediaDAO {
    async create(data) {
        return await prisma.promotional_media.create({ data });
    }

    async getById(id) {
        return await prisma.promotional_media.findUnique({
            where: { id }
        });
    }

    async list(filters = {}) {
        const { active = true, media_type } = filters;
        return await prisma.promotional_media.findMany({
            where: {
                ...(active !== undefined && { active }),
                ...(media_type && { media_type })
            },
            orderBy: { position: 'asc' }
        });
    }

    async update(id, data) {
        return await prisma.promotional_media.update({
            where: { id },
            data: {
                ...data,
                updated_at: new Date()
            }
        });
    }

    async delete(id) {
        return await prisma.promotional_media.delete({
            where: { id }
        });
    }
}

export default new PromotionalMediaDAO();
