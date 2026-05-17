import prisma from '../config/prisma.js';
import stockMovementDao from '../dao/stock-movement.dao.js';
import inventoryDAO from '../dao/inventory.dao.js';

// ─── helpers ────────────────────────────────────────────────────────────────

const normalise = (inv) => ({
    id: inv.id,
    variant_id: inv.variant_id,
    warehouse_id: inv.warehouse_id,
    stock_quantity: inv.stock_qty,
    reserved_quantity: inv.reserved_qty,
    available_quantity: inv.stock_qty - inv.reserved_qty,
    product_id: inv.product_variants?.product_id ?? null,
    product_name: inv.product_variants?.products?.name ?? null,
    product_image: inv.product_variants?.products?.media?.[0]?.url ?? null,
    product_source_type: inv.product_variants?.products?.source_type ?? null,
    seller_id: inv.product_variants?.products?.seller_id ?? null,
    category: inv.product_variants?.products?.category ?? null,
    sku: inv.product_variants?.sku ?? null,
    variant_name: inv.product_variants?.title ?? null,
    minimum_threshold: inv.bulk_stock_threshold ?? 0,
    is_low_stock: (inv.stock_qty ?? 0) <= (inv.bulk_stock_threshold ?? 10),
    warehouses: inv.warehouses ?? null,
});

const inventoryInclude = {
    product_variants: {
        include: {
            products: {
                select: {
                    id: true, name: true, source_type: true, seller_id: true,
                    category: { select: { name: true } },
                    media: { where: { is_primary: true }, take: 1, select: { url: true } }
                }
            }
        }
    },
    warehouses: { select: { id: true, name: true, type: true, parent_warehouse_id: true } }
};

// ─── Admin: get inventory for a warehouse (paginated + filtered) ─────────────

