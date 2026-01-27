import prisma from '../config/prisma.js';

class GeneralEnquiryDAO {
    async create(data) {
        return await prisma.enquiries.create({
            data
        });
    }

    async getById(id) {
        return await prisma.enquiries.findUnique({
            where: { id }
        });
    }

    async list(filters = {}, pagination = {}) {
        const { page = 1, limit = 10 } = pagination;
        const skip = (page - 1) * limit;

        return await prisma.enquiries.findMany({
            where: filters,
            skip,
            take: limit,
            orderBy: { created_at: 'desc' }
        });
    }

    async count(filters = {}) {
        return await prisma.enquiries.count({
            where: filters
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

export default new GeneralEnquiryDAO();
