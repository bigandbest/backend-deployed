import prisma from '../config/prisma.js';

// Helper to safely convert warehouse ID - tries numeric first, then string name
function normalizeWarehouseId(id) {
    if (!id) return null;
    const numericId = parseInt(id, 10);
    return !isNaN(numericId) ? numericId : id; // Return either the number or the original string (name)
}

class WarehouseDAO {
    async create(data) {
        return await prisma.warehouses.create({ data });
    }

    async getById(id) {
        const numericId = parseInt(id, 10);
        // If it's a valid numeric ID, search by ID
        if (!isNaN(numericId)) {
            const warehouse = await prisma.warehouses.findUnique({
                where: { id: numericId },
                include: {
                    parent_warehouse: true,
                    child_warehouses: true,
                    warehouse_zones: { include: { zone: { include: { zone_pincodes: true } } } },
                    warehouse_pincodes: true,
                    scheduling_configs: { include: { slot: true } },
                    warehouse_sellers: {
                        where: { is_active: true },
                        include: { seller: { include: { user: { select: { id: true, name: true, email: true, phone: true } } } } }
                    },
                    warehouse_riders: {
                        where: { is_active: true },
                        include: { rider: { include: { user: { select: { id: true, name: true, email: true, phone: true } } } } }
                    }
                }
            });
            if (warehouse) return warehouse;
        }

        // If ID is not numeric or not found, try searching by name
        return await prisma.warehouses.findUnique({
            where: { name: id },
            include: {
                parent_warehouse: true,
                child_warehouses: true,
                warehouse_zones: { include: { zone: { include: { zone_pincodes: true } } } },
                warehouse_pincodes: true,
                scheduling_configs: { include: { slot: true } },
                warehouse_sellers: {
                    where: { is_active: true },
                    include: { seller: { include: { user: { select: { id: true, name: true, email: true, phone: true } } } } }
                },
                warehouse_riders: {
                    where: { is_active: true },
                    include: { rider: { include: { user: { select: { id: true, name: true, email: true, phone: true } } } } }
                }
            }
        });
    }

    async getByName(name) {
        return await prisma.warehouses.findUnique({
            where: { name }
        });
    }

    async list(filters = {}) {
        const { active = true, type } = filters;
        return await prisma.warehouses.findMany({
            where: {
                ...(active !== undefined && { is_active: active }),
                ...(type && { type })
            },
            orderBy: { name: 'asc' }
        });
    }

    async getHierarchy() {
        return await prisma.warehouses.findMany({
            where: { hierarchy_level: 0 },
            include: {
                child_warehouses: {
                    include: {
                        child_warehouses: true
                    }
                }
            }
        });
    }

    async update(id, data) {
        const warehouseId = normalizeWarehouseId(id);
        // Build where clause that works with both numeric ID and string name
        const where = typeof warehouseId === 'number'
            ? { id: warehouseId }
            : { name: warehouseId };

        return await prisma.warehouses.update({
            where,
            data: {
                ...data,
                updated_at: new Date()
            }
        });
    }

    async createWithRelations(data, relations) {
        const { zone_ids, pincode_assignments, seller_ids, rider_ids } = relations;
        return await prisma.$transaction(async (tx) => {
            const warehouse = await tx.warehouses.create({ data });

            if (data.type === 'zonal' && zone_ids?.length) {
                await tx.warehouse_zones.createMany({
                    data: zone_ids.map(zid => ({
                        warehouse_id: warehouse.id,
                        zone_id: Number(zid),
                        priority: 1,
                        is_active: true
                    }))
                });
            } else if (data.type === 'division' && pincode_assignments?.length) {
                await tx.warehouse_pincodes.createMany({
                    data: pincode_assignments.map(pa => ({
                        warehouse_id: warehouse.id,
                        pincode: pa.pincode,
                        city: pa.city,
                        state: pa.state,
                        is_active: true
                    }))
                });
            }

            // Assign sellers to division warehouse
            if (data.type === 'division' && seller_ids?.length) {
                await tx.warehouse_sellers.createMany({
                    data: seller_ids.map(sid => ({
                        warehouse_id: warehouse.id,
                        seller_id: sid,
                        is_active: true
                    })),
                    skipDuplicates: true
                });
            }

            // Assign riders to division warehouse
            if (data.type === 'division' && rider_ids?.length) {
                await tx.warehouse_riders.createMany({
                    data: rider_ids.map(rid => ({
                        warehouse_id: warehouse.id,
                        rider_id: rid,
                        is_active: true
                    })),
                    skipDuplicates: true
                });
            }

            return warehouse;
        });
    }

