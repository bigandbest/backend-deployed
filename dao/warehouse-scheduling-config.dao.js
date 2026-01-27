import prisma from '../config/prisma.js';

class WarehouseSchedulingConfigDAO {
    async create(data) {
        return await prisma.warehouse_scheduling_config.create({ data });
    }

    async getById(id) {
        return await prisma.warehouse_scheduling_config.findUnique({
            where: { id },
            include: { warehouse: true, slot: true }
        });
    }

    async listByWarehouse(warehouseId, activeOnly = true) {
        return await prisma.warehouse_scheduling_config.findMany({
            where: {
                warehouse_id: warehouseId,
                ...(activeOnly && { is_active: true })
            },
            include: { slot: true }
        });
    }

    async update(id, data) {
        return await prisma.warehouse_scheduling_config.update({
            where: { id },
            data: {
                ...data,
                updated_at: new Date()
            }
        });
    }

    async delete(id) {
        return await prisma.warehouse_scheduling_config.delete({
            where: { id }
        });
    }
}

export default new WarehouseSchedulingConfigDAO();
