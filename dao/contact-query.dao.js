import prisma from '../config/prisma.js';

class ContactQueryDAO {
    async create(data) {
        return await prisma.contact_queries.create({ data });
    }

    async getById(id) {
        return await prisma.contact_queries.findUnique({
            where: { id: parseInt(id) }
        });
    }

    async list(filters = {}, pagination = {}) {
        const { status } = filters;
        const { page = 1, limit = 10 } = pagination;
        const skip = (page - 1) * limit;

        const [items, total] = await Promise.all([
            prisma.contact_queries.findMany({
                where: { ...(status && { status }) },
                skip,
                take: limit,
                orderBy: { created_at: 'desc' }
            }),
            prisma.contact_queries.count({
                where: { ...(status && { status }) }
            })
        ]);

        return { items, total, page, limit };
    }

    async updateStatus(id, status) {
        return await prisma.contact_queries.update({
            where: { id: parseInt(id) },
            data: {
                status,
                updated_at: new Date()
            }
        });
    }

    async delete(id) {
        return await prisma.contact_queries.delete({
            where: { id: parseInt(id) }
        });
    }
}

export default new ContactQueryDAO();
