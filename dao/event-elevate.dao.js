import prisma from '../utils/prisma.js';

class EventElevateDAO {
    async create(data) {
        return await prisma.event_elevate.create({ data });
    }

    async getById(id) {
        return await prisma.event_elevate.findUnique({
            where: { id }
        });
    }

    async list(filters = {}) {
        const { active = true, category, position } = filters;
        return await prisma.event_elevate.findMany({
            where: {
                ...(active !== undefined && { active }),
                ...(category && { category }),
                ...(position && { position })
            },
            orderBy: { display_order: 'asc' }
        });
    }

    async update(id, data) {
        return await prisma.event_elevate.update({
            where: { id },
            data: {
                ...data,
                updated_at: new Date()
            }
        });
    }

    async delete(id) {
        return await prisma.event_elevate.delete({
            where: { id }
        });
    }
}

export default new EventElevateDAO();