export const getWarehouseInventory = async (req, res) => {
    try {
        const warehouseId = parseInt(req.params.warehouseId);
        if (isNaN(warehouseId)) return res.status(400).json({ success: false, message: 'Invalid warehouse ID' });

        // ── Query params ──────────────────────────────────────────────────────
        const page   = Math.max(1, parseInt(req.query.page)  || 1);
        const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
        const search = req.query.search?.trim() || '';
        // source_type: 'WAREHOUSE' | 'DROP_SHIP' | '' (all)
        const sourceType = req.query.source_type?.toUpperCase() || '';

        // ── Build where clause ────────────────────────────────────────────────
        const where = { warehouse_id: warehouseId };

        const productWhere = {};
        if (sourceType === 'WAREHOUSE') productWhere.source_type = 'WAREHOUSE';
        else if (sourceType === 'DROP_SHIP') productWhere.source_type = 'DROP_SHIP';

        if (search) {
            productWhere.name = { contains: search, mode: 'insensitive' };
        }

        // Only show products explicitly mapped to this warehouse via product_warehouse_stock
        productWhere.product_warehouse_stock = { some: { warehouse_id: warehouseId, is_active: true } };

        where.product_variants = { is: { products: { is: productWhere } } };

        // ── Count + paginate ──────────────────────────────────────────────────
        const [total, items] = await Promise.all([
            prisma.inventory.count({ where }),
            prisma.inventory.findMany({
                where,
                include: inventoryInclude,
                orderBy: { updated_at: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
        ]);

        const totalPages = Math.ceil(total / limit);

        res.json({
            success: true,
            inventory: items.map(normalise),
            total,
            page,
            limit,
            totalPages,
        });
    } catch (error) {
        console.error('getWarehouseInventory error:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// ─── Admin: upsert stock for a variant in a warehouse ───────────────────────

export const updateWarehouseInventory = async (req, res) => {
    try {
        const { warehouse_id, variant_id, stock_quantity } = req.body;

        if (!warehouse_id || !variant_id || stock_quantity === undefined) {
            return res.status(400).json({ success: false, message: 'warehouse_id, variant_id and stock_quantity are required' });
        }

        const whId = parseInt(warehouse_id);
        if (isNaN(whId)) return res.status(400).json({ success: false, message: 'Invalid warehouse_id' });

        // Resolve product_id + check existing inventory in parallel (independent reads)
        const [variant, existing] = await Promise.all([
            prisma.product_variants.findUnique({ where: { id: variant_id }, select: { product_id: true } }),
            prisma.inventory.findFirst({ where: { variant_id, warehouse_id: whId } }),
        ]);
        const product_id = variant?.product_id;

        let result;
        if (existing) {
            const prev = existing.stock_qty;
            result = await prisma.inventory.update({
                where: { id: existing.id },
                data: { stock_qty: parseInt(stock_quantity), updated_at: new Date() }
            });
            if (product_id) {
                await stockMovementDao.create({
                    product_id,
                    warehouse_id: whId,
                    movement_type: parseInt(stock_quantity) >= prev ? 'inbound' : 'outbound',
                    quantity: Math.abs(parseInt(stock_quantity) - prev),
                    previous_stock: prev,
                    new_stock: parseInt(stock_quantity),
                    reference_type: 'admin_update',
                    reason: 'Admin stock adjustment'
                });
            }
        } else {
            result = await prisma.inventory.create({
                data: { variant_id, warehouse_id: whId, stock_qty: parseInt(stock_quantity), reserved_qty: 0, updated_at: new Date() }
            });
            if (product_id) {
                await stockMovementDao.create({
                    product_id,
                    warehouse_id: whId,
                    movement_type: 'inbound',
                    quantity: parseInt(stock_quantity),
                    previous_stock: 0,
                    new_stock: parseInt(stock_quantity),
                    reference_type: 'admin_update',
                    reason: 'Admin stock creation'
                });
            }
        }

        // Ensure the product is mapped to this warehouse so it shows up in inventory list
        if (product_id) {
            const existingMapping = await prisma.product_warehouse_stock.findFirst({
                where: { product_id, warehouse_id: whId }
            });
            if (existingMapping) {
                await prisma.product_warehouse_stock.update({
                    where: { id: existingMapping.id },
                    data: { is_active: true, updated_at: new Date() }
                });
            } else {
                await prisma.product_warehouse_stock.create({
                    data: { product_id, warehouse_id: whId, is_active: true, created_at: new Date(), updated_at: new Date() }
                });
            }
        }

        res.json({ success: true, message: 'Inventory updated successfully', data: normalise({ ...result, variant: null, warehouses: null }) });
    } catch (error) {
        console.error('updateWarehouseInventory error:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// ─── Admin: analytics for a warehouse ───────────────────────────────────────

export const getWarehouseAnalytics = async (req, res) => {
    try {
        const warehouseId = parseInt(req.params.warehouseId);

        const mappedWhere = {
            warehouse_id: warehouseId,
            product_variants: { is: { products: { is: { product_warehouse_stock: { some: { warehouse_id: warehouseId, is_active: true } } } } } },
        };

        const [totalItems, agg, lowStock] = await Promise.all([
            prisma.inventory.count({ where: mappedWhere }),
            prisma.inventory.aggregate({ where: mappedWhere, _sum: { stock_qty: true } }),
            prisma.inventory.count({ where: { ...mappedWhere, stock_qty: { lt: 10 } } })
        ]);

        res.json({
            success: true,
            analytics: {
                total_stock_items: totalItems,
                total_available: agg._sum.stock_qty ?? 0,
                low_stock_count: lowStock
            }
        });
    } catch (error) {
        console.error('getWarehouseAnalytics error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ─── Admin: low stock items ──────────────────────────────────────────────────

export const getWarehouseLowStock = async (req, res) => {
    try {
        const warehouseId = parseInt(req.params.warehouseId);
        const threshold = parseInt(req.query.threshold ?? 10);
        const page  = Math.max(1, parseInt(req.query.page)  || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));

        const where = {
            warehouse_id: warehouseId,
            stock_qty: { lt: threshold },
            // Only show WAREHOUSE-source, explicitly-mapped products
            product_variants: { is: { products: { is: {
                source_type: 'WAREHOUSE',
                product_warehouse_stock: { some: { warehouse_id: warehouseId, is_active: true } },
            } } } },
        };

        const [total, items] = await Promise.all([
            prisma.inventory.count({ where }),
            prisma.inventory.findMany({
                where,
                include: inventoryInclude,
                orderBy: { stock_qty: 'asc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
        ]);

        res.json({ success: true, data: items.map(normalise), total, page, limit, totalPages: Math.ceil(total / limit) });
    } catch (error) {
        console.error('getWarehouseLowStock error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ─── Stock movements ─────────────────────────────────────────────────────────

export const getWarehouseMovements = async (req, res) => {
    try {
        const warehouseId = parseInt(req.params.warehouseId);
        const page  = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));

        const [total, movements] = await Promise.all([
            prisma.stock_movements.count({ where: { warehouse_id: warehouseId } }),
            prisma.stock_movements.findMany({
                where: { warehouse_id: warehouseId },
                include: { warehouses: { select: { name: true } } },
                orderBy: { created_at: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
        ]);

        const productIds = [...new Set(movements.map(m => m.product_id))];
        const products = await prisma.products.findMany({
            where: { id: { in: productIds } },
            select: { id: true, name: true }
        });
        const productMap = Object.fromEntries(products.map(p => [p.id, p.name]));

        res.json({
            success: true,
            data: movements.map(m => ({
                ...m,
                product_name: productMap[m.product_id] ?? 'Unknown',
                warehouse_name: m.warehouses?.name
            })),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        });
    } catch (error) {
        console.error('getWarehouseMovements error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ─── Get all products available for a pincode ──────────────────────────────

export const getProductsByPincode = async (req, res) => {
    try {
        const { pincode } = req.params;

        // Find warehouses serving this pincode (division + zonal)
        const [divisionPins, zonePins] = await Promise.all([
            prisma.warehouse_pincodes.findMany({
                where: { pincode, is_active: true },
                select: { warehouse_id: true }
            }),
            prisma.zone_pincodes.findMany({
                where: { pincode },
                include: { delivery_zones: { include: { warehouse_zones: { select: { warehouse_id: true } } } } }
            })
        ]);

        const warehouseIds = new Set(divisionPins.map(p => p.warehouse_id));
        for (const zp of zonePins) {
            for (const wz of zp.delivery_zones?.warehouse_zones ?? []) {
                warehouseIds.add(wz.warehouse_id);
            }
        }

        if (warehouseIds.size === 0) {
            return res.json({ success: true, data: [], message: 'No warehouses serve this pincode' });
        }

        const page  = Math.max(1, parseInt(req.query.page)  || 1);
        const limit = Math.min(100, parseInt(req.query.limit) || 50);
        const inventoryWhere = { warehouse_id: { in: [...warehouseIds] }, stock_qty: { gt: 0 } };

        const [total, inventory] = await Promise.all([
            prisma.inventory.count({ where: inventoryWhere }),
            prisma.inventory.findMany({
                where: inventoryWhere,
                include: inventoryInclude,
                take: limit,
                skip: (page - 1) * limit,
            }),
        ]);

        res.json({ success: true, data: inventory.map(normalise), total, page, limit, totalPages: Math.ceil(total / limit) });
    } catch (error) {
        console.error('getProductsByPincode error:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// ─── Delete stock record ─────────────────────────────────────────────────────

export const deleteStock = async (req, res) => {
    try {
        const { stockId } = req.params;
        const id = parseInt(stockId);
        if (isNaN(id)) return res.status(400).json({ success: false, message: 'Invalid stock ID' });
        await prisma.inventory.delete({ where: { id } });
        res.json({ success: true, message: 'Stock record deleted' });
    } catch (error) {
        console.error('deleteStock error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── Batch check availability ─────────────────────────────────────────────────

export const checkAvailability = async (req, res) => {
    const { items, warehouse_id } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, error: 'items array is required' });
    }

    try {
        const availability = await inventoryDAO.checkBulkAvailability(
            items,
            warehouse_id ? parseInt(warehouse_id) : null
        );
        res.json({
            success: true,
            data: availability,
            total_items: items.length,
            all_available: availability.every(item => item.can_fulfill)
        });
    } catch (error) {
        console.error('checkAvailability error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
};

// ─── Get stock for a single variant ──────────────────────────────────────────

export const getVariantStock = async (req, res) => {
    const { variantId } = req.params;
    const { warehouse_id } = req.query;

    try {
        const stockInfo = await inventoryDAO.getAvailableStock(
            variantId,
            warehouse_id ? parseInt(warehouse_id) : null
        );
        res.json({ success: true, data: stockInfo });
    } catch (error) {
        console.error('getVariantStock error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
};

// ─── Reserve stock ────────────────────────────────────────────────────────────

export const reserveStock = async (req, res) => {
    const { variant_id, quantity, warehouse_id } = req.body;

    if (!variant_id || !quantity || !warehouse_id) {
        return res.status(400).json({
            success: false,
            error: 'variant_id, quantity, and warehouse_id are required'
        });
    }

    try {
        const result = await inventoryDAO.reserveStock(
            variant_id,
            parseInt(quantity),
            parseInt(warehouse_id)
        );
        res.json({ success: true, data: result, message: 'Stock reserved successfully' });
    } catch (error) {
        console.error('reserveStock error:', error);
        res.status(error.message.includes('Insufficient') ? 400 : 500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
};

// ─── Get low stock items (global) ─────────────────────────────────────────────

export const getLowStock = async (req, res) => {
    const { threshold = 10, warehouse_id } = req.query;

    try {
        const lowStockItems = await inventoryDAO.getLowStockItems(
            parseInt(threshold),
            warehouse_id ? parseInt(warehouse_id) : null
        );
        res.json({ success: true, data: lowStockItems, total: lowStockItems.length });
    } catch (error) {
        console.error('getLowStock error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
};

// ─── Check product availability by pincode ───────────────────────────────────

export const checkProductAvailability = async (req, res) => {
    try {
        const { pincode, productId } = req.params;

        const product = await prisma.products.findUnique({
            where: { id: productId },
            select: { id: true, name: true }
        });
        if (!product) return res.json({ success: true, data: { is_available: false, message: 'Product not found' } });

        // Check division warehouse via warehouse_pincodes
        const divisionPin = await prisma.warehouse_pincodes.findFirst({
            where: { pincode, is_active: true },
            include: { warehouses: { select: { id: true, name: true, type: true } } }
        });

        if (divisionPin) {
            const inv = await prisma.inventory.findFirst({
                where: { warehouse_id: divisionPin.warehouses.id, product_variants: { product_id: productId } }
            });
            if (inv && (inv.stock_qty - inv.reserved_qty) > 0) {
                return res.json({ success: true, data: { is_available: true, warehouse_type: 'division', warehouse_name: divisionPin.warehouses.name, delivery_time: '2 Hours', available_quantity: inv.stock_qty - inv.reserved_qty } });
            }
        }

        // Check zonal warehouse via zone_pincodes
        const zonePin = await prisma.zone_pincodes.findFirst({
            where: { pincode },
            include: { zone: { include: { warehouse_zones: { include: { warehouses: { select: { id: true, name: true, type: true } } } } } } }
        });

        if (zonePin) {
            const warehouseZones = zonePin.zone?.warehouse_zones ?? [];
            if (warehouseZones.length > 0) {
                const zonalWarehouseIds = warehouseZones.map(wz => wz.warehouse_id);
                const zonalInvs = await prisma.inventory.findMany({
                    where: {
                        warehouse_id: { in: zonalWarehouseIds },
                        product_variants: { product_id: productId },
                    },
                    select: { warehouse_id: true, stock_qty: true, reserved_qty: true },
                });
                const whZoneMap = new Map(warehouseZones.map(wz => [wz.warehouse_id, wz]));
                for (const inv of zonalInvs) {
                    if ((inv.stock_qty - inv.reserved_qty) > 0) {
                        const wz = whZoneMap.get(inv.warehouse_id);
                        return res.json({ success: true, data: { is_available: true, warehouse_type: 'zonal', warehouse_name: wz?.warehouses?.name, delivery_time: 'Same Day', available_quantity: inv.stock_qty - inv.reserved_qty } });
                    }
                }
            }
        }

        res.json({ success: true, data: { is_available: false, message: 'Not available for this pincode' } });
    } catch (error) {
        console.error('checkProductAvailability error:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};
