import prisma from "../config/prisma.js";
import redis from "../config/redis.js";
import { trackAvailability, availabilityCache, availabilityNotServiceable, availabilityLookup, availabilityItemFlight, availabilityBatch } from "../lib/perfMetrics.js";
import { createSingleFlight } from "../lib/singleFlight.js";
import { availZoneLookupKey, availWarehousesLookupKey, AVAILABILITY_LOOKUP_TTL } from "../lib/cacheKeys.js";

const AVAILABILITY_CACHE_TTL = parseInt(process.env.AVAILABILITY_CACHE_TTL || '60', 10);

// Returned by the raw loaders when their DB read failed, so a failure is never written to the cache.
const LOOKUP_FAILED = Symbol('lookup-failed');
const lookupFlight = createSingleFlight();

// In-flight per-item availability computations, keyed by (variant, zone, quantity): concurrent requests share one.
const itemFlights = new Map();
const STOCK_BATCH_CHUNK = 500; // variants per inventory read

/**
 * Cache-aside + single-flight for a per-pincode lookup. Cached values are wrapped as { v } so a legitimately
 * empty/null result (unserviceable pincode, no zone) is distinguishable from a miss. Redis trouble = plain DB read.
 * A failed DB read returns `fallback` (the value the loader returned on error before caching existed) and is NOT cached.
 */
async function cachedPincodeLookup(kind, key, load, fallback) {
    try {
        const raw = await redis.get(key);
        if (raw) { availabilityLookup(kind, 'hit'); return JSON.parse(raw).v; }
    } catch { /* Redis unavailable or bad JSON — fall through to the DB */ }

    const { promise, joined } = lookupFlight(`${kind}:${key}`, async () => {
        const value = await load();
        if (value === LOOKUP_FAILED) return LOOKUP_FAILED;
        // awaited (errors swallowed) so callers arriving right after this flight settles see the cached value
        try { await redis.setex(key, AVAILABILITY_LOOKUP_TTL, JSON.stringify({ v: value })); } catch { /* cache write is best-effort */ }
        return value;
    });
    const value = await promise;
    if (value === LOOKUP_FAILED) { availabilityLookup(kind, 'failed'); return fallback; }
    availabilityLookup(kind, joined ? 'joined' : 'miss');
    return value;
}

class CartAvailabilityDAO {
    /**
     * Get active warehouses that service a specific pincode
     * @param {string} pincode - The delivery pincode
     * @returns {Promise<Array>} Array of warehouses with pincode details
     */
    async getWarehousesByPincode(pincode) {
        return cachedPincodeLookup('warehouses', availWarehousesLookupKey(pincode), () => this._loadWarehousesByPincode(pincode), []);
    }

    /** Raw DB read (uncached). Returns LOOKUP_FAILED instead of [] when the read throws so the wrapper does not cache it. */
    async _loadWarehousesByPincode(pincode) {
        try {
            // Fetch direct mappings, zone pincodes, and nationwide zones in parallel
            const [directMappings, zoneMappings, nationwideZones] = await Promise.all([
                prisma.warehouse_pincodes.findMany({
                    where: {
                        pincode: pincode,
                        is_active: true,
                        warehouse: { is_active: true }
                    },
                    include: {
                        warehouse: {
                            select: {
                                id: true,
                                name: true,
                                type: true,
                                location: true,
                                parent_warehouse_id: true,
                                is_active: true
                            }
                        }
                    }
                }),
                prisma.zone_pincodes.findMany({
                    where: { pincode: pincode, is_active: true },
                    select: { zone_id: true }
                }),
                prisma.delivery_zones.findMany({
                    where: { is_nationwide: true, is_active: true },
                    select: { id: true }
                })
            ]);

            const zoneIds = [
                ...zoneMappings.map(z => z.zone_id),
                ...nationwideZones.map(z => z.id)
            ];

            let zoneWarehouses = [];
            if (zoneIds.length > 0) {
                const warehouseZones = await prisma.warehouse_zones.findMany({
                    where: {
                        zone_id: { in: zoneIds },
                        is_active: true,
                        warehouses: { is_active: true }
                    },
                    include: {
                        warehouses: {
                            select: {
                                id: true,
                                name: true,
                                type: true,
                                location: true,
                                parent_warehouse_id: true,
                                is_active: true
                            }
                        }
                    }
                });

                zoneWarehouses = warehouseZones.map(wz => ({
                    warehouse_id: wz.warehouse_id,
                    delivery_days: 3, // Default for zonal delivery
                    warehouse: wz.warehouses
                }));
            }

            // Combine and deduplicate by warehouse_id
            const allWarehouses = [...directMappings, ...zoneWarehouses];
            const uniqueWarehouses = [];
            const seenIds = new Set();

            for (const w of allWarehouses) {
                if (!seenIds.has(w.warehouse_id)) {
                    seenIds.add(w.warehouse_id);
                    uniqueWarehouses.push(w);
                }
            }

            return uniqueWarehouses;
        } catch (error) {
            console.error('Error fetching warehouses by pincode:', error);
            return LOOKUP_FAILED;
        }
    }

