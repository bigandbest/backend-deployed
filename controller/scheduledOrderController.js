import prisma from "../config/prisma.js";
import moment from "moment-timezone";
import crypto from "crypto";

/**
 * Format Date object to HH:mm string
 */
const formatTimeToHHmm = (date) => {
    if (!date) return null;
    const d = new Date(date);
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
};

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
            const address = await prisma.user_addresses.findFirst({
                where: {
                    id: address_id,
                    user_id: userId
                }
            });

            if (!address) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid address'
                });
            }
        }

        // Generate idempotency key
        const idempotency_key = generateIdempotencyKey(userId);

        // Create scheduled order
        const data = await prisma.scheduled_orders.create({
            data: {
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
            }
        });

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
        const pageInt = parseInt(page);
        const limitInt = parseInt(limit);
        const offset = (pageInt - 1) * limitInt;

        const where = {
            user_id: userId
        };

        if (status) {
            where.status = status;
        }

        const [data, count] = await Promise.all([
            prisma.scheduled_orders.findMany({
                where,
                orderBy: {
                    scheduled_at: 'asc'
                },
                skip: offset,
                take: limitInt
            }),
            prisma.scheduled_orders.count({ where })
        ]);

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
                page: pageInt,
                limit: limitInt,
                pages: Math.ceil(count / limitInt)
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

        const data = await prisma.scheduled_orders.findFirst({
            where: {
                id: id,
                user_id: userId
            }
        });

        if (!data) {
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
        const existingOrder = await prisma.scheduled_orders.findFirst({
            where: {
                id: id,
                user_id: userId
            }
        });

        if (!existingOrder) {
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
        const data = await prisma.scheduled_orders.update({
            where: { id: id },
            data: updateData
        });

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
        const existingOrder = await prisma.scheduled_orders.findFirst({
            where: {
                id: id,
                user_id: userId
            },
            select: {
                status: true
            }
        });

        if (!existingOrder) {
            return res.status(404).json({
                success: false,
                error: 'Scheduled order not found'
            });
        }

        // Handle different statuses
        if (existingOrder.status === 'PROCESSING') {
            // Mark as cancelled if currently processing (will be caught by executor if possible)
            await prisma.scheduled_orders.update({
                where: { id: id },
                data: {
                    status: 'CANCELLED',
                    failure_reason: 'Cancelled by user during processing'
                }
            });

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
        await prisma.scheduled_orders.update({
            where: { id: id },
            data: {
                status: 'CANCELLED',
                failure_reason: 'Cancelled by user'
            }
        });

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
        const pageInt = parseInt(page);
        const limitInt = parseInt(limit);
        const offset = (pageInt - 1) * limitInt;

        const where = {};
        if (status) {
            where.status = status;
        }

        if (from_date || to_date) {
            where.scheduled_at = {};
            if (from_date) where.scheduled_at.gte = new Date(from_date);
            if (to_date) where.scheduled_at.lte = new Date(to_date);
        }

        const [data, count] = await Promise.all([
            prisma.scheduled_orders.findMany({
                where,
                include: {
                    user_addresses: true
                },
                orderBy: {
                    scheduled_at: 'asc'
                },
                skip: offset,
                take: limitInt
            }),
            prisma.scheduled_orders.count({ where })
        ]);

        res.status(200).json({
            success: true,
            data,
            pagination: {
                total: count,
                page: pageInt,
                limit: limitInt,
                pages: Math.ceil(count / limitInt)
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

// --- Scheduling & Time Slot Logic (Merged from schedulingController.js) ---

/**
 * Admin: Create a new time slot
 * POST /api/scheduled-orders/admin/slots
 */
export const createTimeSlot = async (req, res) => {
    try {
        const { start_time, end_time, display_name } = req.body;

        console.log('🔵 createTimeSlot called');
        console.log('  Start time:', start_time);
        console.log('  End time:', end_time);
        console.log('  Display name:', display_name);

        if (!start_time || !end_time || !display_name) {
            return res.status(400).json({
                success: false,
                error: "Start time, end time, and display name are required"
            });
        }

        // Convert time strings (HH:mm) to DateTime objects for Prisma Time fields
        // Prisma Time fields need full DateTime, but only the time portion is stored
        const convertTimeToDateTime = (timeStr) => {
            const [hours, minutes] = timeStr.split(':');
            const date = new Date();
            date.setHours(parseInt(hours), parseInt(minutes), 0, 0);
            return date;
        };

        const data = await prisma.scheduling_time_slots.create({
            data: {
                start_time: convertTimeToDateTime(start_time),
                end_time: convertTimeToDateTime(end_time),
                display_name,
                is_active: true,
                created_at: new Date(),
                updated_at: new Date()
            }
        });

        console.log('✅ Time slot created successfully:', data.id);

        res.status(201).json({
            success: true,
            data: {
                ...data,
                start_time: formatTimeToHHmm(data.start_time),
                end_time: formatTimeToHHmm(data.end_time)
            },
            message: "Time slot created successfully"
        });
    } catch (error) {
        console.error("❌ Error creating time slot:", error);
        res.status(500).json({
            success: false,
            error: "Failed to create time slot",
            details: error.message
        });
    }
};

/**
 * Admin: Update a time slot
 * PUT /api/scheduled-orders/admin/slots/:id
 */
export const updateTimeSlot = async (req, res) => {
    try {
        const { id } = req.params;
        const { start_time, end_time, display_name, is_active } = req.body;

        const updates = {};
        if (start_time !== undefined) {
            const [hours, minutes] = start_time.split(':');
            const date = new Date();
            date.setHours(parseInt(hours), parseInt(minutes), 0, 0);
            updates.start_time = date;
        }
        if (end_time !== undefined) {
            const [hours, minutes] = end_time.split(':');
            const date = new Date();
            date.setHours(parseInt(hours), parseInt(minutes), 0, 0);
            updates.end_time = date;
        }
        if (display_name !== undefined) updates.display_name = display_name;
        if (is_active !== undefined) updates.is_active = is_active;

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                error: "No fields to update"
            });
        }

        updates.updated_at = new Date();

        const data = await prisma.scheduling_time_slots.update({
            where: { id: parseInt(id) },
            data: updates
        });

        res.status(200).json({
            success: true,
            data: {
                ...data,
                start_time: formatTimeToHHmm(data.start_time),
                end_time: formatTimeToHHmm(data.end_time)
            },
            message: "Time slot updated successfully"
        });
    } catch (error) {
        console.error("❌ Error updating time slot:", error);
        res.status(500).json({
            success: false,
            error: "Failed to update time slot",
            details: error.message
        });
    }
};

/**
 * Admin: Delete a time slot (soft delete)
 * DELETE /api/scheduled-orders/admin/slots/:id
 */
export const deleteTimeSlot = async (req, res) => {
    try {
        const { id } = req.params;

        const data = await prisma.scheduling_time_slots.update({
            where: { id: parseInt(id) },
            data: {
                is_active: false,
                updated_at: new Date()
            }
        });

        res.status(200).json({
            success: true,
            data,
            message: "Time slot deleted successfully"
        });
    } catch (error) {
        console.error("❌ Error deleting time slot:", error);
        res.status(500).json({
            success: false,
            error: "Failed to delete time slot",
            details: error.message
        });
    }
};

/**
 * Admin: Get all time slots
 * GET /api/scheduled-orders/admin/slots
 */
export const getAllTimeSlots = async (req, res) => {
    try {
        const { is_active } = req.query;

        const where = {};
        if (is_active !== undefined) {
            where.is_active = is_active === "true";
        }

        const data = await prisma.scheduling_time_slots.findMany({
            where,
            orderBy: { start_time: 'asc' }
        });

        const formattedData = data.map(slot => ({
            ...slot,
            start_time: formatTimeToHHmm(slot.start_time),
            end_time: formatTimeToHHmm(slot.end_time)
        }));

        res.status(200).json({
            success: true,
            data: formattedData,
            count: data.length
        });
    } catch (error) {
        console.error("❌ Error fetching time slots:", error);
        res.status(500).json({
            success: false,
            error: "Failed to fetch time slots",
            details: error.message
        });
    }
};

/**
 * Admin: Assign slot to warehouse with capacity
 * POST /api/scheduled-orders/admin/warehouse-slots
 */
export const assignSlotToWarehouse = async (req, res) => {
    try {
        const { warehouse_id, slot_id, max_capacity, days_of_week, scheduling_window_hours } = req.body;

        if (!warehouse_id || !slot_id || !max_capacity) {
            return res.status(400).json({
                success: false,
                error: "Warehouse ID, slot ID, and max capacity are required"
            });
        }

        // Verify warehouse exists
        const warehouse = await prisma.warehouses.findUnique({
            where: { id: parseInt(warehouse_id) }
        });

        if (!warehouse) {
            return res.status(404).json({
                success: false,
                error: "Warehouse not found"
            });
        }

        // Verify slot exists
        const slot = await prisma.scheduling_time_slots.findUnique({
            where: { id: parseInt(slot_id) }
        });

        if (!slot) {
            return res.status(404).json({
                success: false,
                error: "Time slot not found"
            });
        }

        const insertData = {
            warehouse_id: parseInt(warehouse_id),
            slot_id: parseInt(slot_id),
            max_capacity: parseInt(max_capacity),
            scheduling_window_hours: scheduling_window_hours || 24,
            is_active: true,
            created_at: new Date(),
            updated_at: new Date()
        };

        if (days_of_week) {
            insertData.days_of_week = days_of_week;
        }

        const data = await prisma.warehouse_scheduling_config.create({
            data: insertData
        });

        res.status(201).json({
            success: true,
            data,
            message: "Slot assigned to warehouse successfully"
        });
    } catch (error) {
        console.error("❌ Error assigning slot to warehouse:", error);
        res.status(500).json({
            success: false,
            error: "Failed to assign slot to warehouse",
            details: error.message
        });
    }
};

/**
 * Admin: Update warehouse slot configuration
 * PUT /api/scheduled-orders/admin/warehouse-slots/:id
 */
export const updateWarehouseSlotConfig = async (req, res) => {
    try {
        const { id } = req.params;
        const { max_capacity, is_active, days_of_week, scheduling_window_hours } = req.body;

        const updates = {};
        if (max_capacity !== undefined) updates.max_capacity = parseInt(max_capacity);
        if (is_active !== undefined) updates.is_active = is_active;
        if (days_of_week !== undefined) updates.days_of_week = days_of_week;
        if (scheduling_window_hours !== undefined) updates.scheduling_window_hours = parseInt(scheduling_window_hours);

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                error: "No fields to update"
            });
        }

        updates.updated_at = new Date();

        const data = await prisma.warehouse_scheduling_config.update({
            where: { id: parseInt(id) },
            data: updates
        });

        res.status(200).json({
            success: true,
            data,
            message: "Warehouse slot configuration updated successfully"
        });
    } catch (error) {
        console.error("❌ Error updating warehouse slot config:", error);
        res.status(500).json({
            success: false,
            error: "Failed to update warehouse slot configuration",
            details: error.message
        });
    }
};

