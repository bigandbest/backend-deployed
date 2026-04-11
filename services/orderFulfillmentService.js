import prisma from '../config/prisma.js';

/**
 * Update parent order status based on aggregate status of all sub-orders
 * This ensures the parent order's tracking timeline is kept in sync with sub-order changes
 *
 * Status progression:
 * - All pending → Pending
 * - At least one confirmed → Confirmed
 * - At least one picked → Processing
 * - At least one out_for_delivery/in_transit → Shipped
 * - All delivered/cancelled → Delivered
 */
export const updateParentOrderStatusFromSubOrders = async (parentOrderId) => {
    try {
        const subOrders = await prisma.sub_orders.findMany({
            where: { parent_order_id: parentOrderId },
            select: { fulfillment_status: true },
        });

        if (!subOrders.length) return;

        // Determine parent order status based on sub-orders aggregate state
        let newParentStatus = 'Pending'; // Default

        // If all sub-orders are delivered or cancelled → Delivered
        const allFinalStatus = subOrders.every(s =>
            s.fulfillment_status === 'delivered' || s.fulfillment_status === 'cancelled'
        );
        if (allFinalStatus) {
            newParentStatus = 'Delivered';
        }
        // If any sub-order is out_for_delivery or in_transit → Shipped
        else if (subOrders.some(s =>
            s.fulfillment_status === 'out_for_delivery' || s.fulfillment_status === 'in_transit'
        )) {
            newParentStatus = 'Shipped';
        }
        // If any sub-order is picked → Processing (interim state towards shipped)
        else if (subOrders.some(s => s.fulfillment_status === 'picked')) {
            newParentStatus = 'Processing';
        }
        // If any sub-order is confirmed → Confirmed
        else if (subOrders.some(s => s.fulfillment_status === 'confirmed')) {
            newParentStatus = 'Confirmed';
        }

        // Update parent order status if changed
        await prisma.orders.update({
            where: { id: parentOrderId },
            data: { status: newParentStatus, updated_at: new Date() },
        });
    } catch (err) {
        console.error(`[updateParentOrderStatus] Error for order ${parentOrderId}:`, err.message);
        // Non-fatal: tracking will eventually catch up via polling or manual checks
    }
};
