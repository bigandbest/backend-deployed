import subOrderDao from '../dao/sub-order.dao.js';
import fulfillmentEventDao from '../dao/fulfillment-event.dao.js';

/**
 * SLA Tracking Service
 * Tracks delivery SLA per sub-order and notifies when at risk.
 */

// Default SLA configurations (in minutes)
const SLA_CONFIG = {
    zonal: 30,      // 30 minutes for zonal (dark store)
    division: 120,  // 2 hours for division warehouse
    seller: 120,    // 2 hours for seller
};

/**
 * Calculate SLA for a given source type
 */
export const calculateSLA = (sourceType) => {
    return SLA_CONFIG[sourceType] || 120;
};

/**
 * Check SLA status for a sub-order
 * Returns: 'on_time' | 'at_risk' (>80% elapsed) | 'delayed'
 */
export const checkSLAStatus = (subOrder) => {
    if (!subOrder.estimated_delivery_at) return 'on_time';

    const now = new Date();
    const estimatedDelivery = new Date(subOrder.estimated_delivery_at);
    const createdAt = new Date(subOrder.created_at);

    const totalSLAMs = estimatedDelivery.getTime() - createdAt.getTime();
    const elapsedMs = now.getTime() - createdAt.getTime();

    if (totalSLAMs <= 0) return 'delayed';

    const percentElapsed = (elapsedMs / totalSLAMs) * 100;

    // Already past delivery time
    if (now > estimatedDelivery) return 'delayed';

    // More than 80% of SLA elapsed
    if (percentElapsed >= 80) return 'at_risk';

    return 'on_time';
};

/**
 * Get SLA info for a sub-order (used in order tracking API)
 */
export const getSLAInfo = (subOrder) => {
    const status = checkSLAStatus(subOrder);
    const slaMinutes = calculateSLA(subOrder.source_type);

    return {
        sla_status: status,
        sla_minutes: slaMinutes,
        estimated_delivery_at: subOrder.estimated_delivery_at,
        source_type: subOrder.source_type,
    };
};

/**
 * Check all active sub-orders for SLA violations.
 * Called by cron. Logs events and would trigger notifications in production.
 */
export const notifyAtRiskOrders = async () => {
    const activeStatuses = ['pending', 'confirmed', 'picked', 'in_transit', 'dispatched_to_zonal_delivery'];

    const activeSubOrders = await subOrderDao.listPendingRiderAssignment();

    // Also get all sub-orders in active fulfillment statuses
    const allActive = await (await import('../config/prisma.js')).default.sub_orders.findMany({
        where: {
            fulfillment_status: { in: activeStatuses },
            estimated_delivery_at: { not: null },
        },
    });

    let atRiskCount = 0;
    let delayedCount = 0;

    for (const subOrder of allActive) {
        const status = checkSLAStatus(subOrder);

        if (status === 'at_risk') {
            atRiskCount++;
            await fulfillmentEventDao.log(subOrder.id, 'sla_at_risk', {
                estimated_delivery_at: subOrder.estimated_delivery_at,
                current_status: subOrder.fulfillment_status,
            });
            // TODO: Send notification to customer
        } else if (status === 'delayed') {
            delayedCount++;
            await fulfillmentEventDao.log(subOrder.id, 'sla_breached', {
                estimated_delivery_at: subOrder.estimated_delivery_at,
                current_status: subOrder.fulfillment_status,
            });
            // TODO: Send notification to customer + escalate
        }
    }

    return { checked: allActive.length, at_risk: atRiskCount, delayed: delayedCount };
};

export default {
    calculateSLA,
    checkSLAStatus,
    getSLAInfo,
    notifyAtRiskOrders,
};
