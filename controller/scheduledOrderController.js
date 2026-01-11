import { supabase } from "../config/supabaseClient.js";
import moment from "moment-timezone";
import crypto from "crypto";

/**
 * Validate scheduled time
 */
const validateScheduledTime = (scheduledAt, timezone = 'UTC') => {
    const now = moment().tz(timezone);
    const scheduled = moment(scheduledAt).tz(timezone);

    const minFuture = now.clone().add(2, 'minutes');
    const maxFuture = now.clone().add(30, 'days');

    if (scheduled.isBefore(minFuture)) {
        throw new Error('Scheduled time must be at least 2 minutes in the future');
    }

    if (scheduled.isAfter(maxFuture)) {
        throw new Error('Cannot schedule more than 30 days in advance');
    }

    return scheduled.utc().toISOString();
};

/**
 * Generate idempotency key
 */
const generateIdempotencyKey = (userId) => {
    return `sched_${userId}_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
};

/**
 * Create a scheduled order
 * POST /api/scheduled-orders
 */
export const createScheduledOrder = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const {
            cart_items,
            address_id,
            scheduled_at,
            timezone = 'UTC',
            payment_method,
            payment_intent_id,
            metadata = {}
        } = req.body;

        // Validation
        if (!cart_items || !Array.isArray(cart_items) || cart_items.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Cart items are required'
            });
        }

        if (!scheduled_at) {
            return res.status(400).json({
                success: false,
                error: 'Scheduled time is required'
            });
        }

        if (!payment_method) {
            return res.status(400).json({
                success: false,
                error: 'Payment method is required'
            });
        }

        // Validate scheduled time
        let validatedScheduledAt;
        try {
            validatedScheduledAt = validateScheduledTime(scheduled_at, timezone);
        } catch (error) {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }

        // Calculate total amount
        const total_amount = cart_items.reduce((sum, item) => {
            return sum + (parseFloat(item.price) * parseInt(item.quantity));
        }, 0);

        // Verify address belongs to user
        if (address_id) {
            const { data: address, error: addressError } = await supabase
                .from('user_addresses')
                .select('id')
                .eq('id', address_id)
                .eq('user_id', userId)
                .single();

            if (addressError || !address) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid address'
                });
            }
        }

        // Generate idempotency key
        const idempotency_key = generateIdempotencyKey(userId);

        // Create scheduled order
        const { data, error } = await supabase
            .from('scheduled_orders')
            .insert([{
                user_id: userId,
                cart_items,
                address_id,
                scheduled_at: validatedScheduledAt,
                timezone,
                payment_method,
                payment_intent_id,
                total_amount,
                idempotency_key,
                metadata,
                status: 'SCHEDULED',
                payment_status: 'PENDING'
            }])
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({
            success: true,
            data: {
                id: data.id,
                scheduled_at: data.scheduled_at,
                status: data.status,
                total_amount: data.total_amount,
                idempotency_key: data.idempotency_key
            },
            message: 'Order scheduled successfully'
        });

    } catch (error) {
        console.error('Error creating scheduled order:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create scheduled order',
            message: error.message
        });
    }
};

/**
 * Get user's scheduled orders
 * GET /api/scheduled-orders
 */
export const getUserScheduledOrders = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const { status, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        let query = supabase
            .from('scheduled_orders')
            .select('*', { count: 'exact' })
            .eq('user_id', userId)
            .order('scheduled_at', { ascending: true });

        if (status) {
            query = query.eq('status', status);
        }

        query = query.range(offset, offset + limit - 1);

        const { data, error, count } = await query;

        if (error) throw error;

        // Format response
        const formattedData = data.map(order => ({
            id: order.id,
            scheduled_at: order.scheduled_at,
            status: order.status,
            total_amount: order.total_amount,
            items_count: order.cart_items.length,
            payment_method: order.payment_method,
            created_at: order.created_at
        }));

        res.status(200).json({
            success: true,
            data: formattedData,
            pagination: {
                total: count,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(count / limit)
            }
        });

    } catch (error) {
        console.error('Error fetching scheduled orders:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch scheduled orders',
            message: error.message
        });
    }
};

/**
 * Get scheduled order by ID
 * GET /api/scheduled-orders/:id
 */
export const getScheduledOrderById = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { id } = req.params;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const { data, error } = await supabase
            .from('scheduled_orders')
            .select('*')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (error || !data) {
            return res.status(404).json({
                success: false,
                error: 'Scheduled order not found'
            });
        }

        res.status(200).json({
            success: true,
            data
        });

    } catch (error) {
        console.error('Error fetching scheduled order:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch scheduled order',
            message: error.message
        });
    }
};

/**
 * Update scheduled order
 * PUT /api/scheduled-orders/:id
 */
export const updateScheduledOrder = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { id } = req.params;
        const { scheduled_at, timezone, cart_items } = req.body;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        // Check if order exists and belongs to user
        const { data: existingOrder, error: fetchError } = await supabase
            .from('scheduled_orders')
            .select('*')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (fetchError || !existingOrder) {
            return res.status(404).json({
                success: false,
                error: 'Scheduled order not found'
            });
        }

        // Can only update if status is SCHEDULED
        if (existingOrder.status !== 'SCHEDULED') {
            return res.status(400).json({
                success: false,
                error: `Cannot update order with status: ${existingOrder.status}`
            });
        }

        const updateData = {};

        // Validate and update scheduled time if provided
        if (scheduled_at) {
            try {
                updateData.scheduled_at = validateScheduledTime(
                    scheduled_at,
                    timezone || existingOrder.timezone
                );
                if (timezone) {
                    updateData.timezone = timezone;
                }
            } catch (error) {
                return res.status(400).json({
                    success: false,
                    error: error.message
                });
            }
        }

        // Update cart items if provided
        if (cart_items && Array.isArray(cart_items)) {
            updateData.cart_items = cart_items;
            updateData.total_amount = cart_items.reduce((sum, item) => {
                return sum + (parseFloat(item.price) * parseInt(item.quantity));
            }, 0);
        }

        // Perform update
        const { data, error } = await supabase
            .from('scheduled_orders')
            .update(updateData)
            .eq('id', id)
            .eq('user_id', userId)
            .select()
            .single();

        if (error) throw error;

        res.status(200).json({
            success: true,
            data,
            message: 'Scheduled order updated successfully'
        });

    } catch (error) {
        console.error('Error updating scheduled order:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update scheduled order',
            message: error.message
        });
    }
};

/**
 * Cancel scheduled order
 * DELETE /api/scheduled-orders/:id
 */
export const cancelScheduledOrder = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { id } = req.params;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        // Check if order exists and belongs to user
        const { data: existingOrder, error: fetchError } = await supabase
            .from('scheduled_orders')
            .select('status')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (fetchError || !existingOrder) {
            return res.status(404).json({
                success: false,
                error: 'Scheduled order not found'
            });
        }

        // Handle different statuses
        if (existingOrder.status === 'PROCESSING') {
            // Mark as cancel pending if currently processing
            await supabase
                .from('scheduled_orders')
                .update({
                    status: 'CANCELLED',
                    failure_reason: 'Cancelled by user during processing'
                })
                .eq('id', id);

            return res.status(200).json({
                success: true,
                message: 'Order cancellation requested (processing will be stopped)'
            });
        }

        if (existingOrder.status !== 'SCHEDULED') {
            return res.status(400).json({
                success: false,
                error: `Cannot cancel order with status: ${existingOrder.status}`
            });
        }

        // Cancel the order
        const { error } = await supabase
            .from('scheduled_orders')
            .update({
                status: 'CANCELLED',
                failure_reason: 'Cancelled by user'
            })
            .eq('id', id)
            .eq('user_id', userId);

        if (error) throw error;

        res.status(200).json({
            success: true,
            message: 'Scheduled order cancelled successfully'
        });

    } catch (error) {
        console.error('Error cancelling scheduled order:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to cancel scheduled order',
            message: error.message
        });
    }
};

/**
 * Get all scheduled orders (Admin only)
 * GET /api/admin/scheduled-orders
 */
export const getAllScheduledOrders = async (req, res) => {
    try {
        const { status, page = 1, limit = 50, from_date, to_date } = req.query;
        const offset = (page - 1) * limit;

        let query = supabase
            .from('scheduled_orders')
            .select('*, user_addresses(*)', { count: 'exact' })
            .order('scheduled_at', { ascending: true });

        if (status) {
            query = query.eq('status', status);
        }

        if (from_date) {
            query = query.gte('scheduled_at', from_date);
        }

        if (to_date) {
            query = query.lte('scheduled_at', to_date);
        }

        query = query.range(offset, offset + limit - 1);

        const { data, error, count } = await query;

        if (error) throw error;

        res.status(200).json({
            success: true,
            data,
            pagination: {
                total: count,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(count / limit)
            }
        });

    } catch (error) {
        console.error('Error fetching all scheduled orders:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch scheduled orders',
            message: error.message
        });
    }
};

/**
 * Manually execute scheduled order (Admin only)
 * POST /api/admin/scheduled-orders/:id/execute
 */
export const manuallyExecuteOrder = async (req, res) => {
    try {
        const { id } = req.params;

        // Import executor function
        const { executeScheduledOrder } = await import('../services/orderExecutor.js');

        const result = await executeScheduledOrder(id, 'manual-admin');

        res.status(200).json({
            success: result.success,
            message: result.message,
            data: result.data
        });

    } catch (error) {
        console.error('Error manually executing order:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to execute order',
            message: error.message
        });
    }
};
