import prismaConfig from '../config/prisma.js';

class ProductWarehouseStockDAO {
    constructor(db) {
        this.db = db;
    }

    async getZonalStock(productId, zoneId, quantity = 1) {
        return await this.db.product_warehouse_stock.findFirst({
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
        return await this.db.product_warehouse_stock.findFirst({
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
        return await this.db.$executeRaw`
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
        return await this.db.$transaction(async (tx) => {
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
        return await this.db.product_warehouse_stock.findFirst({
            where: {
                product_id: productId,
                warehouse_id: warehouseId,
                variant_id: null // Assuming product-level stock if variant_id is null
            }
        });
    }

    async getByVariantAndWarehouse(variantId, warehouseId) {
        return await this.db.product_warehouse_stock.findFirst({
            where: {
                variant_id: variantId,
                warehouse_id: warehouseId
            }
        });
    }

    async upsertStock(productId, warehouseId, stockData) {
        const existing = await this.getByProductAndWarehouse(productId, warehouseId);

        if (existing) {
            return await this.db.product_warehouse_stock.update({
                where: { id: existing.id },
                data: {
                    ...stockData,
                    updated_at: new Date()
                }
            });
        } else {
            // UPDATE-ONLY: Do not create new records, only update existing ones
            throw new Error(`No existing stock record found for product ${productId} in warehouse ${warehouseId}. Stock records must be created before updating.`);
        }
    }

    async listByProduct(productId) {
        return await this.db.product_warehouse_stock.findMany({
            where: { product_id: productId },
            include: { warehouses: true }
        });
    }

    async listByVariant(variantId) {
        return await this.db.product_warehouse_stock.findMany({
            where: { variant_id: variantId, is_active: true },
            include: { warehouses: true }
        });
    }

    async upsertVariantStock(productId, variantId, warehouseId, stockData) {
        const existing = await this.getByVariantAndWarehouse(variantId, warehouseId);

        if (existing) {
            return await this.db.product_warehouse_stock.update({
                where: { id: existing.id },
                data: {
                    ...stockData,
                    updated_at: new Date()
                }
            });
        } else {
            // UPDATE-ONLY: Do not create new records, only update existing ones
            throw new Error(`No existing stock record found for variant ${variantId} in warehouse ${warehouseId}. Stock records must be created before updating.`);
        }
    }

    async createMany(records) {
        return await this.db.product_warehouse_stock.createMany({
            data: records
        });
    }

    async listByWarehouses(warehouseIds) {
        return await this.db.product_warehouse_stock.findMany({
            where: {
                warehouse_id: { in: warehouseIds },
                is_active: true
            },
            include: {
                products: {
                    select: {
                        id: true,
                        name: true,
                        images: true
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
        return await this.db.product_warehouse_stock.findFirst({
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
        return await this.db.product_warehouse_stock.update({
            where: { id },
            data: {
                ...data,
                updated_at: new Date()
            }
        });
    }
    async listProductsInWarehouse(warehouseId) {
        return await this.db.product_warehouse_stock.findMany({
            where: {
                warehouse_id: parseInt(warehouseId),
                is_active: true
            },
            include: {
                products: {
                    select: {
                        id: true,
                        name: true,
                        rating: true,
                        images: true,
                        category: {
                            select: {
                                id: true,
                                name: true
                            }
                        }
                    }
                }
            }
        });
    }

    async listByProducts(productIds) {
        // Get all warehouse stock assignments for given product IDs
        return await this.db.product_warehouse_stock.findMany({
            where: {
                product_id: {
                    in: productIds
                },
                is_active: true
            },
            include: {
                warehouses: {
                    select: {
                        id: true,
                        name: true,
                        type: true
                    }
                },
                product_variants: {
                    select: {
                        id: true,
                        title: true,
                        sku: true
                    }
                }
            }
        });
    }
}

export default new ProductWarehouseStockDAO(prismaConfig);
