import { supabase } from "../config/supabaseClient.js";

/**
 * Get all delivery charge milestones
 */
export const getAllMilestones = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from("delivery_charge_milestones")
            .select("*")
            .order("min_order_value", { ascending: true });

        if (error) throw error;

        res.status(200).json({
            success: true,
            data: data || [],
            count: data?.length || 0,
        });
    } catch (error) {
        console.error("Error fetching milestones:", error);
        res.status(500).json({
            success: false,
            error: "Failed to fetch delivery charge milestones",
            message: error.message,
        });
    }
};

/**
 * Get milestone by ID
 */
export const getMilestoneById = async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from("delivery_charge_milestones")
            .select("*")
            .eq("id", id)
            .single();

        if (error) throw error;

        if (!data) {
            return res.status(404).json({
                success: false,
                error: "Milestone not found",
            });
        }

        res.status(200).json({
            success: true,
            data,
        });
    } catch (error) {
        console.error("Error fetching milestone:", error);
        res.status(500).json({
            success: false,
            error: "Failed to fetch milestone",
            message: error.message,
        });
    }
};

/**
 * Create new milestone
 */
export const createMilestone = async (req, res) => {
    try {
        const { min_order_value, delivery_charge, description, is_active } = req.body;

        // Validation
        if (min_order_value === undefined || min_order_value === null) {
            return res.status(400).json({
                success: false,
                error: "min_order_value is required",
            });
        }

        if (delivery_charge === undefined || delivery_charge === null) {
            return res.status(400).json({
                success: false,
                error: "delivery_charge is required",
            });
        }

        if (min_order_value < 0) {
            return res.status(400).json({
                success: false,
                error: "min_order_value must be greater than or equal to 0",
            });
        }

        if (delivery_charge < 0) {
            return res.status(400).json({
                success: false,
                error: "delivery_charge must be greater than or equal to 0",
            });
        }

        const { data, error } = await supabase
            .from("delivery_charge_milestones")
            .insert([
                {
                    min_order_value,
                    delivery_charge,
                    description: description || null,
                    is_active: is_active !== undefined ? is_active : true,
                },
            ])
            .select()
            .single();

        if (error) {
            // Check for unique constraint violation
            if (error.code === "23505") {
                return res.status(400).json({
                    success: false,
                    error: "A milestone with this order value already exists",
                });
            }
            throw error;
        }

        res.status(201).json({
            success: true,
            data,
            message: "Milestone created successfully",
        });
    } catch (error) {
        console.error("Error creating milestone:", error);
        res.status(500).json({
            success: false,
            error: "Failed to create milestone",
            message: error.message,
        });
    }
};

/**
 * Update milestone
 */
export const updateMilestone = async (req, res) => {
    try {
        const { id } = req.params;
        const { min_order_value, delivery_charge, description, is_active } = req.body;

        // Validation
        if (min_order_value !== undefined && min_order_value < 0) {
            return res.status(400).json({
                success: false,
                error: "min_order_value must be greater than or equal to 0",
            });
        }

        if (delivery_charge !== undefined && delivery_charge < 0) {
            return res.status(400).json({
                success: false,
                error: "delivery_charge must be greater than or equal to 0",
            });
        }

        const updateData = {};
        if (min_order_value !== undefined) updateData.min_order_value = min_order_value;
        if (delivery_charge !== undefined) updateData.delivery_charge = delivery_charge;
        if (description !== undefined) updateData.description = description;
        if (is_active !== undefined) updateData.is_active = is_active;

        const { data, error } = await supabase
            .from("delivery_charge_milestones")
            .update(updateData)
            .eq("id", id)
            .select()
            .single();

        if (error) {
            // Check for unique constraint violation
            if (error.code === "23505") {
                return res.status(400).json({
                    success: false,
                    error: "A milestone with this order value already exists",
                });
            }
            throw error;
        }

        if (!data) {
            return res.status(404).json({
                success: false,
                error: "Milestone not found",
            });
        }

        res.status(200).json({
            success: true,
            data,
            message: "Milestone updated successfully",
        });
    } catch (error) {
        console.error("Error updating milestone:", error);
        res.status(500).json({
            success: false,
            error: "Failed to update milestone",
            message: error.message,
        });
    }
};

/**
 * Delete milestone
 */
export const deleteMilestone = async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from("delivery_charge_milestones")
            .delete()
            .eq("id", id)
            .select()
            .single();

        if (error) throw error;

        if (!data) {
            return res.status(404).json({
                success: false,
                error: "Milestone not found",
            });
        }

        res.status(200).json({
            success: true,
            message: "Milestone deleted successfully",
        });
    } catch (error) {
        console.error("Error deleting milestone:", error);
        res.status(500).json({
            success: false,
            error: "Failed to delete milestone",
            message: error.message,
        });
    }
};

/**
 * Toggle milestone active status
 */
export const toggleMilestoneActive = async (req, res) => {
    try {
        const { id } = req.params;

        // First get current status
        const { data: currentData, error: fetchError } = await supabase
            .from("delivery_charge_milestones")
            .select("is_active")
            .eq("id", id)
            .single();

        if (fetchError) throw fetchError;

        if (!currentData) {
            return res.status(404).json({
                success: false,
                error: "Milestone not found",
            });
        }

        // Toggle the status
        const { data, error } = await supabase
            .from("delivery_charge_milestones")
            .update({ is_active: !currentData.is_active })
            .eq("id", id)
            .select()
            .single();

        if (error) throw error;

        res.status(200).json({
            success: true,
            data,
            message: `Milestone ${data.is_active ? "activated" : "deactivated"} successfully`,
        });
    } catch (error) {
        console.error("Error toggling milestone status:", error);
        res.status(500).json({
            success: false,
            error: "Failed to toggle milestone status",
            message: error.message,
        });
    }
};

/**
 * Calculate applicable delivery charge for a given order value
 */
export const getApplicableCharge = async (req, res) => {
    try {
        const { orderValue } = req.body;

        if (orderValue === undefined || orderValue === null) {
            return res.status(400).json({
                success: false,
                error: "orderValue is required",
            });
        }

        if (orderValue < 0) {
            return res.status(400).json({
                success: false,
                error: "orderValue must be greater than or equal to 0",
            });
        }

        // Get all active milestones ordered by min_order_value descending
        const { data, error } = await supabase
            .from("delivery_charge_milestones")
            .select("*")
            .eq("is_active", true)
            .lte("min_order_value", orderValue)
            .order("min_order_value", { ascending: false })
            .limit(1);

        if (error) throw error;

        // If no milestone found, return a default charge or error
        if (!data || data.length === 0) {
            return res.status(200).json({
                success: true,
                data: {
                    orderValue,
                    deliveryCharge: null,
                    milestone: null,
                    message: "No applicable milestone found for this order value",
                },
            });
        }

        const applicableMilestone = data[0];

        res.status(200).json({
            success: true,
            data: {
                orderValue,
                deliveryCharge: applicableMilestone.delivery_charge,
                milestone: applicableMilestone,
            },
        });
    } catch (error) {
        console.error("Error calculating delivery charge:", error);
        res.status(500).json({
            success: false,
            error: "Failed to calculate delivery charge",
            message: error.message,
        });
    }
};
