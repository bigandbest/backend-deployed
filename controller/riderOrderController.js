import prisma from '../config/prisma.js';
import { calculateDistanceKm } from '../utils/distanceUtils.js';

// ============ GET ASSIGNABLE ORDERS ============
export const getAssignableOrders = async (req, res) => {
    try {
        const rider = await prisma.riders.findUnique({
            where: { user_id: req.user.id },
            include: {
                warehouse_riders: {
                    where: { is_active: true },
                    include: {
                        warehouses: {
                            include: { warehouse_pincodes: { where: { is_active: true } } }
                        }
                    }
                }
            }
        });

        if (!rider) return res.status(404).json({ success: false, error: 'Rider profile not found' });

        if (rider.verification_status !== 'VERIFIED') {
            return res.status(403).json({ success: false, error: 'You must be verified to view orders' });
        }

        if (!rider.current_shift_id) {
            return res.status(403).json({ success: false, error: 'You must be checked in to view assignable orders' });
        }

        // Get all pincodes the rider serves
        const riderPincodes = rider.warehouse_riders
            .flatMap(wr => wr.warehouses.warehouse_pincodes.map(wp => wp.pincode));

        if (riderPincodes.length === 0) {
            return res.status(200).json({
                success: true,
                data: [],
                message: 'No pincodes assigned to your warehouse',
            });
        }

        // Find unassigned orders matching these pincodes
        const orders = await prisma.orders.findMany({
            where: {
                rider_id: null,
                delivery_pincode: { in: riderPincodes },
                status: { in: ['Pending', 'Confirmed', 'pending', 'confirmed'] },
                is_deleted: false,
            },
            include: {
                order_items: true,
                users: { select: { name: true, phone: true } },
            },
            orderBy: { created_at: 'desc' },
            take: 50,
        });

        // Calculate estimated payout 
        const milestones = await prisma.rider_payout_milestones.findMany({
            orderBy: { min_order_value: 'asc' }
        });

        const pincodesToFetch = [...new Set([
            ...orders.map(o => o.delivery_pincode),
            ...rider.warehouse_riders.map(wr => wr.warehouses.location).filter(Boolean),
            ...riderPincodes // Fallback origins
        ])].filter(Boolean);

        const pincodeLocations = await prisma.pincode_locations.findMany({
            where: { pincode: { in: pincodesToFetch } }
        });

        const locationMap = pincodeLocations.reduce((acc, loc) => {
            if (loc.latitude && loc.longitude) {
                acc[loc.pincode] = { lat: loc.latitude, lon: loc.longitude };
            }
            return acc;
        }, {});

        res.status(200).json({
            success: true,
            data: orders.map(o => {
                let estimatedPayout = 0;
                let distance = 0;

                // Determine Warehouse origin
                let originPincode = null;
                for (const wr of rider.warehouse_riders) {
                    if (wr.warehouses.location && locationMap[wr.warehouses.location]) {
                        originPincode = wr.warehouses.location;
                        break;
                    }
                }
                if (!originPincode && riderPincodes.length > 0) {
                    originPincode = riderPincodes.find(p => locationMap[p]); // Find first mapped pincode for this warehouse
                }

                if (originPincode && o.delivery_pincode && locationMap[originPincode] && locationMap[o.delivery_pincode]) {
                    distance = calculateDistanceKm(
                        locationMap[originPincode].lat,
                        locationMap[originPincode].lon,
                        locationMap[o.delivery_pincode].lat,
                        locationMap[o.delivery_pincode].lon
                    );

                    // Find suitable milestone
                    const totalValue = Number(o.total) || 0;
                    const applicableMilestone = milestones.find(m =>
                        totalValue >= Number(m.min_order_value) && totalValue <= Number(m.max_order_value)
                    );

                    if (applicableMilestone) {
                        estimatedPayout = Number((distance * Number(applicableMilestone.base_pay_per_km)).toFixed(2));
                    }
                }

                return {
                    id: o.id,
                    customer_name: o.users?.name,
                    customer_phone: o.users?.phone,
                    address: o.address,
                    delivery_pincode: o.delivery_pincode,
                    total: o.total,
                    status: o.status,
                    items_count: o.order_items.length,
                    payment_method: o.payment_method,
                    created_at: o.created_at,
                    delivery_distance_km: distance,
                    estimated_payout: estimatedPayout,
                };
            }),
            serving_pincodes: riderPincodes,
        });
    } catch (error) {
        console.error('Get assignable orders error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch orders' });
    }
};

