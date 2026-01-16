import prisma from '../utils/prisma.js';

class SchedulingTimeSlotDAO {
    async create(data) {
        return await prisma.scheduling_time_slots.create({ data });
    }

    async getById(id) {
        return await prisma.scheduling_time_slots.findUnique({
            where: { id }
        });
    }

    async list(filters = {}) {
        const { is_active = true } = filters;
        return await prisma.scheduling_time_slots.findMany({
            where: {
                ...(is_active !== undefined && { is_active })
            },
            orderBy: { start_time: 'asc' }
        });
    }

    async update(id, data) {
        return await prisma.scheduling_time_slots.update({
            where: { id },
            data: {
                ...data,
                updated_at: new Date()
            }
        });
    }

    async delete(id) {
        return await prisma.scheduling_time_slots.delete({
            where: { id }
        });
    }
}

export default new SchedulingTimeSlotDAO();
