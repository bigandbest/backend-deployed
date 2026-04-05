import prisma from '../config/prisma.js';
import { handleStockMismatch } from '../services/subOrderService.js';

// Helper function to assign a rider to a division order
const assignRiderToDivisionOrder = async (subOrderId, orderId) => {
    const parentOrder = await prisma.orders.findUnique({
        where: { id: orderId },
        select: { delivery_pincode: true },
    });

    if (!parentOrder?.delivery_pincode) {
        throw new Error('Order delivery pincode not found');
    }

    // Find available rider in the delivery zone
    const rider = await findAvailableRider(parentOrder.delivery_pincode);
    if (!rider) {
        throw new Error('No available riders in delivery zone');
    }

    // Build pickup sequence for all non-zonal, non-cancelled sub-orders
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
        orderBy: { source_type: 'asc' },
    });

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
    const assignment = await prisma.rider_assignments.create({
        data: {
            rider_id: rider.id,
            order_id: orderId,
            pickup_sequence: pickupSequence,
            pickup_status: {},
        },
    });

    // Update all non-zonal sub-orders with rider info
    for (const so of allNonZonalSubOrders) {
        await prisma.sub_orders.update({
            where: { id: so.id },
            data: {
                rider_id: rider.id,
                pickup_sequence: pickupSequence,
            },
        });
    }

    // Mark rider as busy
    await prisma.riders.update({
        where: { id: rider.id },
        data: { is_available: false },
    });

    return {
        rider_id: rider.id,
        assignment_id: assignment.id,
        pickup_sequence: pickupSequence,
    };
};

// Helper function to find available rider
const findAvailableRider = async (pincode) => {
    const warehousePincodes = await prisma.warehouse_pincodes.findMany({
        where: { pincode, is_active: true },
        select: { warehouse_id: true },
    });

    const warehouseIds = warehousePincodes.map((wp) => wp.warehouse_id);
    if (warehouseIds.length === 0) return null;

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
            riders: true,
        },
    });

    return warehouseRider?.riders || null;
};

// Used only for the detail endpoint — includes events
const SUB_ORDER_DETAIL_INCLUDE = {
    sub_order_items: {
        include: {
            product: {
                select: {
                    id: true, name: true,
                    media: { where: { is_primary: true }, orderBy: { sort_order: 'asc' }, take: 1, select: { url: true } },
                },
            },
            variant: { select: { id: true, title: true, sku: true, price: true } },
        },
    },
    warehouse: { select: { id: true, name: true, type: true, location: true } },
    parent_order: {
        select: {
            id: true, receiver_name: true, mobile: true, address: true,
            delivery_pincode: true, total: true, payment_method: true, status: true, created_at: true,
            users: { select: { id: true, name: true, email: true, phone: true } },
        },
    },
    fulfillment_events: { orderBy: { created_at: 'desc' }, take: 20 },
};

// Used for list — no events (saves N×20 rows per page)
const SUB_ORDER_LIST_INCLUDE = {
    sub_order_items: {
        include: {
            product: {
                select: {
                    id: true, name: true,
                    media: { where: { is_primary: true }, take: 1, select: { url: true } },
                },
            },
            variant: { select: { id: true, title: true, sku: true, price: true } },
        },
    },
    warehouse: { select: { id: true, name: true, type: true, location: true } },
    parent_order: {
        select: {
            id: true, receiver_name: true, mobile: true, address: true,
            delivery_pincode: true, total: true, payment_method: true, status: true, created_at: true,
            users: { select: { id: true, name: true, email: true, phone: true } },
        },
    },
};

/**
 * GET /api/admin/fulfillment/sub-orders
 */
