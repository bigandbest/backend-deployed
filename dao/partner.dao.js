import prisma from '../config/prisma.js';

class PartnerDAO {
    async create(data) {
        return await prisma.partners.create({ data });
    }

    async getById(id) {
        return await prisma.partners.findUnique({
            where: { id }
        });
    }

    async list(filters = {}) {
        const { active = true } = filters;
        return await prisma.partners.findMany({
            where: {
                ...(active !== undefined && { active })
            },
            orderBy: { sort_order: 'asc' }
        });
    }

    async update(id, data) {
        return await prisma.partners.update({
            where: { id },
            data: {
                ...data,
                updated_at: new Date()
            }
        });
    }

    async delete(id) {
        return await prisma.partners.delete({
            where: { id }
        });
    }
}

export default new PartnerDAO();