    async updateWithRelations(id, data, relations) {
        const numericId = parseInt(id, 10);
        if (isNaN(numericId)) {
            throw new Error('Invalid warehouse ID');
        }
        const { zone_ids, pincode_assignments, seller_ids, rider_ids } = relations;
        return await prisma.$transaction(async (tx) => {
            const warehouse = await tx.warehouses.update({
                where: { id: numericId },
                data: { ...data, updated_at: new Date() }
            });

            if (data.type === 'zonal' && zone_ids) {
                await tx.warehouse_zones.deleteMany({ where: { warehouse_id: numericId } });
                if (zone_ids.length > 0) {
                    await tx.warehouse_zones.createMany({
                        data: zone_ids.map(zid => ({
                            warehouse_id: numericId,
                            zone_id: Number(zid),
                            priority: 1,
                            is_active: true
                        }))
                    });
                }
            } else if (data.type === 'division' && pincode_assignments) {
                await tx.warehouse_pincodes.deleteMany({ where: { warehouse_id: numericId } });
                if (pincode_assignments.length > 0) {
                    await tx.warehouse_pincodes.createMany({
                        data: pincode_assignments.map(pa => ({
                            warehouse_id: numericId,
                            pincode: pa.pincode,
                            city: pa.city,
                            state: pa.state,
                            is_active: true
                        }))
                    });
                }
            }

            // Update seller assignments for division warehouses
            if (data.type === 'division' && seller_ids !== undefined) {
                await tx.warehouse_sellers.deleteMany({ where: { warehouse_id: numericId } });
                if (seller_ids?.length > 0) {
                    await tx.warehouse_sellers.createMany({
                        data: seller_ids.map(sid => ({
                            warehouse_id: numericId,
                            seller_id: sid,
                            is_active: true
                        })),
                        skipDuplicates: true
                    });
                }
            }

            // Update rider assignments for division warehouses
            if (data.type === 'division' && rider_ids !== undefined) {
                await tx.warehouse_riders.deleteMany({ where: { warehouse_id: numericId } });
                if (rider_ids?.length > 0) {
                    await tx.warehouse_riders.createMany({
                        data: rider_ids.map(rid => ({
                            warehouse_id: numericId,
                            rider_id: rid,
                            is_active: true
                        })),
                        skipDuplicates: true
                    });
                }
            }

            return warehouse;
        });
    }

    async delete(id) {
        const warehouseId = normalizeWarehouseId(id);
        // Build where clause that works with both numeric ID and string name
        const where = typeof warehouseId === 'number'
            ? { id: warehouseId }
            : { name: warehouseId };

        return await prisma.warehouses.delete({
            where
        });
    }

    async getProductStock(warehouseId, productId, variantId = null) {
        const numericId = parseInt(warehouseId, 10);
        if (isNaN(numericId)) {
            throw new Error('Invalid warehouse ID');
        }
        const where = {
            warehouse_id: numericId,
            product_id: productId
        };
        if (variantId) where.variant_id = variantId;
        else where.variant_id = null; // Explicitly check for null variant_id for base products

        return await prisma.product_warehouse_stock.findFirst({
            where,
            include: {
                products: true,
                product_variants: true
            }
        });
    }

    async updateProductStock(warehouseId, productId, variantId, data) {
        const numericId = parseInt(warehouseId, 10);
        if (isNaN(numericId)) {
            throw new Error('Invalid warehouse ID');
        }

        return await prisma.inventory.upsert({
            where: {
                variant_id_warehouse_id: {
                    variant_id: variantId,
                    warehouse_id: numericId
                }
            },
            update: {
                stock_qty: parseInt(data.stock_quantity) || 0,
                bulk_stock_threshold: parseInt(data.minimum_threshold) || 0,
                updated_at: new Date()
            },
            create: {
                variant_id: variantId,
                warehouse_id: numericId,
                stock_qty: parseInt(data.stock_quantity) || 0,
                bulk_stock_threshold: parseInt(data.minimum_threshold) || 0,
            }
        });
    }

    async deleteProductStock(warehouseId, productId) {
        const numericId = parseInt(warehouseId, 10);
        if (isNaN(numericId)) {
            throw new Error('Invalid warehouse ID');
        }

        // Find all variants for this product
        const variants = await prisma.product_variants.findMany({
            where: { product_id: productId },
            select: { id: true }
        });

        const variantIds = variants.map(v => v.id);

        // Delete inventory records for these variants in this warehouse
        return await prisma.inventory.deleteMany({
            where: {
                warehouse_id: numericId,
                variant_id: { in: variantIds }
            }
        });
    }

    async findForOrder(pincode, productType, preferredWarehouseId) {
        // Call the PostgreSQL function directly via Prisma
        // function find_warehouse_for_order(customer_pincode text, product_type text, preferred_warehouse_id int)
        return await prisma.$queryRaw`
            SELECT * FROM find_warehouse_for_order(${pincode}, ${productType}, ${preferredWarehouseId})
        `;
    }

    async addPincodes(warehouseId, pincodeDataList) {
        const numericId = parseInt(warehouseId, 10);
        if (isNaN(numericId)) {
            throw new Error('Invalid warehouse ID');
        }
        return await prisma.warehouse_pincodes.createMany({
            data: pincodeDataList.map(p => ({
                warehouse_id: numericId,
                ...p,
                is_active: true
            })),
            skipDuplicates: true
        });
    }

