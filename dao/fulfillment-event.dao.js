import prisma from '../config/prisma.js';

class FulfillmentEventDAO {
    /**
     * Log a fulfillment event (audit trail)
     */
    async log(subOrderId, eventType, payload = {}) {
        return await prisma.fulfillment_events.create({
            data: {
                sub_order_id: subOrderId,
                event_type: eventType,
                payload,
            },
        });
    }

    /**
     * Log multiple events in a transaction
     */
    async logMany(events) {
        return await prisma.fulfillment_events.createMany({
            data: events.map((e) => ({
                sub_order_id: e.sub_order_id,
                event_type: e.event_type,
                payload: e.payload || {},
            })),
        });
    }

    /**
     * List events for a sub-order (ordered by creation time)
     */
    async listBySubOrderId(subOrderId) {
        return await prisma.fulfillment_events.findMany({
            where: { sub_order_id: subOrderId },
            orderBy: { created_at: 'asc' },
        });
    }

    /**
     * List events for an entire master order (across all sub-orders)
     */
    async listByOrderId(orderId) {
        return await prisma.fulfillment_events.findMany({
            where: {
                sub_order: {
                    parent_order_id: orderId,
                },
            },
            orderBy: { created_at: 'asc' },
            include: {
                sub_order: {
                    select: {
                        id: true,
                        source_type: true,
                        source_id: true,
                        fulfillment_status: true,
                    },
                },
            },
        });
    }

    /**
     * Get the latest event for a sub-order
     */
    async getLatest(subOrderId) {
        return await prisma.fulfillment_events.findFirst({
            where: { sub_order_id: subOrderId },
            orderBy: { created_at: 'desc' },
        });
    }
}

export default new FulfillmentEventDAO();
