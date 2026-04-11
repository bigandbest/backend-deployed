import subOrderDao from '../dao/sub-order.dao.js';
import subOrderItemDao from '../dao/sub-order-item.dao.js';
import fulfillmentEventDao from '../dao/fulfillment-event.dao.js';
import { checkProductAvailability } from './fulfillmentService.js';
import prisma from '../config/prisma.js';
import { updateParentOrderStatusFromSubOrders } from './orderFulfillmentService.js';

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
export const createSubOrders = async (orderId, resolvedItems) => {
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

    const createdSubOrders = [];

    for (const [, group] of groups) {
        // Calculate estimated delivery time
        const estimatedDelivery = new Date(
            Date.now() + (group.estimated_delivery_minutes || 120) * 60 * 1000
        );

        // Create the sub-order
        const subOrder = await subOrderDao.create({
            parent_order_id: orderId,
            source_type: group.source_type,
            source_id: group.source_id,
            seller_id: group.seller_id,
            fulfillment_status: 'pending',
            estimated_delivery_at: estimatedDelivery,
        });

        // Create sub-order items
        await subOrderItemDao.createMany(
            group.items.map((item) => ({
                sub_order_id: subOrder.id,
                product_id: item.product_id,
                variant_id: item.variant_id,
                quantity: item.quantity,
                unit_price: parseFloat(item.price) || 0,
            }))
        );

        // Log creation event
        await fulfillmentEventDao.log(subOrder.id, 'created', {
            source_type: group.source_type,
            source_id: group.source_id,
            seller_id: group.seller_id,
            item_count: group.items.length,
        });

        createdSubOrders.push(subOrder);
    }

    return createdSubOrders;
};

// ================================================================
// SELLER CANCELLATION RE-ROUTING
// ================================================================

/**
 * Handle seller cancellation or rejection.
 * 
 * Flow:
 * 1. Remove seller's products from sub-order
 * 2. Re-run availability check (Division→Zonal→next eligible Seller)
 * 3. If new source found → create new sub-order
 * 4. If no source → mark as cancelled, issue partial refund
 * 
 * IMPORTANT: Does NOT affect other sub-orders in the same master order.
 */
export const handleSellerCancellation = async (subOrderId, cancelledSellerId) => {
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

    // Mark current sub-order as cancelled
    await subOrderDao.updateStatus(subOrderId, 'cancelled');

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
    handleSellerCancellation,
    handleStockMismatch,
};
