import prisma from '../utils/prisma.js';

class UserNotificationDAO {
    async create(data) {
        return await prisma.user_notifications.create({ data });
    }

    async listByUser(userId, pagination = {}) {
        const { page = 1, limit = 20, unreadOnly = false } = pagination;
        const skip = (page - 1) * limit;

        return await prisma.user_notifications.findMany({
            where: {
                user_id: userId,
                ...(unreadOnly && { is_read: false })
            },
            skip,
            take: limit,
            orderBy: { created_at: 'desc' }
        });
    }

    async markAsRead(id) {
        return await prisma.user_notifications.update({
            where: { id },
            data: {
                is_read: true,
                read_at: new Date()
            }
        });
    }

    async markAllAsRead(userId) {
        return await prisma.user_notifications.updateMany({
            where: { user_id: userId, is_read: false },
            data: {
                is_read: true,
                read_at: new Date()
            }
        });
    }

    async delete(id) {
        return await prisma.user_notifications.delete({
            where: { id }
        });
    }

    async deleteRead(userId) {
        return await prisma.user_notifications.deleteMany({
            where: { user_id: userId, is_read: true }
        });
    }
}

export default new UserNotificationDAO();
