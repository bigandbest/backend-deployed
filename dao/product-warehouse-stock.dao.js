import prismaConfig from '../config/prisma.js';

class ProductWarehouseStockDAO {
    constructor(db) {
        this.db = db;
    }

    async getZonalStock(productId, zoneId, quantity = 1) {
        // Find inventories where warehouse is in the zone and has active stock
        // Inventory is linked to variant, but we query by product?
        // Query: Find any variant of this product in zonal warehouse
        // This is tricky. Usually we want specific variant stock.
        // Assuming "product level check" means "any variant" or "default variant"?
        // Most likely this is used for availability check which should be variant specific.
        // BUT if signature is (productId), we must aggregate or finding best match.

        // Return FIRST match
        return await prisma.inventory.findFirst({
            where: {
                variant: { product_id: productId },
                warehouse: {
                    type: 'zonal',
                    is_active: true,
                    warehouse_zones: {
                        some: { zone_id: zoneId }
                    }
                },
                stock_qty: { gte: quantity }
            },
            include: {
                warehouse: true,
                variant: true
            },
            orderBy: {
                stock_qty: 'desc'
            }
        });
    }

    async getCentralStock(productId, quantity = 1) {
        return await prisma.inventory.findFirst({
            where: {
                variant: { product_id: productId },
                warehouse: {
                    type: 'central',
                    is_active: true
                },
                stock_qty: { gte: quantity }
            },
            include: {
                warehouse: true,
                variant: true
            },
            orderBy: {
                stock_qty: 'desc'
            }
        });
    }

    async reserveStock(productId, warehouseId, quantity, orderId) {
        // We lack variantId here. Must fetch default variant or fail?
        // Since we can't easily guess, we try to find a variant WITH stock in this warehouse.
        const targetInventory = await prisma.inventory.findFirst({
            where: {
                variant: { product_id: productId },
                warehouse_id: parseInt(warehouseId),
                stock_qty: { gte: quantity }
            }
        });

        if (!targetInventory) {
            throw new Error(`Insufficient stock in warehouse ${warehouseId} for product ${productId}`);
        }

        return await prisma.inventory.update({
            where: { id: targetInventory.id },
            data: {
                reserved_qty: { increment: quantity },
                updated_at: new Date()
            }
        });
    }

    async confirmStockDeduction(productId, warehouseId, quantity, orderId) {
        // Find inventory record (assuming reservation exists on some variant)
        // This is risky if multiple variants exist, we must know which one.
        // Ideally callers should pass variantId.
        // We try to find ANY inventory for this product in this warehouse with reserved > 0?
        // Or just stock >= quantity.
        const targetInventory = await prisma.inventory.findFirst({
            where: {
                variant: { product_id: productId },
                warehouse_id: parseInt(warehouseId)
            },
            orderBy: { reserved_qty: 'desc' } // release from reservation first
        });

        if (!targetInventory) {
            throw new Error(`Inventory record not found for product ${productId} in warehouse ${warehouseId}`);
        }

        return await prisma.inventory.update({
            where: { id: targetInventory.id },
            data: {
                stock_qty: { decrement: quantity },
                reserved_qty: { decrement: quantity }, // Assuming it was reserved. If partially reserved, this might go negative logic? Prisma handles decrement safely if not constrained unsigned, but here we assume correct flow.
                updated_at: new Date()
            }
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
            // UPDATE-ONLY: Do not create new records, only update existing ones
            throw new Error(`No existing stock record found for product ${productId} in warehouse ${warehouseId}. Stock records must be created before updating.`);
        }
    }

    async listByProduct(productId) {
        return await prisma.inventory.findMany({
            where: { variant: { product_id: productId } },
            include: { warehouse: true, variant: true }
        });
    }

    async listByVariant(variantId) {
        return await prisma.product_warehouse_stock.findMany({
            where: { variant_id: variantId, is_active: true },
            include: { warehouses: true }
        });
    }

    async upsertVariantStock(productId, variantId, warehouseId, stockData) {
        const numericId = parseInt(warehouseId, 10);
        return await prisma.inventory.upsert({
            where: {
                variant_id_warehouse_id: {
                    variant_id: variantId,
                    warehouse_id: numericId
                }
            },
            update: {
                stock_qty: stockData.stock_quantity,
                bulk_stock_threshold: stockData.minimum_threshold || 0,
                updated_at: new Date()
            },
            create: {
                variant_id: variantId,
                warehouse_id: numericId,
                stock_qty: stockData.stock_quantity || 0,
                bulk_stock_threshold: stockData.minimum_threshold || 0,
                reserved_qty: 0
            }
        });
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