    /**
     * Check stock availability for a variant across multiple warehouses
     * @param {string} variantId - The product variant ID
     * @param {Array<number>} warehouseIds - Array of warehouse IDs to check
     * @returns {Promise<Object>} Stock information with warehouse details
     */
    async checkVariantStock(variantId, warehouseIds) {
        try {
            // Use product_warehouse_stock instead of inventory
            const data = await prisma.inventory.findMany({
                where: {
                    variant_id: variantId,
                    warehouse_id: {
                        in: warehouseIds
                    }
                },
                include: {
                    warehouses: { // Relation name in product_warehouse_stock
                        select: {
                            id: true,
                            name: true,
                            type: true,
                            location: true,
                            parent_warehouse_id: true
                        }
                    }
                }
            });

            // Calculate available stock for each warehouse
            return data?.map(item => ({
                ...item,
                warehouse: item.warehouses, // Map back to 'warehouse' for compatibility
                available_stock: Math.max(0, (item.stock_qty || 0) - (item.reserved_qty || 0))
            })) || [];
        } catch (error) {
            console.error('Error checking variant stock:', error);
            return null;
        }
    }

    /**
     * Check availability for a single cart item across warehouses
     * @param {Object} item - Cart item with product_id, variant_id, quantity
     * @param {Array} warehousePincodes - Warehouses serving the pincode
     * @returns {Promise<Object>} Item availability details
     */
    async checkItemAvailability(item, warehousePincodes) {
        const warehouseIds = warehousePincodes.map(wp => wp.warehouse_id);

        // Get variant ID - if not provided, fetch default variant for product
        let variantId = item.variant_id;
        if (!variantId) {
            const variants = await prisma.product_variants.findMany({
                where: {
                    product_id: item.product_id,
                    is_default: true
                },
                take: 1
            });

            variantId = variants?.[0]?.id;
        }

        if (!variantId) {
            return this._variantNotFound(item);
        }

        // Check stock across warehouses
        const stockData = await this.checkVariantStock(variantId, warehouseIds);
        return this._availabilityFromStock(item, variantId, stockData, warehousePincodes);
    }

    /** Result for an item whose (default) variant cannot be resolved. Shared by the per-item and batched paths. */
    _variantNotFound(item) {
        return {
            product_id: item.product_id,
            product_name: item.product_name || 'Unknown Product',
            variant_id: null,
            available: false,
            warehouse_type: null,
            delivery_days: null,
            delivery_message: 'Product variant not found',
            available_quantity: 0,
            requested_quantity: item.quantity || 1
        };
    }

