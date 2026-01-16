import prisma from '../utils/prisma.js';

class WarehouseZoneDAO {
    async link(warehouseId, zoneId, priority = 1) {
        return await prisma.warehouse_zones.create({
            data: {
                warehouse_id: warehouseId,
                zone_id: zoneId,
                priority
            }
        });
    }

    async unlink(id) {
        return await prisma.warehouse_zones.delete({
            where: { id }
        });
    }

    async listByWarehouse(warehouseId) {
        return await prisma.warehouse_zones.findMany({
            where: { warehouse_id: warehouseId },
            include: { zone: true },
            orderBy: { priority: 'asc' }
        });
    }

    async updatePriority(id, priority) {
        return await prisma.warehouse_zones.update({
            where: { id },
            data: { priority }
        });
    }
}

export default new WarehouseZoneDAO();
