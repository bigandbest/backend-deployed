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
                    warehouse_zones: {
                        include: {
                            delivery_zones: {
                                include: {
                                    zone_pincodes: true
                                }
                            }
                        }
                    },
                    warehouse_pincodes: true,
                    warehouse_scheduling_config: { include: { scheduling_time_slots: true } }
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
                warehouse_zones: {
                    include: {
                        delivery_zones: {
                            include: {
                                zone_pincodes: true
                            }
                        }
                    }
                },
                warehouse_pincodes: true,
                warehouse_scheduling_config: { include: { scheduling_time_slots: true } }
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
        // Upsert logic
        const where = {
            warehouse_id_product_id_variant_id: {
                warehouse_id: numericId,
                product_id: productId,
                variant_id: variantId || 0 // Assuming 0 or specific value for no variant if constraint requires? 
                // Actually relying on findFirst unique check is safer if schema is unknown.
            }
        };

        // Revised upsert using findFirst for safety
        const existing = await this.getProductStock(numericId, productId, variantId);

        if (existing) {
            return await prisma.product_warehouse_stock.update({
                where: { id: existing.id },
                data: {
                    ...data,
                    last_restocked_at: new Date()
                }
            });
        } else {
            return await prisma.product_warehouse_stock.create({
                data: {
                    warehouse_id: warehouseId,
                    product_id: productId,
                    variant_id: variantId,
                    ...data,
                    last_restocked_at: new Date()
                }
            });
        }
    }

    async deleteProductStock(warehouseId, productId) {
        const numericId = parseInt(warehouseId, 10);
        if (isNaN(numericId)) {
            throw new Error('Invalid warehouse ID');
        }
        // Delete all stock records for this product in this warehouse (base + variants)
        return await prisma.product_warehouse_stock.deleteMany({
            where: {
                warehouse_id: numericId,
                product_id: productId
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
        return await prisma.product_warehouse_stock.findMany({
            where: { warehouse_id: numericId, is_active: true },
            include: {
                products: true,
                product_variants: true
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

    async getWarehouseSellers(warehouseId) {
        const numericId = parseInt(warehouseId, 10);
        if (isNaN(numericId)) {
            throw new Error('Invalid warehouse ID');
        }
        return await prisma.warehouse_sellers.findMany({
            where: { warehouse_id: numericId, is_active: true },
            include: { sellers: { include: { users: true } } }
        });
    }

    async assignSellers(warehouseId, sellerIds) {
        const numericId = parseInt(warehouseId, 10);
        if (isNaN(numericId)) {
            throw new Error('Invalid warehouse ID');
        }
        if (!Array.isArray(sellerIds) || sellerIds.length === 0) {
            throw new Error('seller_ids array is required');
        }

        return await prisma.$transaction(async (tx) => {
            await tx.warehouse_sellers.updateMany({
                where: { warehouse_id: numericId },
                data: { is_active: false }
            });

            const operations = sellerIds.map((sellerId) => {
                const numericSellerId = parseInt(sellerId, 10);
                if (isNaN(numericSellerId)) return null;
                return tx.warehouse_sellers.upsert({
                    where: { warehouse_id_seller_id: { warehouse_id: numericId, seller_id: numericSellerId } },
                    create: { warehouse_id: numericId, seller_id: numericSellerId, is_active: true, assigned_at: new Date() },
                    update: { is_active: true, assigned_at: new Date() }
                });
            }).filter(Boolean);

            return Promise.all(operations);
        });
    }

    async removeSeller(warehouseId, sellerId) {
        const numericWarehouseId = parseInt(warehouseId, 10);
        const numericSellerId = parseInt(sellerId, 10);
        if (isNaN(numericWarehouseId) || isNaN(numericSellerId)) {
            throw new Error('Invalid warehouse ID or seller ID');
        }

        return await prisma.warehouse_sellers.updateMany({
            where: { warehouse_id: numericWarehouseId, seller_id: numericSellerId },
            data: { is_active: false }
        });
    }

    async getWarehouseRiders(warehouseId) {
        const numericId = parseInt(warehouseId, 10);
        if (isNaN(numericId)) {
            throw new Error('Invalid warehouse ID');
        }
        return await prisma.warehouse_riders.findMany({
            where: { warehouse_id: numericId, is_active: true },
            include: { riders: { include: { users: true } } }
        });
    }

    async assignRiders(warehouseId, riderIds) {
        const numericId = parseInt(warehouseId, 10);
        if (isNaN(numericId)) {
            throw new Error('Invalid warehouse ID');
        }
        if (!Array.isArray(riderIds) || riderIds.length === 0) {
            throw new Error('rider_ids array is required');
        }

        return await prisma.$transaction(async (tx) => {
            await tx.warehouse_riders.updateMany({
                where: { warehouse_id: numericId },
                data: { is_active: false }
            });

            const operations = riderIds.map((riderId) => {
                const numericRiderId = parseInt(riderId, 10);
                if (isNaN(numericRiderId)) return null;
                return tx.warehouse_riders.upsert({
                    where: { warehouse_id_rider_id: { warehouse_id: numericId, rider_id: numericRiderId } },
                    create: { warehouse_id: numericId, rider_id: numericRiderId, is_active: true, assigned_at: new Date() },
                    update: { is_active: true, assigned_at: new Date() }
                });
            }).filter(Boolean);

            return Promise.all(operations);
        });
    }

    async removeRider(warehouseId, riderId) {
        const numericWarehouseId = parseInt(warehouseId, 10);
        const numericRiderId = parseInt(riderId, 10);
        if (isNaN(numericWarehouseId) || isNaN(numericRiderId)) {
            throw new Error('Invalid warehouse ID or rider ID');
        }

        return await prisma.warehouse_riders.updateMany({
            where: { warehouse_id: numericWarehouseId, rider_id: numericRiderId },
            data: { is_active: false }
        });
    }
}

export default new WarehouseDAO();
