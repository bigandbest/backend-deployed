import prisma from '../utils/prisma.js';

class StockMovementDAO {
    async create(data) {
        return await prisma.stock_movements.create({
            data: {
                ...data,
                performed_at: new Date()
            }
        });
    }

    async listByProduct(productId) {
        return await prisma.stock_movements.findMany({
            where: { product_id: productId },
            include: { warehouse: true },
            orderBy: { created_at: 'desc' }
        });
    }

    async listByWarehouse(warehouseId) {
        return await prisma.stock_movements.findMany({
            where: { warehouse_id: warehouseId },
            orderBy: { created_at: 'desc' }
        });
    }

    async getById(id) {
        return await prisma.stock_movements.findUnique({
            where: { id },
            include: { warehouse: true }
        });
    }
}

export default new StockMovementDAO();