/**
 * Admin: Remove slot from warehouse
 * DELETE /api/scheduled-orders/admin/warehouse-slots/:id
 */
export const removeSlotFromWarehouse = async (req, res) => {
    try {
        const { id } = req.params;

        const data = await prisma.warehouse_scheduling_config.delete({
            where: { id: parseInt(id) }
        });

        res.status(200).json({
            success: true,
            data,
            message: "Slot removed from warehouse successfully"
        });
    } catch (error) {
        console.error("❌ Error removing slot from warehouse:", error);
        res.status(500).json({
            success: false,
            error: "Failed to remove slot from warehouse",
            details: error.message
        });
    }
};

/**
 * Admin: Get all slots for a warehouse
 * GET /api/scheduled-orders/admin/warehouse/:warehouseId/slots
 */
export const getWarehouseSlots = async (req, res) => {
    try {
        const { warehouseId } = req.params;

        const data = await prisma.warehouse_scheduling_config.findMany({
            where: {
                warehouse_id: parseInt(warehouseId)
            },
            include: {
                slot: true
            },
            orderBy: {
                slot: {
                    start_time: 'asc'
                }
            }
        });

        res.status(200).json({
            success: true,
            data: data.map(config => ({
                ...config,
                scheduling_time_slots: {
                    ...config.slot,
                    start_time: formatTimeToHHmm(config.slot.start_time),
                    end_time: formatTimeToHHmm(config.slot.end_time)
                }
            })),
            count: data.length
        });
    } catch (error) {
        console.error("❌ Error fetching warehouse slots:", error);
        res.status(500).json({
            success: false,
            error: "Failed to fetch warehouse slots",
            details: error.message
        });
    }
};

