import prisma from '../config/prisma.js';

class WarehousePincodeDAO {
    async listByWarehouse(warehouseId, activeOnly = true) {
        return await prisma.warehouse_pincodes.findMany({
            where: {
                warehouse_id: warehouseId,
                ...(activeOnly && { is_active: true })
            },
            orderBy: { pincode: 'asc' }
        });
    }

    async getByPincode(pincode) {
        return await prisma.warehouse_pincodes.findMany({
            where: { pincode, is_active: true },
            include: { warehouse: true }
        });
    }

    async upsert(warehouseId, pincode, data = {}) {
        // Note: warehouse_pincodes doesn't have a unique constraint on [warehouse_id, pincode] shown in schema,
        // but typically it would. Since it has an 'id', we'll use that if provided, else use findFirst/create.
        const existing = await prisma.warehouse_pincodes.findFirst({
            where: { warehouse_id: warehouseId, pincode: pincode }
        });

        if (existing) {
            return await prisma.warehouse_pincodes.update({
                where: { id: existing.id },
                data: { ...data, updated_at: new Date() }
            });
        } else {
            return await prisma.warehouse_pincodes.create({
                data: {
                    ...data,
                    warehouse_id: warehouseId,
                    pincode: pincode
                }
            });
        }
    }

    async delete(id) {
        return await prisma.warehouse_pincodes.delete({
            where: { id }
        });
    }
}

export default new WarehousePincodeDAO();
