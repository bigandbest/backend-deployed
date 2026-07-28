import prisma from '../config/prisma.js';

class SubOrderDAO {
    /**
     * Create a single sub-order
     */
    async create(data) {
        return await prisma.sub_orders.create({
            data: {
                parent_order_id: data.parent_order_id,
                source_type: data.source_type,
                source_id: data.source_id,
                seller_id: data.seller_id || null,
                fulfillment_status: data.fulfillment_status || 'pending',
                rider_id: data.rider_id || null,
                pickup_sequence: data.pickup_sequence || [],
                estimated_delivery_at: data.estimated_delivery_at || null,
                assigned_at: data.assigned_at || null,
            },
        });
    }

    /**
     * Create multiple sub-orders in a transaction (used during order placement)
     */
    async createMany(subOrdersData) {
        return await prisma.$transaction(
            subOrdersData.map((data) =>
                prisma.sub_orders.create({
                    data: {
                        parent_order_id: data.parent_order_id,
                        source_type: data.source_type,
                        source_id: data.source_id,
                        seller_id: data.seller_id || null,
                        fulfillment_status: data.fulfillment_status || 'pending',
                        rider_id: data.rider_id || null,
                        pickup_sequence: data.pickup_sequence || [],
                        estimated_delivery_at: data.estimated_delivery_at || null,
                    },
                })
            )
        );
    }

    /**
     * Get a sub-order by ID with all relations
     */
    async getById(id) {
        return await prisma.sub_orders.findUnique({
            where: { id },
            include: {
                sub_order_items: {
                    include: {
                        product: {
                            include: {
                                media: {
                                    where: { is_primary: true },
                                    orderBy: { sort_order: 'asc' },
                                    take: 1,
                                },
                            },
                        },
                        variant: true,
                    },
                },
                warehouse: {
                    select: {
                        id: true,
                        name: true,
                        type: true,
                        location: true,
                    },
                },
                fulfillment_events: {
                    orderBy: { created_at: 'desc' },
                    take: 20,
                },
            },
        });
    }

    /**
     * List all sub-orders for a master order
     */
    async listByOrderId(orderId) {
        return await prisma.sub_orders.findMany({
            where: { parent_order_id: orderId },
            include: {
                sub_order_items: {
                    include: {
                        product: {
                            include: {
                                media: {
                                    where: { is_primary: true },
                                    orderBy: { sort_order: 'asc' },
                                    take: 1,
                                },
                            },
                        },
                        variant: true,
                    },
                },
                warehouse: {
                    select: {
                        id: true,
                        name: true,
                        type: true,
                        location: true,
                    },
                },
            },
            orderBy: { created_at: 'asc' },
        });
    }

    /**
     * Update the fulfillment status of a sub-order
     */
    async updateStatus(id, status, additionalData = {}) {
        return await prisma.sub_orders.update({
            where: { id },
            data: {
                fulfillment_status: status,
                updated_at: new Date(),
                ...additionalData,
            },
        });
    }

    /**
     * Atomically transition a sub-order's status, guarded on its current status.
     * Unlike updateStatus() (plain read-then-write), this is a single conditional
     * UPDATE — the transition only happens if fulfillment_status still matches
     * one of `fromStatuses` at the moment the query runs. Returns whether the
     * transition actually happened.
     *
     * Exists to prevent races between concurrent transitions of the same
     * sub-order — e.g. a seller accepting at the exact moment a timeout job
     * decides to auto-reject. Whichever caller's conditional update matches a
     * row wins; the other sees `false` and must treat it as a no-op.
     */
    async tryTransitionStatus(id, fromStatuses, toStatus, additionalData = {}) {
        const result = await prisma.sub_orders.updateMany({
            where: { id, fulfillment_status: { in: fromStatuses } },
            data: {
                fulfillment_status: toStatus,
                updated_at: new Date(),
                ...additionalData,
            },
        });
        return result.count === 1;
    }

    /**
     * Assign a rider to a sub-order
     */
    async assignRider(id, riderId, pickupSequence = []) {
        return await prisma.sub_orders.update({
            where: { id },
            data: {
                rider_id: riderId,
                pickup_sequence: pickupSequence,
                fulfillment_status: 'confirmed',
                updated_at: new Date(),
            },
        });
    }

    /**
     * List sub-orders for a seller (scoped by seller_id and delivery pincode)
     */
    async listBySellerPincodes(sellerId, pincodes) {
        return await prisma.sub_orders.findMany({
            where: {
                seller_id: sellerId,
                ...(pincodes.length > 0 ? { parent_order: { delivery_pincode: { in: pincodes } } } : {}),
            },
            include: {
                sub_order_items: {
                    include: {
                        product: {
                            include: {
                                media: {
                                    where: { is_primary: true },
                                    orderBy: { sort_order: 'asc' },
                                    take: 1,
                                },
                            },
                        },
                        variant: true,
                    },
                },
                parent_order: {
                    select: {
                        id: true,
                        address: true,
                        delivery_pincode: true,
                        mobile: true,
                        receiver_name: true,
                        created_at: true,
                    },
                },
            },
            orderBy: { created_at: 'desc' },
        });
    }

    /**
     * List sub-orders assigned to a rider
     */
    async listByRiderId(riderId) {
        return await prisma.sub_orders.findMany({
            where: {
                rider_id: riderId,
                fulfillment_status: {
                    in: ['confirmed', 'picked', 'in_transit', 'out_for_delivery'],
                },
            },
            include: {
                sub_order_items: {
                    include: {
                        product: {
                            select: { id: true, name: true },
                        },
                        variant: {
                            select: { id: true, title: true, sku: true },
                        },
                    },
                },
                warehouse: {
                    select: { id: true, name: true, type: true, location: true },
                },
                parent_order: {
                    select: {
                        id: true,
                        address: true,
                        delivery_pincode: true,
                        mobile: true,
                        receiver_name: true,
                    },
                },
            },
            orderBy: { created_at: 'asc' },
        });
    }

    /**
     * List sub-orders in rider_pending state for retry cron
     */
    async listPendingRiderAssignment() {
        return await prisma.sub_orders.findMany({
            where: {
                fulfillment_status: 'rider_pending',
            },
            include: {
                parent_order: {
                    select: { id: true, delivery_pincode: true },
                },
                warehouse: {
                    select: { id: true, name: true, type: true },
                },
            },
        });
    }

    /**
     * Get all non-zonal sub-orders for an order (for basket-size rule)
     */
    async countNonZonalSourcesForOrder(orderId) {
        const subOrders = await prisma.sub_orders.findMany({
            where: {
                parent_order_id: orderId,
                source_type: { not: 'zonal' },
            },
            select: { source_id: true, source_type: true },
        });

        // Count unique source stops
        const uniqueStops = new Set(
            subOrders.map((so) => `${so.source_type}_${so.source_id}`)
        );
        return uniqueStops.size;
    }
}

export default new SubOrderDAO();