// ============ ACCEPT ORDER ============
export const acceptOrder = async (req, res) => {
    try {
        const { orderId } = req.params;

        const rider = await prisma.riders.findUnique({
            where: { user_id: req.user.id },
            include: {
                warehouse_riders: {
                    where: { is_active: true },
                    include: {
                        warehouses: {
                            include: { warehouse_pincodes: { where: { is_active: true } } }
                        }
                    }
                }
            }
        });

        if (!rider) return res.status(404).json({ success: false, error: 'Rider profile not found' });

        // Guard: Must be verified
        if (rider.verification_status !== 'VERIFIED') {
            return res.status(403).json({ success: false, error: 'You must be verified to accept orders' });
        }

        // Guard: Must be checked in
        if (!rider.current_shift_id) {
            return res.status(403).json({ success: false, error: 'You must be checked in to accept orders' });
        }

        // Guard: Must be active
        if (!rider.is_active) {
            return res.status(403).json({ success: false, error: 'Your account is suspended' });
        }

        // Get order
        const order = await prisma.orders.findUnique({ where: { id: orderId } });
        if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

        if (order.rider_id) {
            return res.status(400).json({ success: false, error: 'Order already assigned to a rider' });
        }

        // Guard: Pincode validation
        const riderPincodes = rider.warehouse_riders
            .flatMap(wr => wr.warehouses.warehouse_pincodes.map(wp => wp.pincode));

        if (order.delivery_pincode && !riderPincodes.includes(order.delivery_pincode)) {
            return res.status(403).json({
                success: false,
                error: 'This order is outside your division. Delivery pincode does not match your assigned warehouse pincodes.',
                order_pincode: order.delivery_pincode,
                your_pincodes: riderPincodes,
            });
        }

        // Calculate Final Payout before freezing
        let finalDistance = 0;
        let finalPayout = 0;

        const milestones = await prisma.rider_payout_milestones.findMany({
            orderBy: { min_order_value: 'asc' }
        });

        let originPincode = null;
        for (const wr of rider.warehouse_riders) {
            if (wr.warehouses.location) {
                originPincode = wr.warehouses.location;
                break;
            }
        }
        if (!originPincode && riderPincodes.length > 0) originPincode = riderPincodes[0];

        if (originPincode && order.delivery_pincode) {
            const locs = await prisma.pincode_locations.findMany({
                where: { pincode: { in: [originPincode, order.delivery_pincode] } }
            });
            const originLoc = locs.find(l => l.pincode === originPincode);
            const destLoc = locs.find(l => l.pincode === order.delivery_pincode);

            if (originLoc && destLoc && originLoc.latitude && destLoc.latitude) {
                finalDistance = calculateDistanceKm(
                    originLoc.latitude, originLoc.longitude,
                    destLoc.latitude, destLoc.longitude
                );

                const totalValue = Number(order.total) || 0;
                const m = milestones.find(m => totalValue >= Number(m.min_order_value) && totalValue <= Number(m.max_order_value));
                if (m) {
                    finalPayout = Number((finalDistance * Number(m.base_pay_per_km)).toFixed(2));
                }
            }
        }

        const isCOD = order.payment_method?.toLowerCase() === 'cod';

        // Assign order to rider
        const updated = await prisma.orders.update({
            where: { id: orderId },
            data: {
                rider_id: rider.id,
                status: 'Confirmed',
                delivery_distance_km: finalDistance,
                rider_payout_amount: finalPayout,
                updated_at: new Date(),
            }
        });

        // COD: record collection liability (idempotent — no wallet freeze)
        if (isCOD) {
            const existingCod = await prisma.cod_collections.findUnique({ where: { order_id: orderId } });
            if (!existingCod) {
                await prisma.cod_collections.create({
                    data: {
                        rider_id: rider.id,
                        order_id: orderId,
                        amount_collected: order.total,
                        status: 'PENDING_DEPOSIT',
                    }
                });
            }
        }

        res.status(200).json({
            success: true,
            data: {
                order_id: updated.id,
                status: updated.status,
                rider_id: rider.id,
                is_cod: isCOD,
            },
            message: isCOD
                ? 'Order accepted. Collect cash on delivery and deposit to company account with proof.'
                : 'Order accepted successfully',
        });
    } catch (error) {
        console.error('Accept order error:', error);
        res.status(500).json({ success: false, error: 'Failed to accept order' });
    }
};

