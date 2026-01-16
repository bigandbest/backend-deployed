import prisma from '../utils/prisma.js';

class DeliveryZoneDAO {
    async create(data) {
        return await prisma.delivery_zones.create({ data });
    }

    async getById(id) {
        return await prisma.delivery_zones.findUnique({
            where: { id },
            include: {
                zone_pincodes: true,
                warehouse_zones: {
                    include: { warehouse: true }
                }
            }
        });
    }

    async list(filters = {}) {
        const { is_active = true, is_nationwide } = filters;
        return await prisma.delivery_zones.findMany({
            where: {
                ...(is_active !== undefined && { is_active }),
                ...(is_nationwide !== undefined && { is_nationwide })
            },
            orderBy: { name: 'asc' }
        });
    }

    async update(id, data) {
        return await prisma.delivery_zones.update({
            where: { id },
            data: {
                ...data,
                updated_at: new Date()
            }
        });
    }

    async delete(id) {
        return await prisma.delivery_zones.delete({
            where: { id }
        });
    }
}

export default new DeliveryZoneDAO();
