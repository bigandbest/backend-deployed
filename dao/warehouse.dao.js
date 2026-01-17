import prisma from '../config/prisma.js';

class WarehouseDAO {
    async create(data) {
        return await prisma.warehouses.create({ data });
    }

    async getById(id) {
        return await prisma.warehouses.findUnique({
            where: { id },
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
        return await prisma.warehouses.update({
            where: { id },
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
        const { zone_ids, pincode_assignments } = relations;
        return await prisma.$transaction(async (tx) => {
            const warehouse = await tx.warehouses.update({
                where: { id },
                data: { ...data, updated_at: new Date() }
            });

            if (data.type === 'zonal' && zone_ids) { // Only update if provided
                await tx.warehouse_zones.deleteMany({ where: { warehouse_id: id } });
                if (zone_ids.length > 0) {
                    await tx.warehouse_zones.createMany({
                        data: zone_ids.map(zid => ({
                            warehouse_id: id,
                            zone_id: Number(zid),
                            priority: 1,
                            is_active: true
                        }))
                    });
                }
            } else if (data.type === 'division' && pincode_assignments) {
                await tx.warehouse_pincodes.deleteMany({ where: { warehouse_id: id } });
                if (pincode_assignments.length > 0) {
                    await tx.warehouse_pincodes.createMany({
                        data: pincode_assignments.map(pa => ({
                            warehouse_id: id,
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
        return await prisma.warehouses.delete({
            where: { id }
        });
    }

    async getProductStock(warehouseId, productId, variantId = null) {
        const where = {
            warehouse_id: warehouseId,
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
        // Upsert logic
        const where = {
            warehouse_id_product_id_variant_id: { // Correct composite unique constraint per standard naming or need to verify
                warehouse_id: warehouseId,
                product_id: productId,
                variant_id: variantId || 0 // Assuming 0 or specific value for no variant if constraint requires? 
                // Actually relying on findFirst unique check is safer if schema is unknown.
            }
        };

        // Revised upsert using findFirst for safety
        const existing = await this.getProductStock(warehouseId, productId, variantId);

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
        // Delete all stock records for this product in this warehouse (base + variants)
        return await prisma.product_warehouse_stock.deleteMany({
            where: {
                warehouse_id: warehouseId,
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
        return await prisma.warehouse_pincodes.createMany({
            data: pincodeDataList.map(p => ({
                warehouse_id: warehouseId,
                ...p,
                is_active: true
            })),
            skipDuplicates: true
        });
    }

    async removePincode(warehouseId, pincode) {
        return await prisma.warehouse_pincodes.deleteMany({
            where: {
                warehouse_id: warehouseId,
                pincode: pincode
            }
        });
    }

    async getPincodes(warehouseId) {
        return await prisma.warehouse_pincodes.findMany({
            where: { warehouse_id: warehouseId, is_active: true },
            orderBy: { pincode: 'asc' }
        });
    }

    async listStocks(warehouseId) {
        return await prisma.product_warehouse_stock.findMany({
            where: { warehouse_id: warehouseId, is_active: true },
            include: {
                products: true,
                product_variants: true
            }
        });
    }

    async upsertSchedulingConfig(warehouseId, data) {
        // Check existence
        const existing = await prisma.warehouse_scheduling_config.findFirst({
            where: { warehouse_id: warehouseId }
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
        return await prisma.warehouse_scheduling_config.findFirst({
            where: { warehouse_id: warehouseId },
            include: { slot: true }
        });
    }
}

export default new WarehouseDAO();