// ============ COMPLETE DELIVERY ============
export const completeDelivery = async (req, res) => {
    try {
        const { orderId } = req.params;

        const rider = await prisma.riders.findUnique({ where: { user_id: req.user.id } });
        if (!rider) return res.status(404).json({ success: false, error: 'Rider profile not found' });

        const order = await prisma.orders.findUnique({ where: { id: orderId } });
        if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

        if (order.rider_id !== rider.id) {
            return res.status(403).json({ success: false, error: 'This order is not assigned to you' });
        }

        const updated = await prisma.orders.update({
            where: { id: orderId },
            data: {
                status: 'Delivered',
                updated_at: new Date(),
            }
        });

        // For COD orders: record the collected amount so admin can verify deposit
        if (updated.payment_method?.toLowerCase() === 'cod') {
            // Check if a cod_collection record already exists (idempotency)
            const existingCod = await prisma.cod_collections.findUnique({ where: { order_id: orderId } });
            if (!existingCod) {
                await prisma.cod_collections.create({
                    data: {
                        rider_id: rider.id,
                        order_id: orderId,
                        amount_collected: updated.total,
                        status: 'PENDING_DEPOSIT',
                    }
                });
            }
        }

        // Trigger payout calculation for all sub-orders (non-blocking)
        // Payout goes through admin approval via rider_payouts table — no direct wallet credit here.
        setImmediate(async () => {
            try {
                const subOrders = await prisma.sub_orders.findMany({
                    where: { parent_order_id: orderId, source_type: { not: 'zonal' } },
                    select: { id: true }
                });
                for (const so of subOrders) {
                    await calculateAndCreatePayout(so.id, rider.id).catch(err =>
                        console.error(`[payout] completeDelivery sub-order ${so.id} failed:`, err.message)
                    );
                }
            } catch (err) {
                console.error('[payout] completeDelivery payout trigger error:', err.message);
            }
        });

        res.status(200).json({
            success: true,
            data: { order_id: updated.id, status: updated.status },
            message: 'Delivery completed successfully',
        });
    } catch (error) {
        console.error('Complete delivery error:', error);
        res.status(500).json({ success: false, error: 'Failed to complete delivery' });
    }
};

// ============ GET MY ORDERS (RIDER) ============
export const getMyOrders = async (req, res) => {
    try {
        const rider = await prisma.riders.findUnique({ where: { user_id: req.user.id } });
        if (!rider) return res.status(404).json({ success: false, error: 'Rider profile not found' });

        const { status, page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const where = { rider_id: rider.id };
        if (status) where.status = status;

        const [orders, total] = await Promise.all([
            prisma.orders.findMany({
                where,
                include: {
                    order_items: true,
                    users: { select: { name: true, phone: true } },
                },
                orderBy: { created_at: 'desc' },
                skip,
                take: parseInt(limit),
            }),
            prisma.orders.count({ where }),
        ]);

        res.status(200).json({
            success: true,
            data: orders.map(o => ({
                id: o.id,
                customer_name: o.users?.name,
                customer_phone: o.users?.phone,
                address: o.address,
                delivery_pincode: o.delivery_pincode,
                total: o.total,
                status: o.status,
                items_count: o.order_items.length,
                payment_method: o.payment_method,
                created_at: o.created_at,
            })),
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit)),
            },
        });
    } catch (error) {
        console.error('Get my orders error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch orders' });
    }
};