    /**
     * Pure availability decision from already-loaded stock rows (no I/O). Body moved verbatim out of
     * checkItemAvailability so the per-item and batched paths share exactly one implementation.
     */
    _availabilityFromStock(item, variantId, stockData, warehousePincodes) {
        if (!stockData || stockData.length === 0) {
            return {
                product_id: item.product_id,
                product_name: item.product_name || 'Unknown Product',
                variant_id: variantId,
                available: false,
                warehouse_type: null,
                delivery_days: null,
                delivery_message: 'Out of stock',
                available_quantity: 0,
                requested_quantity: item.quantity || 1
            };
        }

        // Find best warehouse with sufficient stock
        // Flow: Check zonal warehouse first, then check division for faster delivery
        // Priority: Division (few hours) > Zonal (1-2 working days) > Main (fallback)
        const requestedQty = item.quantity || 1;

        // Separate warehouses by type
        const zonalWarehouses = stockData.filter(s =>
            s.warehouse.type === 'zonal' && s.available_stock >= requestedQty
        );

        const divisionWarehouses = stockData.filter(s =>
            s.warehouse.type === 'division' && s.available_stock >= requestedQty
        );

        const mainWarehouses = stockData.filter(s =>
            s.warehouse.type === 'main' && s.available_stock >= requestedQty
        );

        let selectedWarehouse = null;
        let displayWarehouse = null;
        let warehousePincode = null;

        // First check if available in zonal warehouse (base availability)
        const hasZonalStock = zonalWarehouses.length > 0;

        // If available in zonal, check if also available in division for faster delivery
        if (hasZonalStock && divisionWarehouses.length > 0) {
            // Prefer division for faster delivery (few hours)
            selectedWarehouse = divisionWarehouses[0];
            displayWarehouse = zonalWarehouses[0];
            warehousePincode = warehousePincodes.find(wp => wp.warehouse_id === selectedWarehouse.warehouse_id);
        } else if (hasZonalStock) {
            // Use zonal warehouse (1-2 working days)
            selectedWarehouse = zonalWarehouses[0];
            displayWarehouse = zonalWarehouses[0];
            warehousePincode = warehousePincodes.find(wp => wp.warehouse_id === selectedWarehouse.warehouse_id);
        } else if (mainWarehouses.length > 0) {
            // Fallback to main warehouse
            selectedWarehouse = mainWarehouses[0];
            displayWarehouse = mainWarehouses[0];
            warehousePincode = warehousePincodes.find(wp => wp.warehouse_id === selectedWarehouse.warehouse_id);
        }

        if (!selectedWarehouse) {
            // Check max available stock across all warehouses
            const maxStock = stockData.length > 0
                ? Math.max(...stockData.map(s => s.available_stock))
                : 0;

            return {
                product_id: item.product_id,
                product_name: item.product_name || 'Unknown Product',
                variant_id: variantId,
                available: false,
                warehouse_type: null,
                delivery_days: null,
                delivery_message: maxStock > 0
                    ? `Only ${maxStock} available, requested ${requestedQty}`
                    : 'Out of stock',
                available_quantity: maxStock,
                requested_quantity: requestedQty
            };
        }

        // Calculate delivery days based on warehouse type
        let deliveryDays;
        let deliveryMessage;

        if (selectedWarehouse.warehouse.type === 'division') {
            deliveryDays = 0; // Same day / few hours
            deliveryMessage = 'Delivery in few hours';
        } else if (selectedWarehouse.warehouse.type === 'zonal') {
            deliveryDays = warehousePincode?.delivery_days || 2;
            deliveryMessage = `Delivery in ${deliveryDays} working day${deliveryDays > 1 ? 's' : ''}`;
        } else {
            deliveryDays = warehousePincode?.delivery_days || 3;
            deliveryMessage = `Delivery in ${deliveryDays} day${deliveryDays > 1 ? 's' : ''}`;
        }

        return {
            product_id: item.product_id,
            product_name: item.product_name || 'Unknown Product',
            variant_id: variantId,
            available: true,
            warehouse_type: selectedWarehouse.warehouse.type,
            warehouse_id: selectedWarehouse.warehouse_id,
            warehouse_name: selectedWarehouse.warehouse.name,
            warehouse_location: selectedWarehouse.warehouse.location || null,
            header_warehouse_id: displayWarehouse?.warehouse_id || selectedWarehouse.warehouse_id,
            header_warehouse_name: displayWarehouse?.warehouse?.name || selectedWarehouse.warehouse.name,
            header_warehouse_type: displayWarehouse?.warehouse?.type || selectedWarehouse.warehouse.type,
            header_warehouse_location: displayWarehouse?.warehouse?.location || selectedWarehouse.warehouse.location || null,
            delivery_days: deliveryDays,
            delivery_message: deliveryMessage,
            available_quantity: selectedWarehouse.available_stock,
            requested_quantity: requestedQty
        };
    }

