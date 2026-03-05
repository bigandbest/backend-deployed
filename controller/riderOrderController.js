import prisma from '../config/prisma.js';

// ============ GET ASSIGNABLE ORDERS ============
export const getAssignableOrders = async (req, res) => {
    try {
        const rider = await prisma.riders.findUnique({
            where: { user_id: req.user.id },
            include: {
                warehouse_riders: {
                    where: { is_active: true },
                    include: {
                        warehouse: {
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
            .flatMap(wr => wr.warehouse.warehouse_pincodes.map(wp => wp.pincode));

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
                user: { select: { name: true, phone: true } },
            },
            orderBy: { created_at: 'desc' },
            take: 50,
        });

        res.status(200).json({
            success: true,
            data: orders.map(o => ({
                id: o.id,
                customer_name: o.user?.name,
                customer_phone: o.user?.phone,
                address: o.address,
                delivery_pincode: o.delivery_pincode,
                total: o.total,
                status: o.status,
                items_count: o.order_items.length,
                payment_method: o.payment_method,
                created_at: o.created_at,
            })),
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
                        warehouse: {
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
            .flatMap(wr => wr.warehouse.warehouse_pincodes.map(wp => wp.pincode));

        if (order.delivery_pincode && !riderPincodes.includes(order.delivery_pincode)) {
            return res.status(403).json({
                success: false,
                error: 'This order is outside your division. Delivery pincode does not match your assigned warehouse pincodes.',
                order_pincode: order.delivery_pincode,
                your_pincodes: riderPincodes,
            });
        }

        // Assign order to rider
        const updated = await prisma.orders.update({
            where: { id: orderId },
            data: {
                rider_id: rider.id,
                status: 'Confirmed',
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
                    user: { select: { name: true, phone: true } },
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
                customer_name: o.user?.name,
                customer_phone: o.user?.phone,
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

        const rider = await prisma.riders.findUnique({ where: { user_id: req.user.id } });
        if (!rider) return res.status(404).json({ success: false, error: 'Rider profile not found' });

        const order = await prisma.orders.findUnique({
            where: { id: orderId },
            include: {
                user: { select: { name: true, phone: true } },
                order_items: {
                    include: {
                        variant: {
                            include: {
                                product: { select: { name: true, media: true } }
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

        // Prepare item details and aggregate warehouse/seller sources
        const sources = new Map();

        const items = order.order_items.map(item => {
            const productImg = item.variant?.product?.media?.[0]?.url || 'https://via.placeholder.com/150';
            const productName = item.variant?.product?.name || 'Unknown Product';
            const variantName = item.variant?.variant_name || '';

            // We use assigned_warehouse_id if available (from placeOrder)
            // If not, we fall back to a generic default
            let pickupLocation = { type: 'Warehouse', name: item.warehouse_name || 'Central Warehouse', id: item.assigned_warehouse_id };
            if (!item.assigned_warehouse_id) {
                pickupLocation.name = 'Seller/Central Warehouse';
            }

            // Keep track of unique sources to show rider where to go
            const sourceKey = `${pickupLocation.type}-${pickupLocation.id || pickupLocation.name}`;
            if (!sources.has(sourceKey)) {
                sources.set(sourceKey, {
                    type: pickupLocation.type,
                    name: pickupLocation.name,
                    id: pickupLocation.id,
                    address: pickupLocation.id ? 'Loading address...' : 'Address from DB', // To be expanded if needed
                });
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
                    name: order.user?.name || order.receiver_name,
                    phone: order.user?.phone || order.mobile,
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