// ============ GET ORDER DETAILS (RIDER) ============
export const getOrderDetails = async (req, res) => {
    try {
        const { orderId } = req.params;

        const rider = await prisma.riders.findUnique({
            where: { user_id: req.user.id },
            include: { warehouse_riders: { include: { warehouses: true } } }
        });
        if (!rider) return res.status(404).json({ success: false, error: 'Rider profile not found' });

        const order = await prisma.orders.findUnique({
            where: { id: orderId },
            include: {
                users: { select: { name: true, phone: true } },
                order_items: {
                    include: {
                        variant: {
                            include: {
                                product: {
                                    select: {
                                        name: true,
                                        media: true,
                                        seller_id: true
                                    }
                                }
                            }
                        },
                        warehouse: {
                            select: {
                                name: true,
                                address: true
                            }
                        }
                    }
                }
            }
        });

        if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

        // Ensure the order is either assignable or assigned to this rider
        if (order.rider_id !== rider.id && order.rider_id !== null) {
            return res.status(403).json({ success: false, error: 'Not authorized to view this order' });
        }

        let finalDistance = Number(order.delivery_distance_km) || 0;
        let estimatedPayout = Number(order.rider_payout_amount) || 0;

        // If not assigned yet, calculate it dynamically
        if (!order.rider_id) {
            const milestones = await prisma.rider_payout_milestones.findMany({
                orderBy: { min_order_value: 'asc' }
            });

            let originPincode = null;
            for (const wr of rider.warehouse_riders || []) {
                if (wr.warehouses?.location) {
                    originPincode = wr.warehouses.location;
                    break;
                }
            }

            if (originPincode && order.delivery_pincode) {
                const locs = await prisma.pincode_locations.findMany({
                    where: { pincode: { in: [originPincode, order.delivery_pincode] } }
                });
                const originLoc = locs.find(l => l.pincode === originPincode);
                const destLoc = locs.find(l => l.pincode === order.delivery_pincode);

                if (originLoc && destLoc && originLoc.latitude && destLoc.latitude) {
                    finalDistance = calculateDistanceKm(
                        originLoc.latitude, originLoc.longitude,
                        destLoc.latitude, destLoc.longitude
                    );

                    const totalValue = Number(order.total) || 0;
                    const m = milestones.find(m => totalValue >= Number(m.min_order_value) && totalValue <= Number(m.max_order_value));
                    if (m) {
                        estimatedPayout = Number((finalDistance * Number(m.base_pay_per_km)).toFixed(2));
                    }
                }
            }
        }

        // Prepare item details and aggregate warehouse/seller sources
        const sources = new Map();

        // Unique set of seller IDs to fetch their addresses
        const sellerIds = [...new Set(order.order_items
            .map(item => item.variant?.product?.seller_id)
            .filter(Boolean))];

        const sellers = await prisma.sellers.findMany({
            where: { id: { in: sellerIds } },
            select: {
                id: true,
                business_name: true,
                address: true,
                city: true,
                state: true,
                pincode: true
            }
        });

        const sellerMap = new Map(sellers.map(s => [s.id, s]));

        const items = order.order_items.map(item => {
            const product = item.variant?.product;
            const productImg = product?.media?.[0]?.url || 'https://via.placeholder.com/150';
            const productName = product?.name || 'Unknown Product';
            const variantName = item.variant?.title || ''; // title is corrected from variant_name

            const sellerId = product?.seller_id;
            const seller = sellerId ? sellerMap.get(sellerId) : null;

            let pickupLocation;
            if (seller) {
                pickupLocation = {
                    type: 'Seller',
                    name: seller.business_name || 'Seller',
                    id: seller.id,
                    address: `${seller.address || ''}, ${seller.city || ''}, ${seller.state || ''} ${seller.pincode || ''}`.trim().replace(/^, |, $/g, '') || 'Address not found'
                };
            } else {
                pickupLocation = {
                    type: 'Warehouse',
                    name: item.warehouse?.name || 'Central Warehouse',
                    id: item.assigned_warehouse_id,
                    address: item.warehouse?.address || 'Warehouse Address not found'
                };
            }

            // Keep track of unique sources to show rider where to go
            const sourceKey = `${pickupLocation.type}-${pickupLocation.id || pickupLocation.name}`;
            if (!sources.has(sourceKey)) {
                sources.set(sourceKey, pickupLocation);
            }

            return {
                id: item.id,
                name: productName,
                variant: variantName,
                image: productImg,
                quantity: item.quantity,
                price: item.price,
                pickupLocation,
            };
        });

        res.status(200).json({
            success: true,
            data: {
                id: order.id,
                customer: {
                    name: order.users?.name || order.receiver_name,
                    phone: order.users?.phone || order.mobile,
                    address: order.address,
                    pincode: order.delivery_pincode,
                },
                pickup_locations: Array.from(sources.values()),
                items,
                payment: {
                    method: order.payment_method,
                    subtotal: order.subtotal,
                    shipping: order.shipping,
                    total: order.total,
                },
                status: order.status,
                created_at: order.created_at,
                rider_id: order.rider_id,
                estimated_payout: estimatedPayout,
                delivery_distance_km: finalDistance,
                // additional charges
                handling_charge: order.handling_charge,
                surge_charge: order.surge_charge,
                platform_charge: order.platform_charge,
            }
        });

    } catch (error) {
        console.error('Get order details error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch order details' });
    }
};

