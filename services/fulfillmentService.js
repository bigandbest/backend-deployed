import prisma from '../config/prisma.js';
import inventoryDao from '../dao/inventory.dao.js';


const getDivisionWarehousesForPincode = async (pincode) => {
    const mappings = await prisma.warehouse_pincodes.findMany({
        where: {
            pincode,
            is_active: true,
            warehouse: {
                is_active: true,
                type: 'division',
            },
        },
        include: {
            warehouse: {
                select: {
                    id: true, name: true, type: true, location: true,
                },
            },
        },
    });
    return mappings.map((m) => m.warehouse);
};

/**
 * Get zonal warehouses serving a specific pincode (via zone mapping)
 */
const getZonalWarehousesForPincode = async (pincode) => {
    const zoneMappings = await prisma.zone_pincodes.findMany({
        where: { pincode, is_active: true },
        include: {
            delivery_zones: {
                include: {
                    warehouse_zones: {
                        where: { is_active: true },
                        include: {
                            warehouses: {
                                select: {
                                    id: true, name: true, type: true, location: true,
                                    is_active: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    });

    const warehouses = [];
    const seen = new Set();

    for (const zm of zoneMappings) {
        for (const wz of zm.delivery_zones?.warehouse_zones || []) {
            const wh = wz.warehouses;
            if (wh && wh.is_active && wh.type === 'zonal' && !seen.has(wh.id)) {
                seen.add(wh.id);
                warehouses.push(wh);
            }
        }
    }

    return warehouses;
};

/**
 * Get seller stores registered for a specific pincode.
 * Approved delivery pincodes are stored in seller_pincode_requests with status='APPROVED'.
 */
const getSellerStoresForPincode = async (pincode, excludeSellerIds = []) => {
    const approvedRequests = await prisma.seller_pincode_requests.findMany({
        where: {
            pincode,
            status: 'APPROVED',
            ...(excludeSellerIds.length > 0
                ? { seller_id: { notIn: excludeSellerIds } }
                : {}),
        },
        include: {
            sellers: {
                select: {
                    id: true,
                    business_name: true,
                    is_active: true,
                    is_open: true,
                    is_verified: true,
                    verification_status: true,
                },
            },
        },
    });

    return approvedRequests
        .filter((r) => {
            const s = r.sellers;
            return (
                s?.is_active &&
                s?.is_open &&
                s?.is_verified &&
                s?.verification_status === 'VERIFIED'
            );
        })
        .map((r) => r.sellers);
};


export const checkProductAvailability = async (
    productId,
    variantId,
    pincode,
    quantity = 1,
    excludeSellerIds = []
) => {
    const normalizedPincode = String(pincode || '').trim();
    if (!normalizedPincode || !/^\d{6}$/.test(normalizedPincode)) {
        return { available: false, reason: 'Invalid pincode' };
    }

    // Resolve variant if not provided
    if (!variantId) {
        const defaultVariant = await prisma.product_variants.findFirst({
            where: { product_id: productId, is_default: true },
        });
        variantId = defaultVariant?.id;
        if (!variantId) {
            const firstVariant = await prisma.product_variants.findFirst({
                where: { product_id: productId },
            });
            variantId = firstVariant?.id;
        }
        if (!variantId) {
            return { available: false, reason: 'No variant found for product' };
        }
    }

    // ──── PRIORITY A: Division Warehouse ────
    const divisionWarehouses = await getDivisionWarehousesForPincode(normalizedPincode);
    if (divisionWarehouses.length > 0) {
        const divisionIds = divisionWarehouses.map((w) => w.id);
        const stocks = await inventoryDao.getAvailableStockAcrossWarehouses(variantId, divisionIds);
        const match = stocks.find((s) => s.available >= quantity);

        if (match) {
            const warehouse = divisionWarehouses.find((w) => w.id === match.warehouse_id);
            return {
                available: true,
                source_type: 'division',
                source_id: match.warehouse_id,
                seller_id: null,
                available_qty: match.available,
                estimated_delivery_minutes: warehouse?.delivery_sla_minutes || 120,
                warehouse_name: warehouse?.name || 'Division Warehouse',
            };
        }
    }

    // ──── PRIORITY B: Zonal Warehouse (Dark Store) ────
    const zonalWarehouses = await getZonalWarehousesForPincode(normalizedPincode);
    if (zonalWarehouses.length > 0) {
        const zonalIds = zonalWarehouses.map((w) => w.id);
        const stocks = await inventoryDao.getAvailableStockAcrossWarehouses(variantId, zonalIds);
        const match = stocks.find((s) => s.available >= quantity);

        if (match) {
            const warehouse = zonalWarehouses.find((w) => w.id === match.warehouse_id);
            return {
                available: true,
                source_type: 'zonal',
                source_id: match.warehouse_id,
                seller_id: null,
                available_qty: match.available,
                estimated_delivery_minutes: warehouse?.delivery_sla_minutes || 30,
                warehouse_name: warehouse?.name || 'Zonal Warehouse',
            };
        }
    }

    // ──── PRIORITY C: Seller Stores ────
    const sellers = await getSellerStoresForPincode(normalizedPincode, excludeSellerIds);
    if (sellers.length > 0) {
        // Query all sellers in parallel, then pick the first match
        const sellerResults = await Promise.all(
            sellers.map((seller) =>
                prisma.seller_products.findFirst({
                    where: {
                        seller_id: seller.id,
                        product_id: productId,
                        ...(variantId ? { variant_id: variantId } : {}),
                        is_active: true,
                        status: 'APPROVED',
                        stock_quantity: { gte: quantity },
                    },
                    include: {
                        warehouses: {
                            select: { id: true, name: true, delivery_sla_minutes: true },
                        },
                    },
                    orderBy: { stock_quantity: 'desc' },
                }).then((product) => ({ seller, product }))
            )
        );

        const match = sellerResults.find((r) => r.product !== null);
        if (match) {
            const { seller, product: sellerProduct } = match;
            return {
                available: true,
                source_type: 'seller',
                source_id: sellerProduct.warehouse_id,
                seller_id: seller.id,
                available_qty: sellerProduct.stock_quantity - (sellerProduct.reserved_quantity || 0),
                estimated_delivery_minutes: sellerProduct.warehouses?.delivery_sla_minutes || 120,
                warehouse_name: sellerProduct.warehouses?.name || `Seller: ${seller.business_name}`,
            };
        }
    }

    // ──── PRIORITY D: Out of Stock ────
    return {
        available: false,
        source_type: null,
        source_id: null,
        available_qty: 0,
        reason: 'Out of stock at all sources for this pincode',
    };
};

// ================================================================
// CART-LEVEL RESOLUTION
// ================================================================

/**
 * Resolve sources for all items in a cart.
 * Each product gets exactly ONE source (single-source fulfillment).
 * 
 * @param {Array<{product_id, variant_id, quantity, price}>} items
 * @param {string} pincode
 * @returns {Array} Items with resolved source info
 */
export const resolveCartSources = async (items, pincode) => {
    const resolved = await Promise.all(
        items.map(async (item) => {
            const availability = await checkProductAvailability(
                item.product_id,
                item.variant_id,
                pincode,
                item.quantity || 1
            );
            return {
                ...item,
                available: availability.available,
                source_type: availability.source_type,
                source_id: availability.source_id,
                seller_id: availability.seller_id || null,
                available_qty: availability.available_qty,
                estimated_delivery_minutes: availability.estimated_delivery_minutes,
                warehouse_name: availability.warehouse_name,
                reason: availability.reason || null,
            };
        })
    );
    return resolved;
};

// ================================================================
// RE-VALIDATE & LOCK (Order Placement)
// ================================================================

/**
 * Re-validate stock for all cart items and perform atomic hard lock.
 * Returns { success, locked_items, unavailable_items }
 * 
 * Called at the moment of order placement to prevent race conditions.
 */
export const revalidateAndLock = async (items, pincode) => {
    const resolvedItems = await resolveCartSources(items, pincode);

    const unavailable = resolvedItems.filter((item) => !item.available);
    if (unavailable.length > 0) {
        return {
            success: false,
            unavailable_items: unavailable.map((item) => ({
                product_id: item.product_id,
                variant_id: item.variant_id,
                reason: item.reason || 'Out of stock',
            })),
            locked_items: [],
        };
    }

    // Attempt to hard-lock all items in a single transaction
    const lockedItems = [];
    const lockFailures = [];

    for (const item of resolvedItems) {
        try {
            if (item.source_type === 'seller') {
                // For seller products, decrement seller_products.stock_quantity
                await prisma.$transaction(async (tx) => {
                    const sp = await tx.seller_products.findFirst({
                        where: {
                            seller_id: item.seller_id,
                            product_id: item.product_id,
                            ...(item.variant_id ? { variant_id: item.variant_id } : {}),
                            warehouse_id: item.source_id,
                            is_active: true,
                            status: 'APPROVED',
                        },
                    });

                    if (!sp || sp.stock_quantity < item.quantity) {
                        throw new Error('Seller stock insufficient');
                    }

                    await tx.seller_products.update({
                        where: { id: sp.id },
                        data: {
                            stock_quantity: { decrement: item.quantity },
                            reserved_quantity: { increment: item.quantity },
                        },
                    });
                });
            } else {
                // For warehouse stock, use inventory hard lock
                await inventoryDao.hardLock(item.variant_id, item.source_id, item.quantity);
            }
            lockedItems.push(item);
        } catch (err) {
            console.error(`Lock failed for product ${item.product_id}:`, err.message);
            lockFailures.push({
                product_id: item.product_id,
                variant_id: item.variant_id,
                reason: err.message,
            });
        }
    }

    if (lockFailures.length > 0) {
        // Rollback any successful locks
        for (const locked of lockedItems) {
            try {
                if (locked.source_type === 'seller') {
                    await prisma.seller_products.updateMany({
                        where: {
                            seller_id: locked.seller_id,
                            product_id: locked.product_id,
                            warehouse_id: locked.source_id,
                        },
                        data: {
                            stock_quantity: { increment: locked.quantity },
                            reserved_quantity: { decrement: locked.quantity },
                        },
                    });
                } else {
                    await inventoryDao.releaseHardLock(locked.variant_id, locked.source_id, locked.quantity);
                }
            } catch (rollbackErr) {
                console.error('Rollback failed:', rollbackErr.message);
            }
        }

        return {
            success: false,
            unavailable_items: lockFailures,
            locked_items: [],
        };
    }

    return {
        success: true,
        locked_items: lockedItems,
        unavailable_items: [],
    };
};

export default {
    checkProductAvailability,
    resolveCartSources,
    revalidateAndLock,
    getDivisionWarehousesForPincode,
    getZonalWarehousesForPincode,
    getSellerStoresForPincode,
};
