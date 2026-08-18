import subOrderDao from '../dao/sub-order.dao.js';
import fulfillmentEventDao from '../dao/fulfillment-event.dao.js';
import riderAssignmentDao from '../dao/rider-assignment.dao.js';
import prisma from '../config/prisma.js';
import { updateParentOrderStatusFromSubOrders } from './orderFulfillmentService.js';
import { calculateDistanceKm } from '../utils/distanceUtils.js';
import { checkProductAvailability } from './fulfillmentService.js';
import { handleSellerCancellation } from './subOrderService.js';

// Radius expansion tiers (km) tried in order after the exact-pincode match
// fails. Hard-capped at 10km — never searches further than that.
const RIDER_SEARCH_RADIUS_TIERS_KM = [3, 6, 10];

/**
 * Fulfillment Router
 * After sub-orders are created, routes each one:
 *  - Zonal → notify in-house delivery (no rider needed)
 *  - Division/Seller → assign rider (evaluate basket-size rule)
 */

// ================================================================
// MAIN ROUTING
// ================================================================

/**
 * Route all sub-orders for a given master order.
 * Called immediately after order placement + sub-order creation.
 */
export const routeSubOrders = async (orderId) => {
    const subOrders = await subOrderDao.listByOrderId(orderId);
    const results = [];

    for (const subOrder of subOrders) {
        try {
            if (subOrder.source_type === 'zonal') {
                const result = await routeZonal(subOrder);
                results.push(result);
            } else if (subOrder.source_type === 'division') {
                // Division orders: keep pending — admin will accept and assign rider
                const result = await routeDivision(subOrder);
                results.push(result);
            } else if (subOrder.source_type === 'seller') {
                // Seller orders: assign rider immediately
                const result = await routeWithRider(subOrder, orderId);
                results.push(result);
            }
        } catch (err) {
            console.error(`Error routing sub-order ${subOrder.id}:`, err.message);
            results.push({
                sub_order_id: subOrder.id,
                status: 'error',
                error: err.message,
            });
        }
    }

    // Update parent order status based on all sub-orders' aggregate state
    await updateParentOrderStatusFromSubOrders(orderId);

    return results;
};

// ================================================================
// DIVISION ROUTING (Admin acceptance required, then rider assignment)
// ================================================================

/**
 * Route division order: keep pending until admin accepts it.
 * Admin will then assign a rider when accepting the order.
 */
const routeDivision = async (subOrder) => {
    // Division orders start as pending — admin will accept them
    // Rider assignment happens after admin acceptance, not during order creation

    await fulfillmentEventDao.log(subOrder.id, 'division_routing', {
        warehouse_id: subOrder.source_id,
        warehouse_name: subOrder.warehouse?.name,
        message: 'Division order created — awaiting admin acceptance',
    });

    return {
        sub_order_id: subOrder.id,
        status: 'pending',
        rider_needed: true,
    };
};

// ================================================================
// ZONAL ROUTING (No rider needed)
// ================================================================

/**
 * Route zonal order: keep pending until admin accepts it.
 * Admin will then transition it to dispatched_to_zonal_delivery status.
 * Zonal orders don't need rider assignment like division orders.
 */
const routeZonal = async (subOrder) => {
    // Zonal orders start as pending — admin will accept them
    // No automatic rider assignment needed for zonal orders

    await fulfillmentEventDao.log(subOrder.id, 'zonal_routing', {
        warehouse_id: subOrder.source_id,
        warehouse_name: subOrder.warehouse?.name,
        message: 'Zonal order created — awaiting admin acceptance',
    });

    return {
        sub_order_id: subOrder.id,
        status: 'pending',
        rider_needed: false,
    };
};

// ================================================================
// RIDER-BASED ROUTING (Division & Seller)
// ================================================================

/**
 * Route sub-order that needs a rider.
 * Evaluates basket-size rule and assigns rider.
 */
const routeWithRider = async (subOrder, orderId) => {
    // Evaluate basket-size rule
    const nonZonalStops = await subOrderDao.countNonZonalSourcesForOrder(orderId);

    if (nonZonalStops > 10) {
        // Large basket → use Division Dispatch System
        return await routeViaDivisionDispatch(subOrder, orderId);
    }

    // Standard rider assignment
    return await assignStandardRider(subOrder, orderId);
};

/**
 * Retry a function with exponential backoff.
 * @param {Function} fn        — async function to retry
 * @param {number}   maxRetries
 * @param {number}   baseDelayMs — initial delay (doubles each attempt)
 */
