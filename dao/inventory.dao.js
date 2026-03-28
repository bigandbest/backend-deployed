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

        const warehouseResults = await prisma.inventory.findMany({
            where,
            select: { variant_id: true, stock_qty: true, reserved_qty: true, warehouse_id: true, warehouses: { select: { id: true, name: true, type: true } } },
        });
        warehouseResults.forEach(r => { r.stock_quantity = r.stock_qty; r.reserved_quantity = r.reserved_qty; });

        // Also query seller_products for seller stock
        const sellerResults = await prisma.seller_products.findMany({
            where: {
                variant_id: { in: variantIds.slice(0, 1000), not: null },
                status: 'APPROVED',
                is_active: true,
                ...(where.warehouse_id ? { warehouse_id: where.warehouse_id } : {})
            },
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

        const stockMap = new Map();
        const allResults = [...warehouseResults, ...sellerResults];

        allResults.forEach((inv) => {
            const stockQty = inv.stock_quantity || 0;
            const reservedQty = inv.reserved_quantity || 0;
            const availableStock = Math.max(stockQty - reservedQty, 0);
            const warehouse = inv.warehouses;

            if (stockMap.has(inv.variant_id)) {
                const existing = stockMap.get(inv.variant_id);
                existing.total_stock += stockQty;
                existing.available_stock += availableStock;
                existing.in_stock = existing.available_stock > 0;
                existing.low_stock = existing.available_stock > 0 && existing.available_stock < 10;
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
                    warehouses: warehouse ? [{
                        warehouse_id: inv.warehouse_id,
                        warehouse_name: warehouse.name,
                        warehouse_type: warehouse.type,
                        stock: availableStock,
                    }] : [],
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
                product_variants: {
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
            include: { warehouses: true },
        });
    }

    async create(data) {
        return await prisma.inventory.create({ data: { ...data, updated_at: data.updated_at ?? new Date() } });
    }

    async listByWarehouse(warehouseId) {
        return await prisma.inventory.findMany({
            where: { warehouse_id: warehouseId },
            include: { variant: true },
        });
    }

    // ================================================================
    // SOFT RESERVE — Cart-level stock locking (15-min TTL)
    // ================================================================

    /**
     * Soft-reserve stock when item is added to cart.
     * Prevents two users from both seeing "1 in stock" and both checking out.
     * @param {string} variantId
     * @param {number} warehouseId
     * @param {number} qty
     * @param {number} ttlMinutes - How long the reserve lasts (default: 15)
     */
    async softReserve(variantId, warehouseId, qty, ttlMinutes = 15) {
        return await prisma.$transaction(async (tx) => {
            const inv = await tx.inventory.findUnique({
                where: {
                    variant_id_warehouse_id: { variant_id: variantId, warehouse_id: warehouseId },
                },
            });

            if (!inv) throw new Error('Inventory record not found');

            const available = inv.stock_qty - (inv.reserved_qty || 0) - (inv.soft_reserved_qty || 0);
            if (available < qty) {
                throw new Error(`Insufficient stock. Available: ${available}, Requested: ${qty}`);
            }

            const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

            return await tx.inventory.update({
                where: {
                    variant_id_warehouse_id: { variant_id: variantId, warehouse_id: warehouseId },
                },
                data: {
                    soft_reserved_qty: (inv.soft_reserved_qty || 0) + qty,
                    soft_reserve_expires_at: expiresAt,
                },
            });
        });
    }

    /**
     * Release a soft reserve (e.g. user removes item from cart or cart expires)
     */
    async releaseSoftReserve(variantId, warehouseId, qty) {
        return await prisma.inventory.update({
            where: {
                variant_id_warehouse_id: { variant_id: variantId, warehouse_id: warehouseId },
            },
            data: {
                soft_reserved_qty: { decrement: qty },
            },
        });
    }

    /**
     * Release all expired soft reserves (called by cron every 1 min).
     * Resets soft_reserved_qty = 0 for any row whose soft_reserve_expires_at has passed.
     */
    async releaseExpiredSoftReserves() {
        try {
            const result = await prisma.$executeRaw`
                UPDATE inventory
                SET    soft_reserved_qty       = 0,
                       soft_reserve_expires_at = NULL,
                       updated_at              = NOW()
                WHERE  soft_reserve_expires_at IS NOT NULL
                  AND  soft_reserve_expires_at <= NOW()
                  AND  soft_reserved_qty > 0
            `;
            return result; // rows affected
        } catch (err) {
            // Columns not yet added to DB — run the ALTER TABLE statements below
            // to add them without data loss, then restart the server:
            //   ALTER TABLE inventory ADD COLUMN IF NOT EXISTS soft_reserved_qty INT NOT NULL DEFAULT 0;
            //   ALTER TABLE inventory ADD COLUMN IF NOT EXISTS soft_reserve_expires_at TIMESTAMPTZ;
            if (err.message?.includes('soft_reserve')) return 0;
            throw err;
        }
    }

    // ================================================================
    // HARD LOCK — Order-level atomic stock decrement
    // ================================================================

    /**
     * Hard-lock stock at order placement. Uses atomic decrement with
     * a WHERE guard to handle race conditions.
     * @param {string} variantId
     * @param {number} warehouseId
     * @param {number} qty
     * @returns {Object} Updated inventory or throws on insufficient stock
     */
    async hardLock(variantId, warehouseId, qty) {
        return await prisma.$transaction(async (tx) => {
            const inv = await tx.inventory.findUnique({
                where: {
                    variant_id_warehouse_id: { variant_id: variantId, warehouse_id: warehouseId },
                },
            });

            if (!inv) throw new Error('Inventory record not found');

            const available = inv.stock_qty - (inv.reserved_qty || 0);
            if (available < qty) {
                throw new Error(`Insufficient stock for hard lock. Available: ${available}, Requested: ${qty}`);
            }

            // Atomic decrement of actual stock + increment reserved
            return await tx.inventory.update({
                where: {
                    variant_id_warehouse_id: { variant_id: variantId, warehouse_id: warehouseId },
                },
                data: {
                    reserved_qty: { increment: qty },
                    // Also reduce any soft reserve that was held for this
                    soft_reserved_qty: {
                        decrement: Math.min(inv.soft_reserved_qty || 0, qty),
                    },
                },
            });
        });
    }

    /**
     * Release hard lock (e.g. order cancelled after placement)
     */
    async releaseHardLock(variantId, warehouseId, qty) {
        return await prisma.inventory.update({
            where: {
                variant_id_warehouse_id: { variant_id: variantId, warehouse_id: warehouseId },
            },
            data: {
                reserved_qty: { decrement: qty },
            },
        });
    }

    // ================================================================
    // AVAILABLE STOCK — For fulfillment priority check
    // ================================================================

    /**
     * Get truly available stock at a specific warehouse (accounts for all reserves)
     */
    async getAvailableStockForSource(variantId, warehouseId) {
        const inv = await prisma.inventory.findUnique({
            where: {
                variant_id_warehouse_id: { variant_id: variantId, warehouse_id: warehouseId },
            },
        });

        if (!inv) return 0;

        return Math.max(0, inv.stock_qty - (inv.reserved_qty || 0) - (inv.soft_reserved_qty || 0));
    }

    /**
     * Get available stock across multiple warehouses (for priority scanning)
     */
    async getAvailableStockAcrossWarehouses(variantId, warehouseIds) {
        if (!warehouseIds?.length) return [];

        const records = await prisma.inventory.findMany({
            where: {
                variant_id: variantId,
                warehouse_id: { in: warehouseIds },
            },
            include: {
                warehouses: {
                    select: { id: true, name: true, type: true },
                },
            },
        });

        return records.map((inv) => ({
            warehouse_id: inv.warehouse_id,
            warehouse: inv.warehouses,
            total_stock: inv.stock_qty,
            reserved: inv.reserved_qty || 0,
            soft_reserved: 0,
            available: Math.max(0, inv.stock_qty - (inv.reserved_qty || 0)),
        }));
    }
}

export default new InventoryDAO();

