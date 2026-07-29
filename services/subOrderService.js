import subOrderDao from '../dao/sub-order.dao.js';
import subOrderItemDao from '../dao/sub-order-item.dao.js';
import fulfillmentEventDao from '../dao/fulfillment-event.dao.js';
import { checkProductAvailability } from './fulfillmentService.js';
import prisma from '../config/prisma.js';
import { updateParentOrderStatusFromSubOrders } from './orderFulfillmentService.js';
import { notifySellerNewOrder, getToken } from './notificationService.js';
import { sellerAcceptTimeoutQueue } from '../config/bullmq.js';

// How long a seller has to accept/reject an allocated sub-order before it
// auto-falls-back to warehouse (division → zonal). Confirmed value: 10 minutes.
const SELLER_ACCEPT_WINDOW_MS = 10 * 60 * 1000;

/**
 * Sub-Order Service
 * Groups resolved cart items by source and creates sub-orders.
 * Handles seller cancellation re-routing and stock mismatch flows.
 */

// ================================================================
// SUB-ORDER CREATION
// ================================================================

/**
 * Create sub-orders from resolved cart items.
 * Groups items by { source_type, source_id } → one sub-order per group.
 * 
 * @param {string} orderId - Master order ID
 * @param {Array} resolvedItems - Items with source resolution from fulfillmentService
 * @returns {Array} Created sub-orders
 */
export const createSubOrders = async (orderId, resolvedItems, tx = null, deferredSideEffects = null) => {
    // When running inside a transaction, all reads/writes must go through the
    // same `tx` client — a default-client query cannot see rows this
    // still-open transaction has written (uncommitted), and a default-client
    // WRITE referencing one of them (e.g. a fulfillment_events row whose
    // sub_order_id FKs an uncommitted sub_order) would fail or deadlock.
    const db = tx || prisma;

    // Group items by source
    const groups = new Map();

    for (const item of resolvedItems) {
        const key = `${item.source_type}_${item.source_id}_${item.seller_id || 'null'}`;
        if (!groups.has(key)) {
            groups.set(key, {
                source_type: item.source_type,
                source_id: item.source_id,
                seller_id: item.seller_id || null,
                estimated_delivery_minutes: item.estimated_delivery_minutes,
                items: [],
            });
        }
        groups.get(key).items.push(item);
    }

    // Only fetch order/customer details if at least one group needs a seller
    // notification — avoids the extra query entirely for warehouse-only orders.
    const hasSellerGroup = [...groups.values()].some((g) => g.source_type === 'seller');
    let notifyContext = null;
    if (hasSellerGroup) {
        const order = await db.orders.findUnique({
            where: { id: orderId },
            select: { receiver_name: true, user_id: true },
        });
        let customerName = order?.receiver_name;
        if (!customerName && order?.user_id) {
            const user = await db.users.findUnique({
                where: { id: order.user_id },
                select: { name: true },
            });
            customerName = user?.name;
        }
        notifyContext = { customerName: customerName || 'A customer' };
    }

    const createdSubOrders = [];
    // Descriptors for external seller side-effects (push notification +
    // accept-timeout job). Collected here and dispatched only AFTER all DB
    // writes are done — see the dispatch decision at the end of the function.
    const sellerNotifications = [];

    for (const [, group] of groups) {
        // Calculate estimated delivery time
        const estimatedDelivery = new Date(
            Date.now() + (group.estimated_delivery_minutes || 120) * 60 * 1000
        );

        // Create the sub-order
        const isSellerGroup = group.source_type === 'seller' && group.seller_id;
        const subOrder = await subOrderDao.create({
            parent_order_id: orderId,
            source_type: group.source_type,
            source_id: group.source_id,
            seller_id: group.seller_id,
            fulfillment_status: 'pending',
            estimated_delivery_at: estimatedDelivery,
            assigned_at: isSellerGroup ? new Date() : null,
        }, tx);

        // Create sub-order items
        await subOrderItemDao.createMany(
            group.items.map((item) => ({
                sub_order_id: subOrder.id,
                product_id: item.product_id,
                variant_id: item.variant_id,
                quantity: item.quantity,
                unit_price: parseFloat(item.price) || 0,
            })),
            tx
        );

        // Log creation event — MUST use the same tx: fulfillment_events.sub_order_id
        // is a FK to sub_orders.id, and the sub_order above may be uncommitted.
        await fulfillmentEventDao.log(subOrder.id, 'created', {
            source_type: group.source_type,
            source_id: group.source_id,
            seller_id: group.seller_id,
            item_count: group.items.length,
        }, tx);

        if (isSellerGroup) {
            const subOrderTotal = group.items.reduce(
                (sum, item) => sum + (parseFloat(item.price) || 0) * (item.quantity || 1),
                0
            );
            sellerNotifications.push({
                subOrderId: subOrder.id,
                sellerId: group.seller_id,
                orderId,
                customerName: notifyContext.customerName,
                subOrderTotal: subOrderTotal.toFixed(2),
            });
        }

        createdSubOrders.push(subOrder);
    }

    // Seller side-effects (push notification + accept-timeout job) are EXTERNAL,
    // non-transactional actions. When createSubOrders runs inside a DB
    // transaction (tx provided) AND the caller passed a deferredSideEffects
    // sink, hand them off so the caller dispatches them AFTER commit — otherwise
    // a rollback would leave a spurious push sent and an orphan timeout job for a
    // sub-order that no longer exists. With no transaction, dispatch inline.
    if (sellerNotifications.length > 0) {
        if (tx && deferredSideEffects) {
            deferredSideEffects.push(...sellerNotifications);
        } else {
            for (const notification of sellerNotifications) {
                await dispatchSellerAllocation(notification);
            }
        }
    }

    return createdSubOrders;
};

