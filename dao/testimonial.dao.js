import prisma from '../utils/prisma.js';

class TestimonialDAO {
    async create(data) {
        return await prisma.customer_testimonials.create({ data });
    }

    async getById(id) {
        return await prisma.customer_testimonials.findUnique({
            where: { id }
        });
    }

    async list(filters = {}) {
        const { active = true } = filters;
        return await prisma.customer_testimonials.findMany({
            where: { active },
            orderBy: { sort_order: 'asc' }
        });
    }

    async update(id, data) {
        return await prisma.customer_testimonials.update({
            where: { id },
            data
        });
    }

    async delete(id) {
        return await prisma.customer_testimonials.delete({
            where: { id }
        });
    }
}

export default new TestimonialDAO();