export const listAdminSubOrders = async (req, res) => {
    try {
        const { source_type, status, warehouse_id, pincode, page = 1, limit = 20, search } = req.query;

        // Admin manages both division and zonal orders
        const allowedSources = ['division', 'zonal'];
        const where = {
            source_type: { in: (source_type && source_type !== 'all' && allowedSources.includes(source_type)) ? [source_type] : allowedSources },
        };
        if (status) where.fulfillment_status = status;
        if (warehouse_id) where.source_id = parseInt(warehouse_id);
        if (pincode) where.parent_order = { delivery_pincode: pincode };
        if (search) {
            where.OR = [
                { id: { contains: search, mode: 'insensitive' } },
                { parent_order_id: { contains: search, mode: 'insensitive' } },
                { parent_order: { receiver_name: { contains: search, mode: 'insensitive' } } },
            ];
        }

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);

        const [subOrders, total] = await Promise.all([
            prisma.sub_orders.findMany({
                where,
                include: SUB_ORDER_LIST_INCLUDE,
                orderBy: { created_at: 'desc' },
                skip: (pageNum - 1) * limitNum,
                take: limitNum,
            }),
            prisma.sub_orders.count({ where }),
        ]);

        return res.json({
            success: true,
            data: subOrders.map(so => formatSubOrder(so, false)),
            pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
        });
    } catch (error) {
        console.error('listAdminSubOrders error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * GET /api/admin/fulfillment/sub-orders/:id
 */
export const getAdminSubOrderDetail = async (req, res) => {
    try {
        const { id } = req.params;
        const subOrder = await prisma.sub_orders.findUnique({ where: { id }, include: SUB_ORDER_DETAIL_INCLUDE });
        if (!subOrder) return res.status(404).json({ success: false, error: 'Sub-order not found' });
        return res.json({ success: true, data: formatSubOrder(subOrder, true) });
    } catch (error) {
        console.error('getAdminSubOrderDetail error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * PATCH /api/admin/fulfillment/sub-orders/:id/status
 */
export const updateAdminSubOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, note } = req.body;

        const VALID_STATUSES = [
            'pending', 'confirmed', 'picked', 'in_transit', 'delivered',
            'rider_pending', 'dispatched_to_zonal_delivery', 'cancelled', 'return_to_source',
        ];
        if (!status || !VALID_STATUSES.includes(status)) {
            return res.status(400).json({ success: false, error: `Invalid status. Valid: ${VALID_STATUSES.join(', ')}` });
        }

        const result = await prisma.$transaction(async (tx) => {
            const subOrder = await tx.sub_orders.findUnique({ where: { id }, select: { id: true, fulfillment_status: true } });
            if (!subOrder) return null;

            await Promise.all([
                tx.sub_orders.update({ where: { id }, data: { fulfillment_status: status, updated_at: new Date() } }),
                tx.fulfillment_events.create({
                    data: {
                        sub_order_id: id,
                        event_type: `admin_status_update_${status}`,
                        payload: { previous_status: subOrder.fulfillment_status, new_status: status, note: note || null, updated_by: 'admin', updated_at: new Date().toISOString() },
                    },
                }),
            ]);

            return { id, status };
        });

        if (!result) return res.status(404).json({ success: false, error: 'Sub-order not found' });
        return res.json({ success: true, message: `Sub-order status updated to ${status}`, data: result });
    } catch (error) {
        console.error('updateAdminSubOrderStatus error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * POST /api/admin/fulfillment/sub-orders/:id/accept
 * Admin accepts a division/zonal sub-order, generates OTP at parent order level
 * All sub-orders of the same parent order share the same OTP
 */
export const acceptAdminSubOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const subOrder = await prisma.sub_orders.findUnique({
            where: { id },
            select: { id: true, fulfillment_status: true, source_type: true, parent_order_id: true },
        });

        if (!subOrder) {
            return res.status(404).json({ success: false, error: 'Sub-order not found' });
        }

        if (subOrder.source_type !== 'division' && subOrder.source_type !== 'zonal') {
            return res.status(400).json({ success: false, error: 'Only division/zonal orders can be accepted via this endpoint' });
        }

        if (!['pending', 'rider_pending'].includes(subOrder.fulfillment_status)) {
            return res.status(400).json({
                success: false,
                error: `Cannot accept sub-order in ${subOrder.fulfillment_status} status`,
            });
        }

        // Check if parent order already has OTP (from first sub-order acceptance)
        const firstConfirmedSubOrder = await prisma.sub_orders.findFirst({
            where: {
                parent_order_id: subOrder.parent_order_id,
                fulfillment_status: 'confirmed',
            },
            select: { pickup_sequence: true },
        });

        let parentOtp = firstConfirmedSubOrder?.pickup_sequence?.otp;

        // Generate OTP only once for the parent order (on first sub-order acceptance)
        if (!parentOtp) {
            parentOtp = Math.floor(100000 + Math.random() * 900000).toString();
        }

        // For division orders, try to assign a rider during acceptance
        let riderAssignmentData = null;
        if (subOrder.source_type === 'division') {
            try {
                riderAssignmentData = await assignRiderToDivisionOrder(id, subOrder.parent_order_id);
            } catch (riderError) {
                console.warn('Rider assignment failed, order will be in confirmed state:', riderError.message);
                // Continue with acceptance even if rider assignment fails
            }
        }

        // Accept this sub-order + store parent OTP reference in pickup_sequence
        const pickupSequence = { otp: parentOtp, accepted_at: new Date().toISOString() };
        if (riderAssignmentData) {
            pickupSequence.rider_id = riderAssignmentData.rider_id;
            pickupSequence.pickup_sequence = riderAssignmentData.pickup_sequence;
        }

        await prisma.sub_orders.update({
            where: { id },
            data: {
                fulfillment_status: 'confirmed',
                pickup_sequence: pickupSequence,
                rider_id: riderAssignmentData?.rider_id || null,
                updated_at: new Date(),
            },
        });

        // Log fulfillment event
        await prisma.fulfillment_events.create({
            data: {
                sub_order_id: id,
                event_type: 'confirmed',
                payload: {
                    accepted_at: new Date().toISOString(),
                    parent_order_id: subOrder.parent_order_id,
                    parent_otp: parentOtp,
                    accepted_by: 'admin',
                    rider_assigned: riderAssignmentData ? true : false,
                    rider_id: riderAssignmentData?.rider_id || null,
                },
            },
        });

        res.status(200).json({
            success: true,
            message: 'Sub-order accepted successfully',
            data: {
                sub_order_id: id,
                status: 'confirmed',
                rider_assigned: riderAssignmentData ? true : false,
                rider_id: riderAssignmentData?.rider_id || null,
            },
        });
    } catch (error) {
        console.error('acceptAdminSubOrder error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * POST /api/admin/fulfillment/sub-orders/:id/verify-otp
 * Verify OTP and mark sub-order as delivered, track which sub-order verified it
 */
export const verifyOtpAndDeliver = async (req, res) => {
    try {
        const { id } = req.params;
        const { delivery_otp } = req.body;

        if (!delivery_otp || !delivery_otp.toString().trim()) {
            return res.status(400).json({ success: false, error: 'OTP is required' });
        }

        const subOrder = await prisma.sub_orders.findUnique({
            where: { id },
            select: {
                id: true,
                fulfillment_status: true,
                parent_order_id: true,
                pickup_sequence: true,
            },
        });

        if (!subOrder) {
            return res.status(404).json({ success: false, error: 'Sub-order not found' });
        }

        // Get the parent OTP from first confirmed sub-order
        const parentSubOrders = await prisma.sub_orders.findMany({
            where: { parent_order_id: subOrder.parent_order_id },
            select: { pickup_sequence: true },
            take: 1,
        });

        const parentOtp = parentSubOrders[0]?.pickup_sequence?.otp;

        // Verify OTP
        if (!parentOtp || delivery_otp.toString() !== parentOtp.toString()) {
            return res.status(400).json({ success: false, error: 'Invalid OTP' });
        }

        // Mark sub-order as delivered and track verification
        await prisma.sub_orders.update({
            where: { id },
            data: {
                fulfillment_status: 'delivered',
                updated_at: new Date(),
            },
        });

        // Log verification event
        await prisma.fulfillment_events.create({
            data: {
                sub_order_id: id,
                event_type: 'delivered_otp_verified',
                payload: {
                    verified_at: new Date().toISOString(),
                    otp_verified: true,
                    parent_order_id: subOrder.parent_order_id,
                },
            },
        });

        res.status(200).json({
            success: true,
            message: 'Sub-order verified and marked delivered',
            data: { sub_order_id: id, status: 'delivered' },
        });
    } catch (error) {
        console.error('verifyOtpAndDeliver error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * GET /api/admin/fulfillment/stats
 * 2 parallel groupBy + 1 warehouse lookup = 3 total queries
 */
export const getAdminFulfillmentStats = async (_req, res) => {
    try {
        const [statusCounts, byWarehouse] = await Promise.all([
            prisma.sub_orders.groupBy({
                by: ['fulfillment_status'],
                where: { source_type: { in: ['division', 'zonal'] } },
                _count: { id: true },
            }),
            prisma.sub_orders.groupBy({
                by: ['source_id', 'source_type'],
                where: { source_type: { in: ['division', 'zonal'] }, fulfillment_status: { notIn: ['delivered', 'cancelled'] } },
                _count: { id: true },
            }),
        ]);

        const warehouseIds = [...new Set(byWarehouse.map(r => r.source_id).filter(Boolean))];
        const whMap = warehouseIds.length
            ? Object.fromEntries(
                (await prisma.warehouses.findMany({ where: { id: { in: warehouseIds } }, select: { id: true, name: true, type: true } }))
                    .map(w => [w.id, w])
            )
            : {};

        return res.json({
            success: true,
            stats: {
                by_status: Object.fromEntries(statusCounts.map(c => [c.fulfillment_status, c._count.id])),
                by_warehouse: byWarehouse.map(r => ({
                    warehouse_id: r.source_id,
                    warehouse_name: whMap[r.source_id]?.name ?? `Warehouse #${r.source_id}`,
                    source_type: r.source_type,
                    active_orders: r._count.id,
                })),
            },
        });
    } catch (error) {
        console.error('getAdminFulfillmentStats error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * POST /api/admin/fulfillment/sub-orders/:id/stock-mismatch
 * Warehouse staff reports that physical stock is missing at pickup.
 * Cancels the sub-order and re-routes affected items to the next available source.
 */
export const reportStockMismatch = async (req, res) => {
    try {
        const { id } = req.params;

        const subOrder = await prisma.sub_orders.findUnique({
            where: { id },
            select: { id: true, fulfillment_status: true, source_type: true },
        });

        if (!subOrder) {
            return res.status(404).json({ success: false, error: 'Sub-order not found' });
        }

        const REPORTABLE_STATUSES = ['pending', 'confirmed', 'picked'];
        if (!REPORTABLE_STATUSES.includes(subOrder.fulfillment_status)) {
            return res.status(400).json({
                success: false,
                error: `Cannot report stock mismatch for sub-order in '${subOrder.fulfillment_status}' status`,
            });
        }

        const result = await handleStockMismatch(id);

        return res.json({
            success: true,
            message: result.rerouted
                ? `Stock mismatch recorded. ${result.new_sub_orders?.length ?? 0} new sub-order(s) created.`
                : 'Stock mismatch recorded. No alternative source found — items cancelled.',
            data: {
                rerouted: result.rerouted,
                new_sub_order_ids: result.new_sub_orders?.map((so) => so.id) ?? [],
                cancelled_items: result.cancelled_items ?? [],
            },
        });
    } catch (error) {
        console.error('reportStockMismatch error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

// ── helpers ───────────────────────────────────────────────────────────────────

function formatSubOrder(so, includeEvents = false) {
    const items = (so.sub_order_items || []).map(item => ({
        product_id: item.product_id,
        variant_id: item.variant_id,
        product_name: item.product?.name || '—',
        product_image: item.product?.media?.[0]?.url || null,
        variant_name: item.variant?.title || '—',
        sku: item.variant?.sku || '—',
        quantity: item.quantity,
        unit_price: Number(item.unit_price || 0),
        line_total: Number(item.unit_price || 0) * item.quantity,
    }));

    const order = so.parent_order || {};

    return {
        id: so.id,
        parent_order_id: so.parent_order_id,
        source_type: so.source_type,
        source_id: so.source_id,
        seller_id: so.seller_id || null,
        fulfillment_status: so.fulfillment_status,
        rider_id: so.rider_id || null,
        estimated_delivery_at: so.estimated_delivery_at,
        created_at: so.created_at,
        updated_at: so.updated_at,
        warehouse: so.warehouse || null,
        customer: {
            name: order.receiver_name || order.users?.name || '—',
            phone: order.mobile || order.users?.phone || '—',
            email: order.users?.email || '—',
            address: order.address || '—',
            pincode: order.delivery_pincode || '—',
        },
        order_summary: {
            total: Number(order.total || 0),
            payment_method: order.payment_method || '—',
            master_status: order.status || '—',
            placed_at: order.created_at,
        },
        items,
        order_total: items.reduce((s, i) => s + i.line_total, 0),
        ...(includeEvents && {
            events: (so.fulfillment_events || []).map(e => ({
                event_type: e.event_type,
                payload: e.payload,
                created_at: e.created_at,
            })),
        }),
    };
}
