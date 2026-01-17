import prisma from '../config/prisma.js';

class ProductWarehouseStockDAO {
    async getZonalStock(productId, zoneId, quantity = 1) {
        return await prisma.product_warehouse_stock.findFirst({
            where: {
                product_id: productId,
                is_active: true,
                warehouse_zones: {
                    some: {
                        zone_id: zoneId
                    }
                },
                warehouses: {
                    type: 'zonal',
                    is_active: true
                },
                stock_quantity: {
                    gte: quantity
                }
            },
            include: {
                warehouses: true
            },
            orderBy: {
                stock_quantity: 'desc'
            }
        });
    }

    async getCentralStock(productId, quantity = 1) {
        return await prisma.product_warehouse_stock.findFirst({
            where: {
                product_id: productId,
                is_active: true,
                warehouses: {
                    type: 'central',
                    is_active: true
                },
                stock_quantity: {
                    gte: quantity
                }
            },
            include: {
                warehouses: true
            },
            orderBy: {
                stock_quantity: 'desc'
            }
        });
    }

    async reserveStock(productId, warehouseId, quantity, orderId) {
        return await prisma.$executeRaw`
            SELECT update_stock_with_movement(
                ${productId}::uuid,
                ${warehouseId}::integer,
                'reservation'::text,
                ${quantity}::integer,
                'order'::text,
                ${orderId}::text,
                ${`Stock reserved for order ${orderId}`}::text
            )
        `;
    }

    async confirmStockDeduction(productId, warehouseId, quantity, orderId) {
        return await prisma.$transaction(async (tx) => {
            // First release the reservation
            await tx.$executeRaw`
                SELECT update_stock_with_movement(
                    ${productId}::uuid,
                    ${warehouseId}::integer,
                    'release'::text,
                    ${quantity}::integer,
                    'order'::text,
                    ${orderId}::text,
                    ${`Release reservation for order ${orderId}`}::text
                )
            `;

            // Then deduct actual stock
            return await tx.$executeRaw`
                SELECT update_stock_with_movement(
                    ${productId}::uuid,
                    ${warehouseId}::integer,
                    'outbound'::text,
                    ${quantity}::integer,
                    'order'::text,
                    ${orderId}::text,
                    ${`Order fulfillment for order ${orderId}`}::text
                )
            `;
        });
    }

    async getByProductAndWarehouse(productId, warehouseId) {
        return await prisma.product_warehouse_stock.findFirst({
            where: {
                product_id: productId,
                warehouse_id: warehouseId,
                variant_id: null // Assuming product-level stock if variant_id is null
            }
        });
    }

    async getByVariantAndWarehouse(variantId, warehouseId) {
        return await prisma.product_warehouse_stock.findFirst({
            where: {
                variant_id: variantId,
                warehouse_id: warehouseId
            }
        });
    }

    async upsertStock(productId, warehouseId, stockData) {
        const existing = await this.getByProductAndWarehouse(productId, warehouseId);

        if (existing) {
            return await prisma.product_warehouse_stock.update({
                where: { id: existing.id },
                data: {
                    ...stockData,
                    updated_at: new Date()
                }
            });
        } else {
            return await prisma.product_warehouse_stock.create({
                data: {
                    product_id: productId,
                    warehouse_id: warehouseId,
                    ...stockData
                }
            });
        }
    }

    async listByProduct(productId) {
        return await prisma.product_warehouse_stock.findMany({
            where: { product_id: productId },
            include: { warehouses: true }
        });
    }

    async listByVariant(variantId) {
        return await prisma.product_warehouse_stock.findMany({
            where: { variant_id: variantId, is_active: true },
            include: { warehouses: true }
        });
    }

    async upsertVariantStock(productId, variantId, warehouseId, stockData) {
        const existing = await this.getByVariantAndWarehouse(variantId, warehouseId);

        if (existing) {
            return await prisma.product_warehouse_stock.update({
                where: { id: existing.id },
                data: {
                    ...stockData,
                    updated_at: new Date()
                }
            });
        } else {
            return await prisma.product_warehouse_stock.create({
                data: {
                    product_id: productId,
                    variant_id: variantId,
                    warehouse_id: warehouseId,
                    ...stockData
                }
            });
        }
    }

    async createMany(records) {
        return await prisma.product_warehouse_stock.createMany({
            data: records
        });
    }

    async listByWarehouses(warehouseIds) {
        return await prisma.product_warehouse_stock.findMany({
            where: {
                warehouse_id: { in: warehouseIds },
                is_active: true
            },
            include: {
                products: {
                    select: {
                        id: true,
                        name: true,
                        price: true,
                        image: true,
                        delivery_type: true
                    }
                },
                warehouses: {
                    select: {
                        id: true,
                        name: true,
                        type: true,
                        parent_warehouse_id: true
                    }
                }
            }
        });
    }

    async getByProductAndWarehouseWithDetails(productId, warehouseId) {
        return await prisma.product_warehouse_stock.findFirst({
            where: {
                product_id: productId,
                warehouse_id: warehouseId,
                is_active: true
            },
            include: {
                warehouses: true
            }
        });
    }

    async updateStock(id, data) {
        return await prisma.product_warehouse_stock.update({
            where: { id },
            data: {
                ...data,
                updated_at: new Date()
            }
        });
    }
}

export default new ProductWarehouseStockDAO();