/**
 * User: Get available slots for a warehouse on a specific date
 * GET /api/scheduled-orders/available-slots/:warehouseId
 */
export const getAvailableSlotsForWarehouse = async (req, res) => {
    try {
        const { warehouseId } = req.params;
        const { date } = req.query;

        if (!date) {
            return res.status(400).json({
                success: false,
                error: "Date is required"
            });
        }

        const warehouseIdInt = parseInt(warehouseId);

        // Parse the requested date
        const requestedDate = new Date(date);
        const now = new Date();

        // Get day of week from date
        const dayOfWeek = requestedDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

        // Get warehouse slot configurations
        const configs = await prisma.warehouse_scheduling_config.findMany({
            where: {
                warehouse_id: warehouseIdInt,
                is_active: true
            },
            include: {
                slot: true
            }
        });

        // Filter by day of week and scheduling window
        const availableConfigs = configs.filter(config => {
            const daysOfWeek = config.days_of_week || ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

            // Check if day of week matches
            if (!daysOfWeek.includes(dayOfWeek)) {
                return false;
            }

            // Check if date is within scheduling window
            const schedulingWindowHours = config.scheduling_window_hours || 24;
            const maxAdvanceDate = new Date(now.getTime() + (schedulingWindowHours * 60 * 60 * 1000));

            // Date must be in the future but within the scheduling window
            if (requestedDate < now || requestedDate > maxAdvanceDate) {
                return false;
            }

            return true;
        });

        // Get current slot usage for the date
        const slotUsage = await prisma.scheduled_order_slots.findMany({
            where: {
                warehouse_id: warehouseIdInt,
                scheduled_date: new Date(date)
            },
            select: {
                slot_id: true,
                current_count: true
            }
        });

        // Create usage map
        const usageMap = {};
        slotUsage?.forEach(usage => {
            usageMap[usage.slot_id] = usage.current_count;
        });

        // Build response with availability
        const availableSlots = availableConfigs
            .filter(config => config.slot?.is_active)
            .map(config => {
                const currentCount = usageMap[config.slot_id] || 0;
                const remainingCapacity = config.max_capacity - currentCount;

                return {
                    slot_id: config.slot_id,
                    start_time: formatTimeToHHmm(config.slot.start_time),
                    end_time: formatTimeToHHmm(config.slot.end_time),
                    display_name: config.slot.display_name,
                    max_capacity: config.max_capacity,
                    current_count: currentCount,
                    remaining_capacity: remainingCapacity,
                    scheduling_window_hours: config.scheduling_window_hours || 24,
                    is_available: remainingCapacity > 0,
                    // Also include as scheduling_time_slots for legacy compatibility
                    scheduling_time_slots: {
                        ...config.slot,
                        start_time: formatTimeToHHmm(config.slot.start_time),
                        end_time: formatTimeToHHmm(config.slot.end_time)
                    }
                };
            })
            .sort((a, b) => a.start_time.localeCompare(b.start_time));

        res.status(200).json({
            success: true,
            data: availableSlots,
            warehouse_id: warehouseIdInt,
            date,
            day_of_week: dayOfWeek
        });
    } catch (error) {
        console.error("❌ Error fetching available slots:", error);
        res.status(500).json({
            success: false,
            error: "Internal server error",
            details: error.message
        });
    }
};

