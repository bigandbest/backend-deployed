import prisma from '../config/prisma.js';

class WarehouseDAO {
    async create(data) {
        return await prisma.warehouses.create({ data });
    }

    async getById(id) {
        return await prisma.warehouses.findUnique({
            where: { id },
            include: {
                parent_warehouse: true,
                child_warehouses: true,
                warehouse_zones: { include: { zone: true } },
                warehouse_pincodes: true,
                scheduling_configs: { include: { slot: true } }
            }
        });
    }

    async getByName(name) {
        return await prisma.warehouses.findUnique({
            where: { name }
        });
    }

    async list(filters = {}) {
        const { active = true, type } = filters;
        return await prisma.warehouses.findMany({
            where: {
                ...(active !== undefined && { is_active: active }),
                ...(type && { type })
            },
            orderBy: { name: 'asc' }
        });
    }

    async getHierarchy() {
        return await prisma.warehouses.findMany({
            where: { hierarchy_level: 0 },
            include: {
                child_warehouses: {
                    include: {
                        child_warehouses: true
                    }
                }
            }
        });
    }

    async update(id, data) {
        return await prisma.warehouses.update({
            where: { id },
            data: {
                ...data,
                updated_at: new Date()
            }
        });
    }

    async delete(id) {
        return await prisma.warehouses.delete({
            where: { id }
        });
    }
}

export default new WarehouseDAO();