/**
 * Dispatch the external side-effects of allocating a sub-order to a seller:
 * a push notification and the accept-timeout BullMQ job. Both are non-fatal —
 * a failure here must never break order/sub-order creation; the seller still
 * sees the pending sub-order in-app. Kept separate from the DB writes in
 * createSubOrders so it can run AFTER a transaction commits (see the deferral
 * logic there), never mid-transaction where a rollback would orphan its effects.
 *
 * @param {{subOrderId, sellerId, orderId, customerName, subOrderTotal}} notification
 */
export const dispatchSellerAllocation = async ({ subOrderId, sellerId, orderId, customerName, subOrderTotal }) => {
    // Push notification
    try {
        const seller = await prisma.sellers.findUnique({
            where: { id: sellerId },
            select: { user_id: true },
        });
        const token = seller?.user_id ? await getToken(seller.user_id) : null;
        if (token) {
            await notifySellerNewOrder(token, orderId, customerName, subOrderTotal);
        }
    } catch (notifyErr) {
        console.error(`Seller notification failed for sub-order ${subOrderId}:`, notifyErr.message);
    }

    // Accept-timeout job — fires once at the deadline and auto-rejects (falling
    // back to warehouse) if the seller hasn't responded by then. jobId keyed on
    // sub-order id so this is idempotent if it were ever dispatched twice.
    try {
        await sellerAcceptTimeoutQueue.add(
            'seller-accept-timeout',
            { subOrderId, sellerId },
            { delay: SELLER_ACCEPT_WINDOW_MS, jobId: `seller-accept-timeout:${subOrderId}` }
        );
    } catch (queueErr) {
        console.error(`Failed to schedule accept-timeout job for sub-order ${subOrderId}:`, queueErr.message);
    }
};

// ================================================================
// SELLER CANCELLATION RE-ROUTING
// ================================================================

/**
 * Handle seller cancellation or rejection.
 *
 * Flow:
 * 1. Atomically claim the cancellation (guards against racing with an accept
 *    or another concurrent cancellation of the same sub-order)
 * 2. Remove seller's products from sub-order
 * 3. Re-run availability check (Division→Zonal→next eligible Seller)
 * 4. If new source found → create new sub-order
 * 5. If no source → mark as cancelled, issue partial refund
 *
 * IMPORTANT: Does NOT affect other sub-orders in the same master order.
 *
 * @param {string} subOrderId
 * @param {string} cancelledSellerId
 * @param {object} [options]
 * @param {string[]} [options.allowedFromStatuses] - which current statuses this
 *   cancellation is allowed to claim from. Explicit seller reject (via the
 *   accept/reject API) allows ['pending','confirmed'] — a seller can reject
 *   even after accepting. The accept-timeout job passes ['pending'] only, so
 *   it can never cancel an order the seller already explicitly accepted.
 */