const withRetry = async (fn, maxRetries = 3, baseDelayMs = 1000) => {
    let lastErr;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            if (attempt < maxRetries) {
                const delay = baseDelayMs * Math.pow(2, attempt);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    throw lastErr;
};

/**
 * Check whether at least one alternate source (another seller, or a
 * warehouse — whichever checkProductAvailability's current priority finds
 * first) can fulfill every item in this sub-order, excluding the given
 * seller. Used to decide whether it's safe to reroute a rider-starved
 * seller sub-order. Rerouting when no alternate exists would incorrectly
 * cancel items the seller still has in stock, just because a rider wasn't
 * found — a rider shortage is not a stock problem and must never trigger
 * an automatic cancellation.
 */
const hasAlternateSource = async (subOrder, deliveryPincode, excludeSellerId) => {
    const items = subOrder.sub_order_items || [];
    if (items.length === 0) return false;

    for (const item of items) {
        const availability = await checkProductAvailability(
            item.product_id,
            item.variant_id,
            deliveryPincode,
            item.quantity,
            [excludeSellerId]
        );
        if (!availability.available) return false;
    }
    return true;
};

/**
 * Standard rider assignment flow:
 * 1. Find available rider in the delivery zone
 * 2. Build pickup sequence (sellers first, division last)
 * 3. Assign rider
 * Retries up to 3 times with exponential backoff before setting status = rider_pending.
 */
const assignStandardRider = async (subOrder, orderId) => {
    const parentOrder = await prisma.orders.findUnique({
        where: { id: orderId },
        select: { delivery_pincode: true, delivery_latitude: true, delivery_longitude: true },
    });

    // Find available riders in the delivery zone (with retry), expanding
    // search radius in bounded tiers if the exact pincode has none.
    const deliveryLat = parentOrder.delivery_latitude ? Number(parentOrder.delivery_latitude) : null;
    const deliveryLon = parentOrder.delivery_longitude ? Number(parentOrder.delivery_longitude) : null;
    const rider = await withRetry(() => findAvailableRider(parentOrder.delivery_pincode, deliveryLat, deliveryLon));

    if (!rider) {
        // No rider available even after full radius expansion (Task 5) —
        // always alert admin. fulfillment_events is already surfaced on the
        // admin sub-order detail/list endpoints, so this needs no new
        // notification channel.
        await fulfillmentEventDao.log(subOrder.id, 'no_rider_available_alert', {
            source_type: subOrder.source_type,
            source_id: subOrder.source_id,
            seller_id: subOrder.seller_id,
            pincode: parentOrder.delivery_pincode,
            message: 'No rider available after full radius search (up to 10km) — needs admin attention',
        });

        // For seller sub-orders only: try one more path before parking —
        // reroute to an alternate source, but only if one can actually
        // fulfill every item. Never cancels outright.
        if (subOrder.source_type === 'seller' && subOrder.seller_id) {
            const alternateExists = await hasAlternateSource(subOrder, parentOrder.delivery_pincode, subOrder.seller_id);
            if (alternateExists) {
                const rerouteResult = await handleSellerCancellation(subOrder.id, subOrder.seller_id, {
                    // Includes 'rider_pending' — this branch also runs when the
                    // cron retries an already-rider_pending sub-order, not just
                    // on first assignment attempt.
                    allowedFromStatuses: ['pending', 'confirmed', 'rider_pending'],
                });
                if (rerouteResult.rerouted) {
                    await fulfillmentEventDao.log(subOrder.id, 'rerouted_after_no_rider', {
                        reason: 'No rider found after full radius search; an alternate source was available',
                    });
                    return {
                        sub_order_id: subOrder.id,
                        status: 'rerouted',
                        rider_needed: true,
                        rider_assigned: false,
                        rerouted: true,
                    };
                }
                // rerouteResult.rerouted === false means the atomic claim lost a
                // race (already transitioned elsewhere) — fall through safely.
            }
        }

        // No alternate source, or no reroute happened — queue for retry.
        // Never auto-cancelled for rider unavailability alone.
        await subOrderDao.updateStatus(subOrder.id, 'rider_pending');

        await fulfillmentEventDao.log(subOrder.id, 'rider_pending', {
            reason: 'No riders available in delivery zone',
            will_retry_at: new Date(Date.now() + 3 * 60 * 1000).toISOString(),
        });

        return {
            sub_order_id: subOrder.id,
            status: 'rider_pending',
            rider_needed: true,
            rider_assigned: false,
        };
    }

    // Build pickup sequence for all non-zonal sub-orders of this order
    const allNonZonalSubOrders = await prisma.sub_orders.findMany({
        where: {
            parent_order_id: orderId,
            source_type: { not: 'zonal' },
            fulfillment_status: { notIn: ['cancelled', 'delivered'] },
        },
        include: {
            warehouse: {
                select: { id: true, name: true, type: true, location: true, address: true },
            },
        },
        orderBy: { source_type: 'asc' }, // seller first, then division (alphabetical)
    });

    // Build pickup sequence: sellers first, division last
    const sellerStops = allNonZonalSubOrders
        .filter((so) => so.source_type === 'seller')
        .map((so) => ({
            sub_order_id: so.id,
            source_type: so.source_type,
            source_id: so.source_id,
            warehouse_name: so.warehouse?.name,
            address: so.warehouse?.address || so.warehouse?.location,
            picked_up: false,
        }));

    const divisionStops = allNonZonalSubOrders
        .filter((so) => so.source_type === 'division')
        .map((so) => ({
            sub_order_id: so.id,
            source_type: so.source_type,
            source_id: so.source_id,
            warehouse_name: so.warehouse?.name,
            address: so.warehouse?.address || so.warehouse?.location,
            picked_up: false,
        }));

    const pickupSequence = [...sellerStops, ...divisionStops];

    // Create rider assignment
    const assignment = await riderAssignmentDao.create({
        rider_id: rider.id,
        order_id: orderId,
        pickup_sequence: pickupSequence,
        pickup_status: {},
    });

    // Update all non-zonal sub-orders with rider info
    for (const so of allNonZonalSubOrders) {
        await subOrderDao.updateStatus(so.id, 'confirmed', {
            rider_id: rider.id,
            pickup_sequence: pickupSequence,
        });

        await fulfillmentEventDao.log(so.id, 'rider_assigned', {
            rider_id: rider.id,
            assignment_id: assignment.id,
            pickup_sequence: pickupSequence,
        });
    }

    // Mark rider as busy
    await prisma.riders.update({
        where: { id: rider.id },
        data: { is_available: false },
    });

    return {
        sub_order_id: subOrder.id,
        status: 'confirmed',
        rider_needed: true,
        rider_assigned: true,
        rider_id: rider.id,
        assignment_id: assignment.id,
        pickup_sequence: pickupSequence,
    };
};

/**
 * Division Dispatch System routing (for large baskets >10 stops)
 * Groups nearby sellers for efficient pickup sequence.
 */
const routeViaDivisionDispatch = async (subOrder, orderId) => {
    // For now, use the same standard assignment but log it as division dispatch
    await fulfillmentEventDao.log(subOrder.id, 'division_dispatch_triggered', {
        reason: 'Basket size exceeds 10 non-zonal stops',
        order_id: orderId,
    });

    // In production, this would call the division's more sophisticated routing API
    return await assignStandardRider(subOrder, orderId);
};

// ================================================================
// RIDER LOOKUP
// ================================================================

/**
 * Warehouse ids serving a pincode exactly (Tier 0 — existing behavior, unchanged).
 */
const getWarehouseIdsForPincode = async (pincode) => {
    const warehousePincodes = await prisma.warehouse_pincodes.findMany({
        where: { pincode, is_active: true },
        select: { warehouse_id: true },
    });
    return warehousePincodes.map((wp) => wp.warehouse_id);
};

/**
 * First available, verified rider assigned to any of the given warehouses.
 * Extracted so both the exact-pincode tier and the radius-expansion tiers
 * share one query implementation instead of duplicating it.
 */
const findAvailableRiderAtWarehouseIds = async (warehouseIds) => {
    if (!warehouseIds || warehouseIds.length === 0) return null;

    const warehouseRider = await prisma.warehouse_riders.findFirst({
        where: {
            warehouse_id: { in: warehouseIds },
            is_active: true,
            riders: {
                is_active: true,
                is_available: true,
                verification_status: 'VERIFIED',
            },
        },
        include: {
            riders: {
                include: {
                    users: {
                        select: { id: true, name: true, phone: true },
                    },
                },
            },
        },
    });

    return warehouseRider?.riders || null;
};

/**
 * Active warehouses within `radiusKm` of a point, nearest-first, excluding
 * any warehouse ids already tried by an earlier tier. Distance is computed
 * in memory (haversine) since warehouse counts are small — no PostGIS needed.
 */
const getActiveWarehousesWithinRadius = async (lat, lon, radiusKm, excludeWarehouseIds = []) => {
    const warehouses = await prisma.warehouses.findMany({
        where: {
            is_active: true,
            latitude: { not: null },
            longitude: { not: null },
            id: excludeWarehouseIds.length > 0 ? { notIn: excludeWarehouseIds } : undefined,
        },
        select: { id: true, latitude: true, longitude: true },
    });

    return warehouses
        .map((w) => ({
            id: w.id,
            distanceKm: calculateDistanceKm(lat, lon, Number(w.latitude), Number(w.longitude)),
        }))
        .filter((w) => w.distanceKm <= radiusKm)
        .sort((a, b) => a.distanceKm - b.distanceKm);
};

/**
 * Find an available rider for a delivery, expanding the search radius in
 * bounded tiers if the exact pincode has no available rider.
 *
 * Tier 0: warehouses mapped to the exact delivery pincode (existing behavior).
 * Tiers 1-3: warehouses within 3km / 6km / 10km of the delivery point,
 *   nearest warehouse tried first — hard-capped at 10km.
 *
 * `deliveryLat`/`deliveryLon` are optional — without them, radius expansion
 * is skipped entirely and this behaves exactly as before (Tier 0 only),
 * since there's no point to expand the search around.
 */
export const findAvailableRider = async (pincode, deliveryLat = null, deliveryLon = null) => {
    const exactWarehouseIds = await getWarehouseIdsForPincode(pincode);

    const tier0Rider = await findAvailableRiderAtWarehouseIds(exactWarehouseIds);
    if (tier0Rider) return tier0Rider;

    if (!deliveryLat || !deliveryLon) return null;

    const triedWarehouseIds = [...exactWarehouseIds];
    for (const radiusKm of RIDER_SEARCH_RADIUS_TIERS_KM) {
        const candidates = await getActiveWarehousesWithinRadius(deliveryLat, deliveryLon, radiusKm, triedWarehouseIds);
        for (const candidate of candidates) {
            const rider = await findAvailableRiderAtWarehouseIds([candidate.id]);
            triedWarehouseIds.push(candidate.id);
            if (rider) return rider;
        }
    }

    return null;
};

// ================================================================
// RIDER FAILURE HANDLING
// ================================================================

/**
 * Handle rider cancellation or going offline mid-delivery.
 * Re-assigns to next available rider, preserving pickup state.
 */
export const handleRiderFailure = async (assignmentId) => {
    const assignment = await riderAssignmentDao.getById(assignmentId);
    if (!assignment) throw new Error('Assignment not found');

    const parentOrder = assignment.order;

    // Find a new rider, expanding search radius in bounded tiers if needed.
    const deliveryLat = parentOrder.delivery_latitude ? Number(parentOrder.delivery_latitude) : null;
    const deliveryLon = parentOrder.delivery_longitude ? Number(parentOrder.delivery_longitude) : null;
    const newRider = await findAvailableRider(parentOrder.delivery_pincode, deliveryLat, deliveryLon);

    if (!newRider) {
        // No replacement rider even after full radius expansion — alert
        // admin (per affected sub-order, since fulfillment_events requires a
        // sub_order_id), then queue each for retry as before. Mid-delivery,
        // rerouting to an alternate source doesn't make sense (the original
        // rider may have already picked up) — only a new rider can resolve
        // this, so no reroute attempt here, unlike the initial-assignment
        // case above.
        const subOrders = await subOrderDao.listByOrderId(assignment.order_id);
        for (const so of subOrders) {
            if (so.source_type !== 'zonal' && so.fulfillment_status !== 'cancelled') {
                await subOrderDao.updateStatus(so.id, 'rider_pending');
                await fulfillmentEventDao.log(so.id, 'no_replacement_rider_alert', {
                    assignment_id: assignmentId,
                    old_rider_id: assignment.rider_id,
                    message: 'Rider failure with no replacement available after full radius search — needs admin attention',
                });
                await fulfillmentEventDao.log(so.id, 'rider_reassignment_pending', {
                    old_rider_id: assignment.rider_id,
                    reason: 'No replacement rider available',
                });
            }
        }
        return { reassigned: false, reason: 'No replacement rider available' };
    }

    // Reassign (preserves pickup_status so new rider knows what's picked)
    const newAssignment = await riderAssignmentDao.reassign(assignmentId, newRider.id);

    // Update sub-orders with new rider
    const subOrders = await subOrderDao.listByOrderId(assignment.order_id);
    for (const so of subOrders) {
        if (so.rider_id === assignment.rider_id) {
            await subOrderDao.updateStatus(so.id, so.fulfillment_status, {
                rider_id: newRider.id,
            });
            await fulfillmentEventDao.log(so.id, 'rider_reassigned', {
                old_rider_id: assignment.rider_id,
                new_rider_id: newRider.id,
                pickup_state_preserved: true,
            });
        }
    }

    // Free old rider, mark new one busy
    await prisma.riders.update({
        where: { id: assignment.rider_id },
        data: { is_available: true },
    });
    await prisma.riders.update({
        where: { id: newRider.id },
        data: { is_available: false },
    });

    return {
        reassigned: true,
        new_rider_id: newRider.id,
        new_assignment_id: newAssignment.id,
    };
};

export default {
    routeSubOrders,
    handleRiderFailure,
    findAvailableRider,
};
