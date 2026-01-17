import prisma from '../config/prisma.js';

class InventoryDAO {
    async getByVariant(variantId) {
        return await prisma.inventory.findUnique({
            where: { variant_id: variantId },
            include: { warehouse: true }
        });
    }

    async create(data) {
        return await prisma.inventory.create({ data });
    }

    async updateStock(variantId, data) {
        return await prisma.inventory.update({
            where: { variant_id: variantId },
            data
        });
    }

    async reserveStock(variantId, quantity) {
        return await prisma.$transaction(async (tx) => {
            const inventory = await tx.inventory.findUnique({
                where: { variant_id: variantId }
            });

            if (!inventory || inventory.stock_qty < quantity) {
                throw new Error('Insufficient stock');
            }

            return await tx.inventory.update({
                where: { variant_id: variantId },
                data: {
                    stock_qty: { decrement: quantity },
                    reserved_qty: { increment: quantity }
                }
            });
        });
    }

    async listByWarehouse(warehouseId) {
        return await prisma.inventory.findMany({
            where: { warehouse_id: warehouseId },
            include: { variant: true }
        });
    }
}

export default new InventoryDAO();