export const handleSellerCancellation = async (
    subOrderId,
    cancelledSellerId,
    { allowedFromStatuses = ['pending', 'confirmed'] } = {}
) => {
    // Atomic claim FIRST — before any reroute work or event logging. If this
    // sub-order already moved on (accepted, or already cancelled by a racing
    // caller), this is a safe no-op rather than a duplicate cancellation +
    // duplicate re-route.
    const claimed = await subOrderDao.tryTransitionStatus(subOrderId, allowedFromStatuses, 'cancelled');
    if (!claimed) {
        return { rerouted: false, reason: 'ALREADY_TRANSITIONED' };
    }

    const subOrder = await subOrderDao.getById(subOrderId);
    if (!subOrder) throw new Error('Sub-order not found');

    const parentOrder = await prisma.orders.findUnique({
        where: { id: subOrder.parent_order_id },
        select: { id: true, delivery_pincode: true, user_id: true },
    });

    if (!parentOrder) throw new Error('Parent order not found');

    // Log cancellation event
    await fulfillmentEventDao.log(subOrderId, 'seller_rejected', {
        seller_id: cancelledSellerId,
        reason: 'Seller cancelled or rejected the sub-order',
    });

    // Update parent order status based on all sub-orders' aggregate state
    await updateParentOrderStatusFromSubOrders(subOrder.parent_order_id);

    // Get items that need re-routing
    const itemsToReroute = subOrder.sub_order_items || [];

    if (itemsToReroute.length === 0) return { rerouted: false, reason: 'No items to reroute' };

    const reroutedItems = [];
    const cancelledItems = [];

    for (const item of itemsToReroute) {
        // Re-run availability check EXCLUDING the cancelled seller
        const availability = await checkProductAvailability(
            item.product_id,
            item.variant_id,
            parentOrder.delivery_pincode,
            item.quantity,
            [cancelledSellerId] // Exclude the cancelling seller
        );

        if (availability.available) {
            reroutedItems.push({
                product_id: item.product_id,
                variant_id: item.variant_id,
                quantity: item.quantity,
                price: parseFloat(item.unit_price) || 0,
                source_type: availability.source_type,
                source_id: availability.source_id,
                seller_id: availability.seller_id || null,
                estimated_delivery_minutes: availability.estimated_delivery_minutes,
                warehouse_name: availability.warehouse_name,
            });
        } else {
            cancelledItems.push({
                product_id: item.product_id,
                variant_id: item.variant_id,
                quantity: item.quantity,
                unit_price: item.unit_price,
                reason: 'No alternative source available',
            });
        }
    }

    // Create new sub-orders for rerouted items
    let newSubOrders = [];
    if (reroutedItems.length > 0) {
        newSubOrders = await createSubOrders(parentOrder.id, reroutedItems);

        await fulfillmentEventDao.log(subOrderId, 'rerouted', {
            new_sub_order_ids: newSubOrders.map((so) => so.id),
            rerouted_item_count: reroutedItems.length,
        });
    }

    // Handle cancelled items (would trigger refund in production)
    if (cancelledItems.length > 0) {
        await fulfillmentEventDao.log(subOrderId, 'items_cancelled_no_source', {
            cancelled_items: cancelledItems,
            refund_required: true,
        });
    }

    return {
        rerouted: reroutedItems.length > 0,
        new_sub_orders: newSubOrders,
        cancelled_items: cancelledItems,
        rerouted_items: reroutedItems,
    };
};

// ================================================================
// STOCK MISMATCH HANDLING (Division warehouse)
// ================================================================

/**
 * Handle stock mismatch at a division warehouse (discovered at pickup).
 * Same flow as seller cancellation but also logs the mismatch for auditing.
 */
export const handleStockMismatch = async (subOrderId) => {
    const subOrder = await subOrderDao.getById(subOrderId);
    if (!subOrder) throw new Error('Sub-order not found');

    // Log the mismatch event for inventory auditing
    await fulfillmentEventDao.log(subOrderId, 'stock_mismatch', {
        source_type: subOrder.source_type,
        source_id: subOrder.source_id,
        discovered_at: new Date().toISOString(),
    });

    const parentOrder = await prisma.orders.findUnique({
        where: { id: subOrder.parent_order_id },
        select: { id: true, delivery_pincode: true },
    });

    // Mark current sub-order as cancelled
    await subOrderDao.updateStatus(subOrderId, 'cancelled');

    // Update parent order status based on all sub-orders' aggregate state
    await updateParentOrderStatusFromSubOrders(subOrder.parent_order_id);

    const items = subOrder.sub_order_items || [];
    const reroutedItems = [];
    const cancelledItems = [];

    for (const item of items) {
        const availability = await checkProductAvailability(
            item.product_id,
            item.variant_id,
            parentOrder.delivery_pincode,
            item.quantity
        );

        if (availability.available && availability.source_id !== subOrder.source_id) {
            reroutedItems.push({
                product_id: item.product_id,
                variant_id: item.variant_id,
                quantity: item.quantity,
                price: parseFloat(item.unit_price) || 0,
                source_type: availability.source_type,
                source_id: availability.source_id,
                seller_id: availability.seller_id || null,
                estimated_delivery_minutes: availability.estimated_delivery_minutes,
                warehouse_name: availability.warehouse_name,
            });
        } else {
            cancelledItems.push({
                product_id: item.product_id,
                variant_id: item.variant_id,
                quantity: item.quantity,
                reason: 'No alternative source after stock mismatch',
            });
        }
    }

    let newSubOrders = [];
    if (reroutedItems.length > 0) {
        newSubOrders = await createSubOrders(parentOrder.id, reroutedItems);
    }

    return {
        rerouted: reroutedItems.length > 0,
        new_sub_orders: newSubOrders,
        cancelled_items: cancelledItems,
    };
};

export default {
    createSubOrders,
    dispatchSellerAllocation,
    handleSellerCancellation,
    handleStockMismatch,
};
