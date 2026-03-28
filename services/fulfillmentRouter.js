import subOrderDao from '../dao/sub-order.dao.js';
import fulfillmentEventDao from '../dao/fulfillment-event.dao.js';
import riderAssignmentDao from '../dao/rider-assignment.dao.js';
import prisma from '../config/prisma.js';

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
            } else {
                // Division or Seller — needs rider
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

    return results;
};

// ================================================================
// ZONAL ROUTING (No rider needed)
// ================================================================

/**
 * Route to zonal warehouse in-house delivery system.
 * Sets status and would trigger webhook/event in production.
 */
const routeZonal = async (subOrder) => {
    await subOrderDao.updateStatus(subOrder.id, 'dispatched_to_zonal_delivery');

    await fulfillmentEventDao.log(subOrder.id, 'dispatched_to_zonal', {
        warehouse_id: subOrder.source_id,
        warehouse_name: subOrder.warehouse?.name,
        message: 'Dispatched to zonal warehouse in-house delivery system',
    });

    // TODO: In production, trigger webhook to zonal warehouse system
    // await triggerZonalWebhook(subOrder);

    return {
        sub_order_id: subOrder.id,
        status: 'dispatched_to_zonal_delivery',
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
 * Standard rider assignment flow:
 * 1. Find available rider in the delivery zone
 * 2. Build pickup sequence (sellers first, division last)
 * 3. Assign rider
 * Retries up to 3 times with exponential backoff before setting status = rider_pending.
 */
const assignStandardRider = async (subOrder, orderId) => {
    const parentOrder = await prisma.orders.findUnique({
        where: { id: orderId },
        select: { delivery_pincode: true },
    });

    // Find available riders in the delivery zone (with retry)
    const rider = await withRetry(() => findAvailableRider(parentOrder.delivery_pincode));

    if (!rider) {
        // No rider available — queue for retry
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
 * Find an available rider in the delivery zone for a given pincode
 */
const findAvailableRider = async (pincode) => {
    // Find warehouses serving this pincode
    const warehousePincodes = await prisma.warehouse_pincodes.findMany({
        where: { pincode, is_active: true },
        select: { warehouse_id: true },
    });

    const warehouseIds = warehousePincodes.map((wp) => wp.warehouse_id);
    if (warehouseIds.length === 0) return null;

    // Find riders assigned to these warehouses who are available
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
                    user: {
                        select: { id: true, name: true, phone: true },
                    },
                },
            },
        },
    });

    return warehouseRider?.riders || null;
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

    // Find a new rider
    const newRider = await findAvailableRider(parentOrder.delivery_pincode);

    if (!newRider) {
        // Queue for retry
        const subOrders = await subOrderDao.listByOrderId(assignment.order_id);
        for (const so of subOrders) {
            if (so.source_type !== 'zonal' && so.fulfillment_status !== 'cancelled') {
                await subOrderDao.updateStatus(so.id, 'rider_pending');
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
};
