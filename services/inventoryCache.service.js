import redis from '../config/redis.js';
import prisma from '../config/prisma.js';

/**
 * Invalidate Redis availability cache when stock changes for a variant.
 * Busts all zone-specific cache keys for the affected variant.
 *
 * Call this after every stock update (fulfillment, receiving, returns, order placement).
 *
 * @param {string} variantId - The product variant ID
 * @param {number} warehouseId - The warehouse whose stock changed
 */
export async function invalidateAvailabilityCache(variantId, warehouseId) {
    try {
        // Get every zone this warehouse serves
        const warehouseZones = await prisma.warehouse_zones.findMany({
            where: { warehouse_id: warehouseId, is_active: true },
            select: { zone_id: true },
        });

        // Also get direct pincode mappings for this warehouse
        const warehousePincodes = await prisma.warehouse_pincodes.findMany({
            where: { warehouse_id: warehouseId, is_active: true },
            select: { pincode: true },
        });

        // For direct pincodes, resolve their zones
        const pincodeZones = [];
        if (warehousePincodes.length > 0) {
            const pincodes = warehousePincodes.map(wp => wp.pincode);
            const zoneMappings = await prisma.zone_pincodes.findMany({
                where: { pincode: { in: pincodes }, is_active: true },
                select: { zone_id: true },
                distinct: ['zone_id'],
            });
            pincodeZones.push(...zoneMappings.map(z => z.zone_id));
        }

        // Also include nationwide zones
        const nationwideZones = await prisma.delivery_zones.findMany({
            where: { is_nationwide: true, is_active: true },
            select: { id: true },
        });

        // Combine all zone IDs (deduplicated)
        const allZoneIds = new Set([
            ...warehouseZones.map(z => String(z.zone_id)),
            ...pincodeZones.map(z => String(z)),
            ...nationwideZones.map(z => `nationwide_${z.id}`),
        ]);

        if (allZoneIds.size === 0) return;

        const keys = Array.from(allZoneIds).map(zoneId => `avail:${variantId}:${zoneId}`);

        await redis.del(...keys);
        console.log(`[Cache] Busted ${keys.length} availability keys for variant ${variantId}`);
    } catch (err) {
        // Cache invalidation failure should never break the stock update flow
        console.error('[Cache] Failed to invalidate availability cache:', err.message);
    }
}

/**
 * Invalidate availability cache for multiple variants at once.
 * Useful when processing bulk stock updates or order fulfillment.
 *
 * @param {Array<{variantId: string, warehouseId: number}>} items
 */
export async function invalidateBulkAvailabilityCache(items) {
    await Promise.all(
        items.map(({ variantId, warehouseId }) =>
            invalidateAvailabilityCache(variantId, warehouseId)
        )
    );
}

export default { invalidateAvailabilityCache, invalidateBulkAvailabilityCache };
