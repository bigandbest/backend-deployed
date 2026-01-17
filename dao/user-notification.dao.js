import prisma from '../config/prisma.js';

class UserNotificationDAO {
    async create(data) {
        return await prisma.user_notifications.create({ data });
    }

    async listByUserId(userId, options = {}) {
        const { unread_only = false, limit = 20 } = options;
        const now = new Date();

        return await prisma.user_notifications.findMany({
            where: {
                user_id: userId,
                ...(unread_only && { is_read: false }),
                expiry_date: { gte: now }
            },
            take: limit,
            orderBy: { created_at: 'desc' }
        });
    }

    async update(id, data) {
        return await prisma.user_notifications.update({
            where: { id: parseInt(id) },
            data
        });
    }

    async getUnreadCount(userId) {
        const now = new Date();
        return await prisma.user_notifications.count({
            where: {
                user_id: userId,
                is_read: false,
                expiry_date: { gte: now }
            }
        });
    }

    async listActive(options = {}) {
        const now = new Date();
        return await prisma.user_notifications.findMany({
            where: {
                expiry_date: { gte: now }
            },
            orderBy: { created_at: 'desc' }
        });
    }

    async listAdmin() {
        // Based on original logic: notification_type eq admin OR user_id is null
        return await prisma.user_notifications.findMany({
            where: {
                OR: [
                    { notification_type: 'admin' },
                    { user_id: null }
                ]
            },
            orderBy: { created_at: 'desc' }
        });
    }

    async createMany(notifications) {
        return await prisma.user_notifications.createMany({
            data: notifications
        });
    }
}

export default new UserNotificationDAO();