/**
 * User: Check slot availability
 * GET /api/scheduled-orders/slot-availability
 */
export const getSlotAvailability = async (req, res) => {
    try {
        const { warehouse_id, slot_id, date } = req.query;

        if (!warehouse_id || !slot_id || !date) {
            return res.status(400).json({
                success: false,
                error: "Warehouse ID, slot ID, and date are required"
            });
        }

        const warehouseIdInt = parseInt(warehouse_id);
        const slotIdInt = parseInt(slot_id);

        // Get warehouse slot config
        const config = await prisma.warehouse_scheduling_config.findFirst({
            where: {
                warehouse_id: warehouseIdInt,
                slot_id: slotIdInt,
                is_active: true
            },
            select: {
                max_capacity: true
            }
        });

        if (!config) {
            return res.status(404).json({
                success: false,
                error: "Slot not configured for this warehouse"
            });
        }

        // Get current usage
        const usage = await prisma.scheduled_order_slots.findFirst({
            where: {
                warehouse_id: warehouseIdInt,
                slot_id: slotIdInt,
                scheduled_date: new Date(date)
            },
            select: {
                current_count: true
            }
        });

        const currentCount = usage?.current_count || 0;
        const remainingCapacity = config.max_capacity - currentCount;

        res.status(200).json({
            success: true,
            data: {
                warehouse_id: warehouseIdInt,
                slot_id: slotIdInt,
                date,
                max_capacity: config.max_capacity,
                current_count: currentCount,
                remaining_capacity: remainingCapacity,
                is_available: remainingCapacity > 0
            }
        });
    } catch (error) {
        console.error("❌ Error checking slot availability:", error);
        res.status(500).json({
            success: false,
            error: "Internal server error",
            details: error.message
        });
    }
};