    async removePincode(warehouseId, pincode) {
        const numericId = parseInt(warehouseId, 10);
        if (isNaN(numericId)) {
            throw new Error('Invalid warehouse ID');
        }
        return await prisma.warehouse_pincodes.deleteMany({
            where: {
                warehouse_id: numericId,
                pincode: pincode
            }
        });
    }

    async updatePincode(warehouseId, pincode, data) {
        const numericId = parseInt(warehouseId, 10);
        if (isNaN(numericId)) {
            throw new Error('Invalid warehouse ID');
        }
        // updateMany used because pincode is not unique ID, but combination with warehouse_id makes it unique
        return await prisma.warehouse_pincodes.updateMany({
            where: {
                warehouse_id: numericId,
                pincode: pincode
            },
            data: {
                ...data,
                updated_at: new Date()
            }
        });
    }

    async getPincodes(warehouseId) {
        const numericId = parseInt(warehouseId, 10);
        if (isNaN(numericId)) {
            throw new Error('Invalid warehouse ID');
        }
        return await prisma.warehouse_pincodes.findMany({
            where: { warehouse_id: numericId, is_active: true },
            orderBy: { pincode: 'asc' }
        });
    }

    async listStocks(warehouseId) {
        const numericId = parseInt(warehouseId, 10);
        if (isNaN(numericId)) {
            throw new Error('Invalid warehouse ID');
        }
        return await prisma.inventory.findMany({
            where: { warehouse_id: numericId },
            include: {
                variant: {
                    include: {
                        product: true
                    }
                }
            }
        });
    }

    async upsertSchedulingConfig(warehouseId, data) {
        const numericId = parseInt(warehouseId, 10);
        if (isNaN(numericId)) {
            throw new Error('Invalid warehouse ID');
        }
        // Check existence
        const existing = await prisma.warehouse_scheduling_config.findFirst({
            where: { warehouse_id: numericId }
        });

        if (existing) {
            return await prisma.warehouse_scheduling_config.update({
                where: { id: existing.id },
                data: { ...data, updated_at: new Date() }
            });
        } else {
            return await prisma.warehouse_scheduling_config.create({
                data: { ...data, warehouse_id: warehouseId }
            });
        }
    }

    async getSchedulingConfig(warehouseId) {
        const numericId = parseInt(warehouseId, 10);
        if (isNaN(numericId)) {
            throw new Error('Invalid warehouse ID');
        }
        return await prisma.warehouse_scheduling_config.findFirst({
            where: { warehouse_id: numericId },
            include: { slot: true }
        });
    }

    // ======= Seller Assignment Methods =======
    async assignSellers(warehouseId, sellerIds) {
        const numericId = parseInt(warehouseId, 10);
        if (isNaN(numericId)) throw new Error('Invalid warehouse ID');
        return await prisma.warehouse_sellers.createMany({
            data: sellerIds.map(sid => ({
                warehouse_id: numericId,
                seller_id: sid,
                is_active: true
            })),
            skipDuplicates: true
        });
    }

    async removeSeller(warehouseId, sellerId) {
        const numericId = parseInt(warehouseId, 10);
        if (isNaN(numericId)) throw new Error('Invalid warehouse ID');
        return await prisma.warehouse_sellers.deleteMany({
            where: { warehouse_id: numericId, seller_id: sellerId }
        });
    }

    async getWarehouseSellers(warehouseId) {
        const numericId = parseInt(warehouseId, 10);
        if (isNaN(numericId)) throw new Error('Invalid warehouse ID');
        return await prisma.warehouse_sellers.findMany({
            where: { warehouse_id: numericId, is_active: true },
            include: {
                seller: {
                    include: { user: { select: { id: true, name: true, email: true, phone: true } } }
                }
            }
        });
    }

    // ======= Rider Assignment Methods =======
    async assignRiders(warehouseId, riderIds) {
        const numericId = parseInt(warehouseId, 10);
        if (isNaN(numericId)) throw new Error('Invalid warehouse ID');
        return await prisma.warehouse_riders.createMany({
            data: riderIds.map(rid => ({
                warehouse_id: numericId,
                rider_id: rid,
                is_active: true
            })),
            skipDuplicates: true
        });
    }

    async removeRider(warehouseId, riderId) {
        const numericId = parseInt(warehouseId, 10);
        if (isNaN(numericId)) throw new Error('Invalid warehouse ID');
        return await prisma.warehouse_riders.deleteMany({
            where: { warehouse_id: numericId, rider_id: riderId }
        });
    }

    async getWarehouseRiders(warehouseId) {
        const numericId = parseInt(warehouseId, 10);
        if (isNaN(numericId)) throw new Error('Invalid warehouse ID');
        return await prisma.warehouse_riders.findMany({
            where: { warehouse_id: numericId, is_active: true },
            include: {
                rider: {
                    include: { user: { select: { id: true, name: true, email: true, phone: true } } }
                }
            }
        });
    }
}

export default new WarehouseDAO();
