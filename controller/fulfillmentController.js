import { checkProductAvailability, resolveCartSources } from '../services/fulfillmentService.js';
import subOrderDao from '../dao/sub-order.dao.js';
import fulfillmentEventDao from '../dao/fulfillment-event.dao.js';
import { getSLAInfo } from '../services/slaTrackingService.js';
import prisma from '../config/prisma.js';

/**
 * Fulfillment Controller
 * Handles product availability, cart validation, enhanced order retrieval,
 * and zonal warehouse delivery callbacks.
 */

// ================================================================
// GET /api/products/:id/availability?pincode=XXX
// ================================================================

export const getProductAvailability = async (req, res) => {
    try {
        const { id } = req.params;
        const { pincode, variant_id, quantity = 1 } = req.query;

        if (!pincode) {
            return res.status(400).json({
                success: false,
                error: 'Pincode is required',
            });
        }

        const result = await checkProductAvailability(
            id,
            variant_id || null,
            pincode,
            parseInt(quantity, 10) || 1
        );

        // Format estimated delivery for API response
        let estimated_delivery = null;
        if (result.available && result.estimated_delivery_minutes) {
            estimated_delivery = new Date(
                Date.now() + result.estimated_delivery_minutes * 60 * 1000
            ).toISOString();
        }

        return res.json({
            success: true,
            available: result.available,
            source_type: result.source_type,
            source_id: result.source_id,
            available_qty: result.available_qty || 0,
            estimated_delivery,
            estimated_delivery_minutes: result.estimated_delivery_minutes || null,
            warehouse_name: result.warehouse_name || null,
            reason: result.reason || null,
        });
    } catch (error) {
        console.error('Error in getProductAvailability:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// ================================================================
// POST /api/cart/validate
// ================================================================

export const validateCart = async (req, res) => {
    try {
        const { items, pincode } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Items array is required',
            });
        }

        if (!pincode) {
            return res.status(400).json({
                success: false,
                error: 'Pincode is required',
            });
        }

        const resolvedItems = await resolveCartSources(items, pincode);

        const allAvailable = resolvedItems.every((item) => item.available);
        const unavailableItems = resolvedItems.filter((item) => !item.available);

        // Group items by source for display
        const sourceGroups = {};
        for (const item of resolvedItems) {
            if (!item.available) continue;
            const key = `${item.source_type}_${item.source_id}`;
            if (!sourceGroups[key]) {
                sourceGroups[key] = {
                    source_type: item.source_type,
                    source_id: item.source_id,
                    warehouse_name: item.warehouse_name,
                    estimated_delivery_minutes: item.estimated_delivery_minutes,
                    items: [],
                };
            }
            sourceGroups[key].items.push(item);
        }

        return res.json({
            success: true,
            all_available: allAvailable,
            pincode,
            items: resolvedItems,
            source_groups: Object.values(sourceGroups),
            unavailable_items: unavailableItems.map((item) => ({
                product_id: item.product_id,
                variant_id: item.variant_id,
                reason: item.reason || 'Out of stock',
            })),
        });
    } catch (error) {
        console.error('Error in validateCart:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// ================================================================
// GET /api/orders/:id — Enhanced with sub-orders
// ================================================================

export const getOrderWithSubOrders = async (req, res) => {
    try {
        const { user } = req;
        const { id } = req.params;

        if (!user || !user.id) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        // Fetch master order
        const order = await prisma.orders.findUnique({
            where: { id },
            include: {
                users: {
                    select: { id: true, name: true, email: true, phone: true },
                },
                order_items: {
                    include: {
                        variant: {
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
                            },
                        },
                    },
                },
            },
        });

        if (!order) {
            return res.status(404).json({ success: false, error: 'Order not found' });
        }

        // Security check
        if (order.user_id !== user.id) {
            return res.status(403).json({ success: false, error: 'Forbidden' });
        }

        // Fetch sub-orders
        const subOrders = await subOrderDao.listByOrderId(id);

        // Add SLA info to each sub-order
        const subOrdersWithSLA = subOrders.map((so) => ({
            ...so,
            sla: getSLAInfo(so),
        }));

        return res.json({
            success: true,
            order: {
                ...order,
                sub_orders: subOrdersWithSLA,
            },
        });
    } catch (error) {
        console.error('Error in getOrderWithSubOrders:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// ================================================================
// POST /api/webhooks/zonal-delivery — Zonal warehouse callback
// ================================================================

export const handleZonalCallback = async (req, res) => {
    try {
        const { sub_order_id, status, metadata = {} } = req.body;

        if (!sub_order_id || !status) {
            return res.status(400).json({
                success: false,
                error: 'sub_order_id and status are required',
            });
        }

        const subOrder = await subOrderDao.getById(sub_order_id);
        if (!subOrder) {
            return res.status(404).json({
                success: false,
                error: 'Sub-order not found',
            });
        }

        if (subOrder.source_type !== 'zonal') {
            return res.status(400).json({
                success: false,
                error: 'This callback is only for zonal sub-orders',
            });
        }

        // Map zonal callback status to our fulfillment status
        const statusMap = {
            picked_up: 'picked',
            in_transit: 'in_transit',
            delivered: 'delivered',
            delivery_failed: 'delivery_failed',
        };

        const mappedStatus = statusMap[status] || status;

        await subOrderDao.updateStatus(sub_order_id, mappedStatus);

        await fulfillmentEventDao.log(sub_order_id, `zonal_callback_${status}`, {
            original_status: status,
            mapped_status: mappedStatus,
            ...metadata,
        });

        // If delivery failed, handle retry or escalation
        if (status === 'delivery_failed') {
            await fulfillmentEventDao.log(sub_order_id, 'zonal_delivery_failed', {
                message: 'Zonal delivery failed. Queued for retry or manual resolution.',
                metadata,
            });
            // TODO: Implement retry logic or escalation queue
        }

        return res.json({
            success: true,
            sub_order_id,
            fulfillment_status: mappedStatus,
        });
    } catch (error) {
        console.error('Error in handleZonalCallback:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

export default {
    getProductAvailability,
    validateCart,
    getOrderWithSubOrders,
    handleZonalCallback,
};
