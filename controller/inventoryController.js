import prisma from '../config/prisma.js';
import stockMovementDao from '../dao/stock-movement.dao.js';

// ─── helpers ────────────────────────────────────────────────────────────────

const normalise = (inv) => ({
    id: inv.id,
    variant_id: inv.variant_id,
    warehouse_id: inv.warehouse_id,
    stock_quantity: inv.stock_qty,
    reserved_quantity: inv.reserved_qty,
    available_quantity: inv.stock_qty - inv.reserved_qty,
    product_name: inv.product_variants?.products?.name ?? null,
    product_image: inv.product_variants?.products?.media?.[0]?.url ?? null,
    category: inv.product_variants?.products?.category ?? null,
    variant_name: inv.product_variants?.title ?? null,
    warehouses: inv.warehouses ?? null,
});

const inventoryInclude = {
    product_variants: {
        include: {
            products: {
                select: {
                    id: true, name: true,
                    category: { select: { name: true } },
                    media: { where: { is_primary: true }, take: 1, select: { url: true } }
                }
            }
        }
    },
    warehouses: { select: { id: true, name: true, type: true, parent_warehouse_id: true } }
};

// ─── Admin: get all inventory for a warehouse ────────────────────────────────

export const getWarehouseInventory = async (req, res) => {
    try {
        const warehouseId = parseInt(req.params.warehouseId);
        const items = await prisma.inventory.findMany({
            where: { warehouse_id: warehouseId },
            include: inventoryInclude,
            orderBy: { updated_at: 'desc' }
        });
        res.json({ success: true, inventory: items.map(normalise) });
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

        const existing = await prisma.inventory.findFirst({
            where: { variant_id, warehouse_id: parseInt(warehouse_id) }
        });

        let result;
        if (existing) {
            const prev = existing.stock_qty;
            result = await prisma.inventory.update({
                where: { id: existing.id },
                data: { stock_qty: parseInt(stock_quantity) }
            });
            await stockMovementDao.create({
                product_id: (await prisma.product_variants.findUnique({ where: { id: variant_id }, select: { product_id: true } }))?.product_id,
                warehouse_id: parseInt(warehouse_id),
                movement_type: parseInt(stock_quantity) >= prev ? 'inbound' : 'outbound',
                quantity: Math.abs(parseInt(stock_quantity) - prev),
                previous_stock: prev,
                new_stock: parseInt(stock_quantity),
                reference_type: 'admin_update',
                reason: 'Admin stock adjustment'
            });
        } else {
            result = await prisma.inventory.create({
                data: { variant_id, warehouse_id: parseInt(warehouse_id), stock_qty: parseInt(stock_quantity), reserved_qty: 0, updated_at: new Date() }
            });
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

        const [totalItems, agg, lowStock] = await Promise.all([
            prisma.inventory.count({ where: { warehouse_id: warehouseId } }),
            prisma.inventory.aggregate({ where: { warehouse_id: warehouseId }, _sum: { stock_qty: true } }),
            prisma.inventory.count({ where: { warehouse_id: warehouseId, stock_qty: { lt: 10 } } })
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

        const items = await prisma.inventory.findMany({
            where: { warehouse_id: warehouseId, stock_qty: { lt: threshold } },
            include: inventoryInclude
        });

        res.json({ success: true, data: items.map(normalise) });
    } catch (error) {
        console.error('getWarehouseLowStock error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ─── Stock movements ─────────────────────────────────────────────────────────

export const getWarehouseMovements = async (req, res) => {
    try {
        const warehouseId = parseInt(req.params.warehouseId);
        const limit = parseInt(req.query.limit ?? 50);

        const movements = await prisma.stock_movements.findMany({
            where: { warehouse_id: warehouseId },
            include: { warehouses: { select: { name: true } } },
            orderBy: { created_at: 'desc' },
            take: limit
        });

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
            }))
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

        const inventory = await prisma.inventory.findMany({
            where: {
                warehouse_id: { in: [...warehouseIds] },
                stock_qty: { gt: 0 }
            },
            include: inventoryInclude
        });

        res.json({ success: true, data: inventory.map(normalise), total: inventory.length });
    } catch (error) {
        console.error('getProductsByPincode error:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
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
            for (const wz of zonePin.zone?.warehouse_zones ?? []) {
                const inv = await prisma.inventory.findFirst({
                    where: { warehouse_id: wz.warehouse_id, product_variants: { product_id: productId } }
                });
                if (inv && (inv.stock_qty - inv.reserved_qty) > 0) {
                    return res.json({ success: true, data: { is_available: true, warehouse_type: 'zonal', warehouse_name: wz.warehouses?.name, delivery_time: 'Same Day', available_quantity: inv.stock_qty - inv.reserved_qty } });
                }
            }
        }

        res.json({ success: true, data: { is_available: false, message: 'Not available for this pincode' } });
    } catch (error) {
        console.error('checkProductAvailability error:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};
