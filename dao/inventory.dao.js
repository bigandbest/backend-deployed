import prisma from "../config/prisma.js";

/**
 * Inventory DAO - Production-level inventory management
 * Handles stock tracking through inventory table with performance optimizations
 */
class InventoryDAO {
    /**
     * Get stock information for multiple variant IDs (batch operation)
     * @param {Array<string>} variantIds - Array of variant UUIDs
     * @param {number} warehouseId - Optional warehouse filter
     * @returns {Map<string, Object>} Map of variantId -> stock info
     */
    async getStockByVariantIds(variantIds, warehouseId = null) {
        if (!variantIds || variantIds.length === 0) {
            return new Map();
        }

        // Single optimized query instead of batching
        // Supabase connection pooler handles large IN clauses efficiently
        const where = {
            variant_id: { in: variantIds.slice(0, 1000) }, // Safety limit
        };

        if (warehouseId) {
            if (Array.isArray(warehouseId)) {
                where.warehouse_id = { in: warehouseId };
            } else {
                where.warehouse_id = warehouseId;
            }
        }

        // Use product_warehouse_stock instead of inventory
        const allResults = await prisma.product_warehouse_stock.findMany({
            where,
            select: {
                variant_id: true,
                stock_quantity: true,
                reserved_quantity: true,
                warehouse_id: true,
                warehouses: {
                    select: {
                        id: true,
                        name: true,
                        type: true,
                    },
                },
            },
        });

        // Aggregate results by variant
        const stockMap = new Map();
        allResults.forEach((inv) => {
            // Map fields from new schema
            const stockQty = inv.stock_quantity || 0;
            const reservedQty = inv.reserved_quantity || 0;
            const availableStock = stockQty - reservedQty;
            const warehouse = inv.warehouses;

            if (stockMap.has(inv.variant_id)) {
                // Aggregate stock across warehouses
                const existing = stockMap.get(inv.variant_id);
                existing.total_stock += stockQty;
                existing.available_stock += availableStock;
                if (warehouse) {
                    existing.warehouses.push({
                        warehouse_id: inv.warehouse_id,
                        warehouse_name: warehouse.name,
                        warehouse_type: warehouse.type,
                        stock: availableStock,
                    });
                }
            } else {
                stockMap.set(inv.variant_id, {
                    variant_id: inv.variant_id,
                    total_stock: stockQty,
                    available_stock: availableStock,
                    in_stock: availableStock > 0,
                    low_stock: availableStock > 0 && availableStock < 10,
                    warehouses: warehouse ? [
                        {
                            warehouse_id: inv.warehouse_id,
                            warehouse_name: warehouse.name,
                            warehouse_type: warehouse.type,
                            stock: availableStock,
                        },
                    ] : [],
                });
            }
        });

        return stockMap;
    }

    /**
     * Get available stock for a single variant
     * @param {string} variantId - Variant UUID
     * @param {number} warehouseId - Optional warehouse filter
     * @returns {Object} Stock information
     */
    async getAvailableStock(variantId, warehouseId = null) {
        const stockMap = await this.getStockByVariantIds([variantId], warehouseId);
        return stockMap.get(variantId) || {
            variant_id: variantId,
            total_stock: 0,
            available_stock: 0,
            in_stock: false,
            low_stock: false,
            warehouses: [],
        };
    }

    /**
     * Check availability for multiple items (for cart validation)
     * @param {Array<{variant_id: string, quantity: number}>} items
     * @param {number} warehouseId - Optional warehouse filter
     * @returns {Array<{variant_id, available, requested, can_fulfill}>}
     */
    async checkBulkAvailability(items, warehouseId = null) {
        const variantIds = items.map((item) => item.variant_id);
        const stockMap = await this.getStockByVariantIds(variantIds, warehouseId);

        return items.map((item) => {
            const stock = stockMap.get(item.variant_id);
            const availableStock = stock?.available_stock || 0;

            return {
                variant_id: item.variant_id,
                requested_quantity: item.quantity,
                available_stock: availableStock,
                can_fulfill: availableStock >= item.quantity,
                in_stock: availableStock > 0,
            };
        });
    }

