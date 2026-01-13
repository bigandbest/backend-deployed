import { supabase } from "../config/supabaseClient.js";

/**
 * Admin: Create a new time slot
 * POST /api/scheduled-orders/admin/slots
 */
export const createTimeSlot = async (req, res) => {
    try {
        const { start_time, end_time, display_name } = req.body;

        if (!start_time || !end_time || !display_name) {
            return res.status(400).json({
                success: false,
                error: "Start time, end time, and display name are required"
            });
        }

        const { data, error } = await supabase
            .from("scheduling_time_slots")
            .insert([{ start_time, end_time, display_name }])
            .select()
            .single();

        if (error) {
            console.error("Error creating time slot:", error);
            return res.status(500).json({
                success: false,
                error: "Failed to create time slot",
                details: error.message
            });
        }

        res.status(201).json({
            success: true,
            data,
            message: "Time slot created successfully"
        });
    } catch (error) {
        console.error("Server error:", error);
        res.status(500).json({
            success: false,
            error: "Internal server error"
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
        if (start_time !== undefined) updates.start_time = start_time;
        if (end_time !== undefined) updates.end_time = end_time;
        if (display_name !== undefined) updates.display_name = display_name;
        if (is_active !== undefined) updates.is_active = is_active;

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                error: "No fields to update"
            });
        }

        const { data, error } = await supabase
            .from("scheduling_time_slots")
            .update(updates)
            .eq("id", id)
            .select()
            .single();

        if (error) {
            console.error("Error updating time slot:", error);
            return res.status(500).json({
                success: false,
                error: "Failed to update time slot",
                details: error.message
            });
        }

        res.status(200).json({
            success: true,
            data,
            message: "Time slot updated successfully"
        });
    } catch (error) {
        console.error("Server error:", error);
        res.status(500).json({
            success: false,
            error: "Internal server error"
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

        const { data, error } = await supabase
            .from("scheduling_time_slots")
            .update({ is_active: false })
            .eq("id", id)
            .select()
            .single();

        if (error) {
            console.error("Error deleting time slot:", error);
            return res.status(500).json({
                success: false,
                error: "Failed to delete time slot",
                details: error.message
            });
        }

        res.status(200).json({
            success: true,
            data,
            message: "Time slot deleted successfully"
        });
    } catch (error) {
        console.error("Server error:", error);
        res.status(500).json({
            success: false,
            error: "Internal server error"
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

        let query = supabase
            .from("scheduling_time_slots")
            .select("*")
            .order("start_time", { ascending: true });

        if (is_active !== undefined) {
            query = query.eq("is_active", is_active === "true");
        }

        const { data, error } = await query;

        if (error) {
            console.error("Error fetching time slots:", error);
            return res.status(500).json({
                success: false,
                error: "Failed to fetch time slots",
                details: error.message
            });
        }

        res.status(200).json({
            success: true,
            data,
            count: data.length
        });
    } catch (error) {
        console.error("Server error:", error);
        res.status(500).json({
            success: false,
            error: "Internal server error"
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
        const { data: warehouse, error: warehouseError } = await supabase
            .from("warehouses")
            .select("id")
            .eq("id", warehouse_id)
            .single();

        if (warehouseError || !warehouse) {
            return res.status(404).json({
                success: false,
                error: "Warehouse not found"
            });
        }

        // Verify slot exists
        const { data: slot, error: slotError } = await supabase
            .from("scheduling_time_slots")
            .select("id")
            .eq("id", slot_id)
            .single();

        if (slotError || !slot) {
            return res.status(404).json({
                success: false,
                error: "Time slot not found"
            });
        }

        const insertData = {
            warehouse_id,
            slot_id,
            max_capacity,
            scheduling_window_hours: scheduling_window_hours || 24
        };

        if (days_of_week) {
            insertData.days_of_week = days_of_week;
        }

        const { data, error } = await supabase
            .from("warehouse_scheduling_config")
            .insert([insertData])
            .select()
            .single();

        if (error) {
            console.error("Error assigning slot to warehouse:", error);
            return res.status(500).json({
                success: false,
                error: "Failed to assign slot to warehouse",
                details: error.message
            });
        }

        res.status(201).json({
            success: true,
            data,
            message: "Slot assigned to warehouse successfully"
        });
    } catch (error) {
        console.error("Server error:", error);
        res.status(500).json({
            success: false,
            error: "Internal server error"
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
        if (max_capacity !== undefined) updates.max_capacity = max_capacity;
        if (is_active !== undefined) updates.is_active = is_active;
        if (days_of_week !== undefined) updates.days_of_week = days_of_week;
        if (scheduling_window_hours !== undefined) updates.scheduling_window_hours = scheduling_window_hours;

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                error: "No fields to update"
            });
        }

        const { data, error } = await supabase
            .from("warehouse_scheduling_config")
            .update(updates)
            .eq("id", id)
            .select()
            .single();

        if (error) {
            console.error("Error updating warehouse slot config:", error);
            return res.status(500).json({
                success: false,
                error: "Failed to update warehouse slot configuration",
                details: error.message
            });
        }

        res.status(200).json({
            success: true,
            data,
            message: "Warehouse slot configuration updated successfully"
        });
    } catch (error) {
        console.error("Server error:", error);
        res.status(500).json({
            success: false,
            error: "Internal server error"
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

        const { data, error } = await supabase
            .from("warehouse_scheduling_config")
            .update({ is_active: false })
            .eq("id", id)
            .select()
            .single();

        if (error) {
            console.error("Error removing slot from warehouse:", error);
            return res.status(500).json({
                success: false,
                error: "Failed to remove slot from warehouse",
                details: error.message
            });
        }

        res.status(200).json({
            success: true,
            data,
            message: "Slot removed from warehouse successfully"
        });
    } catch (error) {
        console.error("Server error:", error);
        res.status(500).json({
            success: false,
            error: "Internal server error"
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

        const { data, error } = await supabase
            .from("warehouse_scheduling_config")
            .select(`
                *,
                scheduling_time_slots (
                    id,
                    start_time,
                    end_time,
                    display_name,
                    is_active
                )
            `)
            .eq("warehouse_id", warehouseId)
            .order("scheduling_time_slots(start_time)", { ascending: true });

        if (error) {
            console.error("Error fetching warehouse slots:", error);
            return res.status(500).json({
                success: false,
                error: "Failed to fetch warehouse slots",
                details: error.message
            });
        }

        res.status(200).json({
            success: true,
            data,
            count: data.length
        });
    } catch (error) {
        console.error("Server error:", error);
        res.status(500).json({
            success: false,
            error: "Internal server error"
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

        // Parse the requested date
        const requestedDate = new Date(date);
        const now = new Date();

        // Get day of week from date
        const dayOfWeek = requestedDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

        // Get warehouse slot configurations
        const { data: configs, error: configError } = await supabase
            .from("warehouse_scheduling_config")
            .select(`
                *,
                scheduling_time_slots (
                    id,
                    start_time,
                    end_time,
                    display_name
                )
            `)
            .eq("warehouse_id", warehouseId)
            .eq("is_active", true);

        if (configError) {
            console.error("Error fetching warehouse configs:", configError);
            return res.status(500).json({
                success: false,
                error: "Failed to fetch warehouse configurations",
                details: configError.message
            });
        }

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
        const { data: slotUsage, error: usageError } = await supabase
            .from("scheduled_order_slots")
            .select("slot_id, current_count")
            .eq("warehouse_id", warehouseId)
            .eq("scheduled_date", date);

        if (usageError) {
            console.error("Error fetching slot usage:", usageError);
            return res.status(500).json({
                success: false,
                error: "Failed to fetch slot usage",
                details: usageError.message
            });
        }

        // Create usage map
        const usageMap = {};
        slotUsage?.forEach(usage => {
            usageMap[usage.slot_id] = usage.current_count;
        });

        // Build response with availability
        const availableSlots = availableConfigs
            .filter(config => config.scheduling_time_slots?.is_active)
            .map(config => {
                const currentCount = usageMap[config.slot_id] || 0;
                const remainingCapacity = config.max_capacity - currentCount;

                return {
                    slot_id: config.slot_id,
                    start_time: config.scheduling_time_slots.start_time,
                    end_time: config.scheduling_time_slots.end_time,
                    display_name: config.scheduling_time_slots.display_name,
                    max_capacity: config.max_capacity,
                    current_count: currentCount,
                    remaining_capacity: remainingCapacity,
                    scheduling_window_hours: config.scheduling_window_hours || 24,
                    is_available: remainingCapacity > 0
                };
            })
            .sort((a, b) => a.start_time.localeCompare(b.start_time));

        res.status(200).json({
            success: true,
            data: availableSlots,
            warehouse_id: parseInt(warehouseId),
            date,
            day_of_week: dayOfWeek
        });
    } catch (error) {
        console.error("Server error:", error);
        res.status(500).json({
            success: false,
            error: "Internal server error"
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

        // Get warehouse slot config
        const { data: config, error: configError } = await supabase
            .from("warehouse_scheduling_config")
            .select("max_capacity")
            .eq("warehouse_id", warehouse_id)
            .eq("slot_id", slot_id)
            .eq("is_active", true)
            .single();

        if (configError || !config) {
            return res.status(404).json({
                success: false,
                error: "Slot not configured for this warehouse"
            });
        }

        // Get current usage
        const { data: usage, error: usageError } = await supabase
            .from("scheduled_order_slots")
            .select("current_count")
            .eq("warehouse_id", warehouse_id)
            .eq("slot_id", slot_id)
            .eq("scheduled_date", date)
            .single();

        const currentCount = usage?.current_count || 0;
        const remainingCapacity = config.max_capacity - currentCount;

        res.status(200).json({
            success: true,
            data: {
                warehouse_id: parseInt(warehouse_id),
                slot_id: parseInt(slot_id),
                date,
                max_capacity: config.max_capacity,
                current_count: currentCount,
                remaining_capacity: remainingCapacity,
                is_available: remainingCapacity > 0
            }
        });
    } catch (error) {
        console.error("Server error:", error);
        res.status(500).json({
            success: false,
            error: "Internal server error"
        });
    }
};