    /**
     * Check delivery availability for cart items
     * @param {Array} items - Cart items to check
     * @param {string} latitude - User latitude (optional, for future use)
     * @param {string} longitude - User longitude (optional, for future use)
     * @param {string} pincode - Delivery pincode
     * @returns {Promise<Object>} Availability results
     */
    async checkDeliveryAvailability(items, latitude, longitude, pincode) {
        // Validate pincode
        if (!pincode) {
            return {
                success: false,
                error: 'Pincode is required'
            };
        }

        // Get warehouses serving this pincode
        const warehousePincodes = await this.getWarehousesByPincode(pincode);

        if (!warehousePincodes || warehousePincodes.length === 0) {
            return {
                all_available: false,
                pincode,
                max_delivery_days: null,
                delivery_message: 'Delivery not available in your area',
                items: items.map(item => ({
                    product_id: item.product_id,
                    product_name: item.product_name || 'Unknown Product',
                    variant_id: item.variant_id || null,
                    available: false,
                    warehouse_type: null,
                    delivery_days: null,
                    delivery_message: 'Not serviceable to this pincode',
                    available_quantity: 0,
                    requested_quantity: item.quantity || 1
                }))
            };
        }

        // Check availability for each item (uses Redis cache when available)
        const itemResults = await Promise.all(
            items.map(item => this.checkItemAvailabilityCached(item, warehousePincodes, pincode))
        );

        // Calculate overall availability
        const allAvailable = itemResults.every(r => r.available);
        const availableItems = itemResults.filter(r => r.available);
        const maxDeliveryDays = availableItems.length > 0
            ? Math.max(...availableItems.map(r => r.delivery_days || 0))
            : null;

        return {
            all_available: allAvailable,
            pincode,
            max_delivery_days: maxDeliveryDays,
            delivery_message: allAvailable
                ? `Delivery in ${maxDeliveryDays} day${maxDeliveryDays > 1 ? 's' : ''}`
                : 'Some items not available',
            items: itemResults
        };
    }

    /**
     * Get the zone ID for a given pincode (for cache key generation)
     */
    async getZoneForPincode(pincode) {
        return cachedPincodeLookup('zone', availZoneLookupKey(pincode), () => this._loadZoneForPincode(pincode), null);
    }

    /** Raw DB read (uncached). Returns LOOKUP_FAILED instead of null when the read throws so the wrapper does not cache it. */
    async _loadZoneForPincode(pincode) {
        try {
            const [zoneMapping, nationwide] = await Promise.all([
                prisma.zone_pincodes.findFirst({
                    where: { pincode, is_active: true },
                    select: { zone_id: true }
                }),
                prisma.delivery_zones.findFirst({
                    where: { is_nationwide: true, is_active: true },
                    select: { id: true }
                })
            ]);
            if (zoneMapping) return String(zoneMapping.zone_id);
            return nationwide ? `nationwide_${nationwide.id}` : null;
        } catch (error) {
            console.error('Error getting zone for pincode:', error);
            return LOOKUP_FAILED;
        }
    }

    /**
     * Check single item availability with Redis cache-aside.
     * On cache hit: returns sub-1ms. On miss: queries DB and writes back with TTL.
     * On Redis failure: falls back to DB silently.
     */
    async checkItemAvailabilityCached(item, warehousePincodes, pincode) {
        const variantId = item.variant_id || item.product_id;
        let zoneId = null;
        let cached = null;

        try {
            zoneId = await this.getZoneForPincode(pincode);
            if (zoneId) {
                const cacheKey = `avail:${variantId}:${zoneId}`;
                const raw = await redis.get(cacheKey);
                if (raw) {
                    cached = JSON.parse(raw);
                }
            }
        } catch (err) {
            // Redis is down — log and continue to DB
            console.warn('[Availability] Redis unavailable, using DB fallback:', err.message);
        }

        if (cached) {
            return { ...cached, fromCache: true };
        }

        // Cache miss — query DB with existing warehouse hierarchy logic
        const result = await this.checkItemAvailability(item, warehousePincodes);

        // Write back — fire-and-forget
        if (zoneId) {
            const cacheKey = `avail:${variantId}:${zoneId}`;
            redis.setex(cacheKey, AVAILABILITY_CACHE_TTL, JSON.stringify(result)).catch(() => {});
        }

        return result;
    }

    /**
     * Batch availability check with Redis MGET pipeline.
     * Used by productSectionController to enrich product responses.
     * Returns { [product_id]: availabilityResult }
     */
    async checkBulkAvailability(items, pincode) {
        if (!items || items.length === 0) return {};
        // Instrumentation wrapper only (lib/perfMetrics.js): pass-through unless PERF_METRICS is enabled.
        return trackAvailability(items.length, () => this._checkBulkAvailability(items, pincode));
    }

