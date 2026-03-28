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

        res.status(200).json({
            success: true,
            data: {
                order_id: updated.id,
                status: updated.status,
                rider_id: rider.id,
            },
            message: 'Order accepted successfully',
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

        // Rider Payout Logic
        if (updated.rider_payout_amount && Number(updated.rider_payout_amount) > 0) {
            const isPrepaid = ['online', 'prepaid', 'wallet'].includes(updated.payment_method?.toLowerCase());

            if (isPrepaid) {
                // Ensure rider has a wallet
                let wallet = await prisma.wallets.findFirst({ where: { user_id: req.user.id } });
                if (!wallet) {
                    wallet = await prisma.wallets.create({
                        data: {
                            user_id: req.user.id,
                            balance: 0,
                            currency: 'INR',
                            status: 'active'
                        }
                    });
                }

                // Credit Wallet
                await prisma.wallets.update({
                    where: { id: wallet.id },
                    data: {
                        balance: { increment: updated.rider_payout_amount }
                    }
                });

                // Log Transaction
                await prisma.wallet_transactions.create({
                    data: {
                        wallet_id: wallet.id,
                        user_id: req.user.id,
                        amount: updated.rider_payout_amount,
                        type: 'credit',
                        status: 'completed',
                        description: `Payout for order #${orderId}`,
                        reference_id: orderId,
                        reference_type: 'rider_payout',
                        balance_after: Number(wallet.balance) + Number(updated.rider_payout_amount)
                    }
                });
            }
        }

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

        // Mark delivered
        await subOrderDao.updateStatus(sub_order_id, 'delivered');

        await fulfillmentEventDao.log(sub_order_id, 'delivered', {
            rider_id: rider.id,
            delivered_at: new Date().toISOString(),
        });

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
