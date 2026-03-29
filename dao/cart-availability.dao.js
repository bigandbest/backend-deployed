import prisma from "../config/prisma.js";
import redis from "../config/redis.js";

const AVAILABILITY_CACHE_TTL = parseInt(process.env.AVAILABILITY_CACHE_TTL || '60', 10);

class CartAvailabilityDAO {
    /**
     * Get active warehouses that service a specific pincode
     * @param {string} pincode - The delivery pincode
     * @returns {Promise<Array>} Array of warehouses with pincode details
     */
    async getWarehousesByPincode(pincode) {
        try {
            // 1. Direct Warehouse Mapping
            const directMappings = await prisma.warehouse_pincodes.findMany({
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
            });

            // 2. Zone-based Mapping
            // 2a. Find zones for this pincode
            const zoneMappings = await prisma.zone_pincodes.findMany({
                where: { pincode: pincode, is_active: true },
                select: { zone_id: true }
            });

            // 2b. Find nationwide zones
            const nationwideZones = await prisma.delivery_zones.findMany({
                where: { is_nationwide: true, is_active: true },
                select: { id: true }
            });

            const zoneIds = [
                ...zoneMappings.map(z => z.zone_id),
                ...nationwideZones.map(z => z.id)
            ];

            let zoneWarehouses = [];
            if (zoneIds.length > 0) {
                // 2c. Find warehouses serving these zones
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

                // Map to same format as direct mappings
                // Note: Zone mappings don't have per-pincode delivery_days stored, so we use defaults or logic
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
            return [];
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

        // Check stock across warehouses
        const stockData = await this.checkVariantStock(variantId, warehouseIds);

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
        try {
            const zoneMapping = await prisma.zone_pincodes.findFirst({
                where: { pincode, is_active: true },
                select: { zone_id: true }
            });
            if (zoneMapping) return String(zoneMapping.zone_id);

            // Check nationwide zones as fallback
            const nationwide = await prisma.delivery_zones.findFirst({
                where: { is_nationwide: true, is_active: true },
                select: { id: true }
            });
            return nationwide ? `nationwide_${nationwide.id}` : null;
        } catch (error) {
            console.error('Error getting zone for pincode:', error);
            return null;
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

        const zoneId = await this.getZoneForPincode(pincode);
        const warehousePincodes = await this.getWarehousesByPincode(pincode);

        if (!warehousePincodes || warehousePincodes.length === 0) {
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

        // Fetch DB misses in parallel
        if (missItems.length > 0) {
            const dbResults = await Promise.all(
                missItems.map(({ item }) => this.checkItemAvailability(item, warehousePincodes))
            );

            // Write back all misses in one pipeline (fire-and-forget)
            if (zoneId) {
                try {
                    const pipeline = redis.pipeline();
                    missItems.forEach(({ key }, idx) => {
                        pipeline.setex(key, AVAILABILITY_CACHE_TTL, JSON.stringify(dbResults[idx]));
                    });
                    pipeline.exec().catch(() => {});
                } catch {
                    // Redis down — skip cache write
                }
            }

            missItems.forEach(({ item }, idx) => {
                results[item.product_id] = dbResults[idx];
            });
        }

        return results;
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