// ================================================================
// SUB-ORDER FULFILLMENT ENDPOINTS (Rider)
// ================================================================

import subOrderDao from '../dao/sub-order.dao.js';
import riderAssignmentDao from '../dao/rider-assignment.dao.js';
import fulfillmentEventDao from '../dao/fulfillment-event.dao.js';
import { calculateAndCreatePayout } from '../services/payoutService.js';
import { creditSellerEarnings } from '../services/sellerEarningsService.js';

/**
 * Get rider's sub-orders (active ones assigned to this rider)
 * GET /api/rider/orders/sub-orders
 */
export const getMySubOrders = async (req, res) => {
    try {
        const rider = await prisma.riders.findUnique({ where: { user_id: req.user.id } });
        if (!rider) return res.status(404).json({ success: false, error: 'Rider profile not found' });

        const subOrders = await subOrderDao.listByRiderId(rider.id);

        res.status(200).json({
            success: true,
            data: subOrders.map(so => ({
                id: so.id,
                parent_order_id: so.parent_order_id,
                source_type: so.source_type,
                fulfillment_status: so.fulfillment_status,
                warehouse: so.warehouse,
                customer: {
                    address: so.parent_order?.address,
                    pincode: so.parent_order?.delivery_pincode,
                    name: so.parent_order?.receiver_name,
                    phone: so.parent_order?.mobile,
                },
                items: so.sub_order_items?.map(item => ({
                    product_name: item.product?.name,
                    variant_name: item.variant?.title,
                    quantity: item.quantity,
                })),
            })),
        });
    } catch (error) {
        console.error('getMySubOrders error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Mark pickup complete for a sub-order
 * POST /api/rider/orders/:sub_order_id/pickup-complete
 */
export const markPickupComplete = async (req, res) => {
    try {
        const { sub_order_id } = req.params;

        const rider = await prisma.riders.findUnique({ where: { user_id: req.user.id } });
        if (!rider) return res.status(404).json({ success: false, error: 'Rider profile not found' });

        const subOrder = await subOrderDao.getById(sub_order_id);
        if (!subOrder) return res.status(404).json({ success: false, error: 'Sub-order not found' });

        if (subOrder.rider_id !== rider.id) {
            return res.status(403).json({ success: false, error: 'This sub-order is not assigned to you' });
        }

        if (!['confirmed', 'rider_pending'].includes(subOrder.fulfillment_status)) {
            return res.status(400).json({
                success: false,
                error: `Cannot mark pickup for sub-order in ${subOrder.fulfillment_status} status`,
            });
        }

        // Update sub-order status
        await subOrderDao.updateStatus(sub_order_id, 'picked');

        // Log event
        await fulfillmentEventDao.log(sub_order_id, 'picked', {
            rider_id: rider.id,
            picked_at: new Date().toISOString(),
        });

        // Update rider assignment stop if exists
        const assignment = await riderAssignmentDao.getActiveByOrderId(subOrder.parent_order_id);
        if (assignment) {
            const sequence = assignment.pickup_sequence || [];
            const stopIndex = sequence.findIndex(s => s.sub_order_id === sub_order_id);
            if (stopIndex >= 0) {
                await riderAssignmentDao.markPickupDone(assignment.id, stopIndex);
            }
        }

        res.status(200).json({
            success: true,
            message: 'Pickup marked complete',
            data: { sub_order_id, status: 'picked' },
        });
    } catch (error) {
        console.error('markPickupComplete error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Mark sub-order as delivered
 * POST /api/rider/orders/:sub_order_id/delivered
 */
export const markSubOrderDelivered = async (req, res) => {
    try {
        const { sub_order_id } = req.params;

        const rider = await prisma.riders.findUnique({ where: { user_id: req.user.id } });
        if (!rider) return res.status(404).json({ success: false, error: 'Rider profile not found' });

        const subOrder = await subOrderDao.getById(sub_order_id);
        if (!subOrder) return res.status(404).json({ success: false, error: 'Sub-order not found' });

        if (subOrder.rider_id !== rider.id) {
            return res.status(403).json({ success: false, error: 'This sub-order is not assigned to you' });
        }

        if (!['picked', 'in_transit'].includes(subOrder.fulfillment_status)) {
            return res.status(400).json({
                success: false,
                error: `Cannot deliver sub-order in ${subOrder.fulfillment_status} status`,
            });
        }

        // GPS DELIVERY VERIFICATION — rider must be within 100m of delivery address
        const { rider_latitude, rider_longitude } = req.body;

        if (rider_latitude == null || rider_longitude == null) {
            return res.status(400).json({
                success: false,
                error: 'rider_latitude and rider_longitude are required to mark delivery as complete',
            });
        }

        const parentOrder = await prisma.orders.findUnique({
            where: { id: subOrder.parent_order_id },
            select: { delivery_latitude: true, delivery_longitude: true },
        });

        if (parentOrder?.delivery_latitude && parentOrder?.delivery_longitude) {
            const distanceToDelivery = calculateDistanceKm(
                parseFloat(rider_latitude),
                parseFloat(rider_longitude),
                Number(parentOrder.delivery_latitude),
                Number(parentOrder.delivery_longitude)
            );
            const DELIVERY_RADIUS_KM = 0.1; // 100 metres
            if (distanceToDelivery > DELIVERY_RADIUS_KM) {
                return res.status(400).json({
                    success: false,
                    error: `You must be within 100m of the delivery address. Current distance: ${Math.round(distanceToDelivery * 1000)}m`,
                    distance_m: Math.round(distanceToDelivery * 1000),
                });
            }
        } else {
            console.warn(`[GPS] Order ${subOrder.parent_order_id} has no delivery coordinates; skipping GPS proximity check`);
        }

        // Mark delivered
        await subOrderDao.updateStatus(sub_order_id, 'delivered');

        await fulfillmentEventDao.log(sub_order_id, 'delivered', {
            rider_id: rider.id,
            delivered_at: new Date().toISOString(),
        });

        // Trigger distance-slab payout calculation for rider (non-blocking)
        setImmediate(() => {
            calculateAndCreatePayout(sub_order_id, rider.id).catch((err) =>
                console.error('[payout] calculateAndCreatePayout failed:', err.message)
            );
        });

        // Trigger seller wallet credit for seller-type sub-orders (non-blocking)
        if (subOrder.source_type === 'seller' && subOrder.seller_id) {
            setImmediate(() => {
                creditSellerEarnings(sub_order_id, subOrder.seller_id).catch((err) =>
                    console.error('[seller-earnings] creditSellerEarnings failed:', err.message)
                );
            });
        }

        // Check if all sub-orders for this order are delivered
        const allSubOrders = await subOrderDao.listByOrderId(subOrder.parent_order_id);
        const allDelivered = allSubOrders.every(
            so => so.fulfillment_status === 'delivered' || so.fulfillment_status === 'cancelled'
        );

        if (allDelivered) {
            // Update master order status
            await prisma.orders.update({
                where: { id: subOrder.parent_order_id },
                data: { status: 'Delivered', updated_at: new Date() },
            });

            // Complete rider assignment
            const assignment = await riderAssignmentDao.getActiveByOrderId(subOrder.parent_order_id);
            if (assignment) {
                await riderAssignmentDao.updateStatus(assignment.id, 'completed');
            }

            // Free up the rider
            await prisma.riders.update({
                where: { id: rider.id },
                data: { is_available: true },
            });
        }

        res.status(200).json({
            success: true,
            message: allDelivered ? 'All items delivered. Order complete!' : 'Sub-order delivered.',
            data: {
                sub_order_id,
                status: 'delivered',
                all_delivered: allDelivered,
            },
        });
    } catch (error) {
        console.error('markSubOrderDelivered error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ================================================================
// RIDER WALLET WITHDRAWAL
// ================================================================

const MAX_WITHDRAWAL = 5000;

/**
 * Request a wallet withdrawal (rider).
 * POST /api/rider/wallet/withdraw
 * Blocked if wallet is frozen (pending COD deposit).
 * Max ₹5,000 per request.
 */
export const requestRiderWithdrawal = async (req, res) => {
    try {
        const { amount } = req.body;
        const withdrawAmount = parseFloat(amount);

        if (!amount || isNaN(withdrawAmount) || withdrawAmount <= 0) {
            return res.status(400).json({ success: false, error: 'Valid positive amount is required' });
        }
        if (withdrawAmount > MAX_WITHDRAWAL) {
            return res.status(400).json({ success: false, error: `Maximum withdrawal per request is ₹${MAX_WITHDRAWAL.toLocaleString()}` });
        }

        const rider = await prisma.riders.findUnique({
            where: { user_id: req.user.id },
            select: { id: true, bank_account_no: true, bank_ifsc: true, bank_name: true },
        });
        if (!rider) return res.status(404).json({ success: false, error: 'Rider profile not found' });

        if (!rider.bank_account_no || !rider.bank_ifsc) {
            return res.status(400).json({ success: false, error: 'Bank details must be added before requesting a withdrawal' });
        }

        const wallet = await prisma.wallets.findFirst({ where: { user_id: req.user.id } });
        if (!wallet) return res.status(404).json({ success: false, error: 'Wallet not found. Complete a delivery first.' });

        // Block withdrawal if rider has any unresolved COD collections
        const pendingCod = await prisma.cod_collections.count({
            where: {
                rider_id: rider.id,
                status: { in: ['PENDING_DEPOSIT', 'DEPOSIT_CLAIMED'] },
            },
        });
        if (pendingCod > 0) {
            return res.status(403).json({
                success: false,
                error: `Withdrawal blocked: you have ${pendingCod} pending COD deposit(s). Submit deposit proof and wait for admin approval before withdrawing.`,
                pending_cod_count: pendingCod,
            });
        }

        if (Number(wallet.balance) < withdrawAmount) {
            return res.status(400).json({ success: false, error: 'Insufficient wallet balance' });
        }

        const result = await prisma.$transaction(async (tx) => {
            const updatedWallet = await tx.wallets.update({
                where: { id: wallet.id },
                data: {
                    balance: { decrement: withdrawAmount },
                    updated_at: new Date(),
                    version: { increment: 1 },
                },
            });

            const transaction = await tx.wallet_transactions.create({
                data: {
                    wallet_id: wallet.id,
                    user_id: req.user.id,
                    transaction_type: 'WITHDRAWAL',
                    amount: withdrawAmount,
                    balance_before: wallet.balance,
                    balance_after: updatedWallet.balance,
                    status: 'PENDING',
                    description: 'Rider withdrawal to bank account',
                },
            });

            return { updatedWallet, transaction };
        });

        res.status(200).json({
            success: true,
            message: 'Withdrawal requested. Admin will process within 1–2 business days.',
            data: {
                transaction_id: result.transaction.id,
                amount: withdrawAmount,
                new_balance: Number(result.updatedWallet.balance),
            },
        });
    } catch (error) {
        console.error('requestRiderWithdrawal error:', error);
        res.status(500).json({ success: false, error: 'Failed to process withdrawal request' });
    }
};
