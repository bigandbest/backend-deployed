import prisma from '../utils/prisma.js';

class UserAddressDAO {
    async create(data) {
        return await prisma.user_addresses.create({ data });
    }

    async getById(id) {
        return await prisma.user_addresses.findUnique({
            where: { id },
            include: { user: true }
        });
    }

    async listByUser(userId) {
        return await prisma.user_addresses.findMany({
            where: { user_id: userId },
            orderBy: { created_at: 'desc' }
        });
    }

    async update(id, data) {
        return await prisma.user_addresses.update({
            where: { id },
            data: {
                ...data,
                updated_at: new Date()
            }
        });
    }

    async setDefault(userId, addressId) {
        return await prisma.$transaction([
            prisma.user_addresses.updateMany({
                where: { user_id: userId },
                data: { is_default: false }
            }),
            prisma.user_addresses.update({
                where: { id: addressId },
                data: { is_default: true, updated_at: new Date() }
            })
        ]);
    }

    async delete(id) {
        return await prisma.user_addresses.delete({
            where: { id }
        });
    }
}

export default new UserAddressDAO();
