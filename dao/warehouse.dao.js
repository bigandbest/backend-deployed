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
                    warehouse_zones: { include: { zone: true } },
                    warehouse_pincodes: true,
                    scheduling_configs: { include: { slot: true } }
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
                warehouse_zones: { include: { zone: true } },
                warehouse_pincodes: true,
                scheduling_configs: { include: { slot: true } }
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
        const { zone_ids, pincode_assignments } = relations;
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
            return warehouse;
        });
    }

    async updateWithRelations(id, data, relations) {
        const numericId = parseInt(id, 10);
        if (isNaN(numericId)) {
            throw new Error('Invalid warehouse ID');
        }
        const { zone_ids, pincode_assignments } = relations;
        return await prisma.$transaction(async (tx) => {
            const warehouse = await tx.warehouses.update({
                where: { id: numericId },
                data: { ...data, updated_at: new Date() }
            });

            if (data.type === 'zonal' && zone_ids) { // Only update if provided
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

        // If variantId is provided, query by it directly
        if (variantId) {
            return await prisma.inventory.findUnique({
                where: {
                    variant_id_warehouse_id: {
                        variant_id: variantId,
                        warehouse_id: numericId
                    }
                },
                include: {
                    variant: {
                        include: {
                            product: true
                        }
                    }
                }
            });
        }

        // If only productId, we might need to find specific stock? 
        // But inventory is variant-centric. 
        // Logic needing product-level stock usually implies aggregating variants or finding base variant.
        // Returning null or emulating old behavior if necessary.
        return null;
    }

    async updateProductStock(warehouseId, productId, variantId, data) {
        const numericId = parseInt(warehouseId, 10);
        if (isNaN(numericId)) {
            throw new Error('Invalid warehouse ID');
        }

        if (!variantId) {
            throw new Error('Variant ID is required for inventory updates');
        }

        return await prisma.inventory.upsert({
            where: {
                variant_id_warehouse_id: {
                    variant_id: variantId,
                    warehouse_id: numericId
                }
            },
            update: {
                stock_qty: data.stock_quantity,
                // reserved_qty: data.reserved_quantity, // preserved if needed?
                updated_at: new Date()
            },
            create: {
                variant_id: variantId,
                warehouse_id: numericId,
                stock_qty: data.stock_quantity || 0,
                reserved_qty: 0,
                bulk_stock_threshold: data.minimum_threshold || 0
            }
        });
    }

    async deleteProductStock(warehouseId, productId) {
        const numericId = parseInt(warehouseId, 10);
        if (isNaN(numericId)) {
            throw new Error('Invalid warehouse ID');
        }

        // Must find all variants for this product to delete their inventory?
        // Or we rely on cascading delete if product is deleted?
        // The previous logic deleted generic stock record.
        // With inventory linked to variant, we need to delete inventory logic.
        // This function might be deprecated or need to find variants first.

        // For now, let's find variants of the product and delete their inventory for this warehouse
        const variants = await prisma.product_variants.findMany({
            where: { product_id: productId },
            select: { id: true }
        });

        if (variants.length > 0) {
            const variantIds = variants.map(v => v.id);
            return await prisma.inventory.deleteMany({
                where: {
                    warehouse_id: numericId,
                    variant_id: { in: variantIds }
                }
            });
        }
        return { count: 0 };
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
}

export default new WarehouseDAO();