    async _checkBulkAvailability(items, pincode) {

        const zoneId = await this.getZoneForPincode(pincode);
        const warehousePincodes = await this.getWarehousesByPincode(pincode);

        if (!warehousePincodes || warehousePincodes.length === 0) {
            availabilityNotServiceable();
            // Not serviceable — return unavailable for all
            const results = {};
            items.forEach(item => {
                const id = item.product_id;
                results[id] = {
                    product_id: id,
                    variant_id: item.variant_id || null,
                    available: false,
                    delivery_message: 'Not serviceable to this pincode',
                    delivery_days: null,
                    warehouse_type: null,
                };
            });
            return results;
        }

        // Try Redis batch lookup first
        const keys = items.map(i => `avail:${i.variant_id || i.product_id}:${zoneId}`);
        let cached = [];

        if (zoneId) {
            try {
                cached = await redis.mget(...keys);
            } catch (err) {
                console.warn('[Availability] Redis MGET failed, using DB fallback:', err.message);
                cached = new Array(keys.length).fill(null);
            }
        }

        const results = {};
        const missItems = [];

        items.forEach((item, idx) => {
            const id = item.product_id;
            if (cached[idx]) {
                try {
                    results[id] = { ...JSON.parse(cached[idx]), fromCache: true };
                } catch {
                    missItems.push({ item, key: keys[idx] });
                }
            } else {
                missItems.push({ item, key: keys[idx] });
            }
        });

        availabilityCache(items.length - missItems.length, missItems.length);

        // Compute the misses: one batched DB read for all of them (was: N per-item queries in parallel), and
        // concurrent requests missing the same (variant, zone) share one computation (single-flight).
        if (missItems.length > 0) {
            const dbResults = await this._resolveMisses(missItems, warehousePincodes, zoneId);
            missItems.forEach(({ item }, idx) => {
                results[item.product_id] = dbResults[idx];
            });
        }

        return results;
    }

    /**
     * Resolve cache misses; returns one availability result per miss, in order.
     * - One batched DB read for all misses this call owns (was: N per-item queries in parallel).
     * - Single-flight: concurrent requests missing the same (variant, zone) share one computation. Only when the zone is
     *   known: the cache key is (variant, zone), so a shared result is exactly what a cache hit would have returned. With
     *   no zone (key `...:null`) different pincodes can have different warehouse sets, so nothing is shared or cached
     *   (unchanged from before).
     * - A result derived from a FAILED stock read still answers this request as before ("Out of stock") but is not
     *   written to the cache, so a transient overload error is not served for the next AVAILABILITY_CACHE_TTL seconds.
     */
    async _resolveMisses(missItems, warehousePincodes, zoneId) {
        const out = new Array(missItems.length);
        const owned = [];   // this call computes: { idx, item, key, flightKey, settle }
        const joined = [];  // another in-flight call already computes: { idx, item, promise }

        missItems.forEach(({ item, key }, idx) => {
            if (!zoneId) { owned.push({ idx, item, key, flightKey: null, settle: null }); return; }
            const flightKey = `${key}:q${item.quantity || 1}`;
            const existing = itemFlights.get(flightKey);
            if (existing) { joined.push({ idx, item, promise: existing }); return; }
            let settle;
            const promise = new Promise((resolve) => { settle = resolve; });
            itemFlights.set(flightKey, promise);
            owned.push({ idx, item, key, flightKey, settle });
        });
        availabilityItemFlight(owned.length, joined.length);

        if (owned.length > 0) {
            let batch;
            try {
                batch = await this._computeItemsBatch(owned.map((o) => o.item), warehousePincodes);
            } catch (err) {
                // Unexpected failure (same as the old Promise.all rejecting): release joiners so they recompute.
                owned.forEach((o) => { if (o.flightKey) { itemFlights.delete(o.flightKey); o.settle(undefined); } });
                throw err;
            }
            owned.forEach((o, i) => { out[o.idx] = batch.results[i]; });

            // Write back in one pipeline (only zone-known, only results not derived from a failed read).
            // Awaited so a request arriving right after the flight is released finds the cached value.
            if (zoneId) {
                try {
                    const pipeline = redis.pipeline();
                    owned.forEach((o, i) => {
                        if (batch.ok[i]) pipeline.setex(o.key, AVAILABILITY_CACHE_TTL, JSON.stringify(batch.results[i]));
                    });
                    await pipeline.exec().catch(() => {});
                } catch {
                    // Redis down — skip cache write
                }
            }
            // Cache written first, then the flight is released, then joiners are woken (each gets its own copy).
            owned.forEach((o, i) => {
                if (o.flightKey) { itemFlights.delete(o.flightKey); o.settle({ ...batch.results[i] }); }
            });
        }

        // Owned promises are all settled above BEFORE waiting on anyone else's, so two requests can never wait on each other.
        for (const j of joined) {
            const shared = await j.promise;
            out[j.idx] = shared !== undefined
                ? { ...shared }
                : (await this._computeItemsBatch([j.item], warehousePincodes)).results[0];
        }
        return out;
    }

