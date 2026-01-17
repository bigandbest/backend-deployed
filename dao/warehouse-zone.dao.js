import prisma from '../config/prisma.js';

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

    async listByZone(zoneId) {
        return await prisma.warehouse_zones.findMany({
            where: { zone_id: zoneId, is_active: true },
            include: { warehouse: true }
        });
    }

    async listActiveMappings() {
        return await prisma.warehouse_zones.findMany({
            where: { is_active: true },
            include: { zone: true }
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
