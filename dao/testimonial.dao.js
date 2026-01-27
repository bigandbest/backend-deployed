import prisma from '../config/prisma.js';

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
        const { active } = filters;
        return await prisma.customer_testimonials.findMany({
            where: {
                ...(active !== undefined && { active })
            },
            orderBy: [
                { sort_order: 'asc' },
                { created_at: 'desc' }
            ]
        });
    }

    async update(id, data) {
        return await prisma.customer_testimonials.update({
            where: { id },
            data: {
                ...data,
                updated_at: new Date()
            }
        });
    }

    async delete(id) {
        return await prisma.customer_testimonials.delete({
            where: { id }
        });
    }

    async toggleStatus(id) {
        const current = await this.getById(id);
        if (!current) throw new Error('Testimonial not found');

        return await prisma.customer_testimonials.update({
            where: { id },
            data: {
                active: !current.active,
                updated_at: new Date()
            }
        });
    }
}

export default new TestimonialDAO();