    /**
     * Availability for many items with a constant number of queries: at most one default-variant lookup (only for items
     * without variant_id) and one inventory read for all variants — instead of one inventory read per item.
     * Decisions come from the same _availabilityFromStock used by checkItemAvailability.
     * @returns {Promise<{ results: object[], ok: boolean[] }>} ok[i] is false when the result came from a failed stock read
     */
    async _computeItemsBatch(items, warehousePincodes) {
        availabilityBatch(items.length);
        const warehouseIds = warehousePincodes.map((wp) => wp.warehouse_id);

        // Variant ids: batched default-variant lookup for items that did not carry one (same rule as before:
        // the product's default variant). A throw here propagates, exactly as it did per item.
        const variantIds = items.map((i) => i.variant_id || null);
        const needDefault = [...new Set(items.filter((i) => !i.variant_id).map((i) => i.product_id))];
        if (needDefault.length > 0) {
            const rows = await prisma.product_variants.findMany({
                where: { product_id: { in: needDefault }, is_default: true },
                select: { id: true, product_id: true },
            });
            const byProduct = new Map();
            for (const r of rows) if (!byProduct.has(r.product_id)) byProduct.set(r.product_id, r.id);
            items.forEach((item, idx) => { if (!item.variant_id) variantIds[idx] = byProduct.get(item.product_id) || null; });
        }

        // One stock read for every distinct variant (same select/include/mapping as checkVariantStock).
        const stockByVariant = new Map();
        let stockFailed = false;
        const distinct = [...new Set(variantIds.filter(Boolean))];
        if (distinct.length > 0) {
            try {
                for (let i = 0; i < distinct.length; i += STOCK_BATCH_CHUNK) {
                    const rows = await prisma.inventory.findMany({
                        where: { variant_id: { in: distinct.slice(i, i + STOCK_BATCH_CHUNK) }, warehouse_id: { in: warehouseIds } },
                        include: {
                            warehouses: {
                                select: { id: true, name: true, type: true, location: true, parent_warehouse_id: true }
                            }
                        }
                    });
                    for (const row of rows) {
                        if (!stockByVariant.has(row.variant_id)) stockByVariant.set(row.variant_id, []);
                        stockByVariant.get(row.variant_id).push({
                            ...row,
                            warehouse: row.warehouses,
                            available_stock: Math.max(0, (row.stock_qty || 0) - (row.reserved_qty || 0))
                        });
                    }
                }
            } catch (error) {
                console.error('Error checking variant stock:', error);
                stockFailed = true; // every item falls to the "Out of stock" answer, as checkVariantStock's null did
            }
        }

        const results = [];
        const ok = [];
        items.forEach((item, idx) => {
            const variantId = variantIds[idx];
            if (!variantId) { results.push(this._variantNotFound(item)); ok.push(true); return; }
            const stockData = stockFailed ? null : (stockByVariant.get(variantId) || []);
            results.push(this._availabilityFromStock(item, variantId, stockData, warehousePincodes));
            ok.push(!stockFailed);
        });
        return { results, ok };
    }

    async getProductsByIds(productIds) {
        try {
            const data = await prisma.products.findMany({
                where: {
                    id: {
                        in: productIds
                    }
                },
                select: {
                    id: true,
                    name: true,
                    status: true
                }
            });

            return data;
        } catch (error) {
            console.error('Error fetching products by IDs:', error);
            throw error;
        }
    }
}

export default new CartAvailabilityDAO();