    /**
     * Reserve stock for order processing
     * @param {string} variantId - Variant UUID
     * @param {number} quantity - Quantity to reserve
     * @param {number} warehouseId - Warehouse ID
     * @returns {Object} Updated inventory record
     */
    async reserveStock(variantId, quantity, warehouseId) {
        // Use transaction to ensure atomicity
        return await prisma.$transaction(async (tx) => {
            // Get current inventory with lock
            const inventory = await tx.inventory.findUnique({
                where: {
                    variant_id_warehouse_id: {
                        variant_id: variantId,
                        warehouse_id: warehouseId,
                    },
                },
            });

            if (!inventory) {
                throw new Error("Inventory record not found");
            }

            const availableStock = inventory.stock_qty - (inventory.reserved_qty || 0);
            if (availableStock < quantity) {
                throw new Error("Insufficient stock available");
            }

            // Update reserved quantity
            return await tx.inventory.update({
                where: {
                    variant_id_warehouse_id: {
                        variant_id: variantId,
                        warehouse_id: warehouseId,
                    },
                },
                data: {
                    reserved_qty: (inventory.reserved_qty || 0) + quantity,
                },
            });
        });
    }

    /**
     * Release reserved stock (e.g., when order is cancelled)
     * @param {string} variantId - Variant UUID
     * @param {number} quantity - Quantity to release
     * @param {number} warehouseId - Warehouse ID
     * @returns {Object} Updated inventory record
     */
    async releaseStock(variantId, quantity, warehouseId) {
        return await prisma.inventory.update({
            where: {
                variant_id_warehouse_id: {
                    variant_id: variantId,
                    warehouse_id: warehouseId,
                },
            },
            data: {
                reserved_qty: {
                    decrement: quantity,
                },
            },
        });
    }

    /**
     * Update stock quantity (for admin/warehouse operations)
     * @param {string} variantId - Variant UUID
     * @param {number} warehouseId - Warehouse ID
     * @param {number} newQuantity - New stock quantity
     * @returns {Object} Updated inventory record
     */
    async updateStock(variantId, warehouseId, newQuantity) {
        return await prisma.inventory.upsert({
            where: {
                variant_id_warehouse_id: {
                    variant_id: variantId,
                    warehouse_id: warehouseId,
                },
            },
            update: {
                stock_qty: newQuantity,
                updated_at: new Date(),
            },
            create: {
                variant_id: variantId,
                warehouse_id: warehouseId,
                stock_qty: newQuantity,
                reserved_qty: 0,
            },
        });
    }

    /**
     * Get low stock items (for alerts/reporting)
     * @param {number} threshold - Stock threshold (default: 10)
     * @param {number} warehouseId - Optional warehouse filter
     * @returns {Array} Low stock items
     */
    async getLowStockItems(threshold = 10, warehouseId = null) {
        const where = {
            stock_qty: {
                gt: 0,
                lte: threshold,
            },
        };

        if (warehouseId) {
            where.warehouse_id = warehouseId;
        }

        return await prisma.inventory.findMany({
            where,
            include: {
                variant: {
                    include: {
                        product: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                    },
                },
                warehouse: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
            orderBy: {
                stock_qty: 'asc',
            },
        });
    }

    // Legacy methods for backward compatibility
    async getByVariant(variantId) {
        return await prisma.inventory.findFirst({
            where: { variant_id: variantId },
            include: { warehouse: true },
        });
    }

    async create(data) {
        return await prisma.inventory.create({ data });
    }

    async listByWarehouse(warehouseId) {
        return await prisma.inventory.findMany({
            where: { warehouse_id: warehouseId },
            include: { variant: true },
        });
    }
}

export default new InventoryDAO();
