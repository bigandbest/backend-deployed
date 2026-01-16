import prisma from '../utils/prisma.js';

class EnquiryRegularDAO {
    async create(data) {
        return await prisma.enquiries.create({ data });
    }

    async getById(id) {
        return await prisma.enquiries.findUnique({
            where: { id },
            include: { user: true }
        });
    }

    async list(filters = {}) {
        const { user_id, status, type } = filters;
        return await prisma.enquiries.findMany({
            where: {
                ...(user_id && { user_id }),
                ...(status && { status }),
                ...(type && { type })
            },
            orderBy: { created_at: 'desc' }
        });
    }

    async update(id, data) {
        return await prisma.enquiries.update({
            where: { id },
            data: {
                ...data,
                updated_at: new Date()
            }
        });
    }

    async delete(id) {
        return await prisma.enquiries.delete({
            where: { id }
        });
    }
}

export default new EnquiryRegularDAO();
