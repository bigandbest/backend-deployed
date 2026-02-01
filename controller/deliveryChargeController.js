import deliveryChargeMilestoneDao from "../dao/delivery-charge-milestone.dao.js";

/**
 * Get all delivery charge milestones
 */
export const getAllMilestones = async (req, res) => {
    try {
        const data = await deliveryChargeMilestoneDao.list();

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

        const data = await deliveryChargeMilestoneDao.getById(parseInt(id));

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
        const { min_order_value, delivery_charge, discount, description, is_active } = req.body;

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

        const data = await deliveryChargeMilestoneDao.create({
            min_order_value,
            delivery_charge,
            discount: discount || 0,
            description: description || null,
            is_active: is_active !== undefined ? is_active : true,
        });

        res.status(201).json({
            success: true,
            data,
            message: "Milestone created successfully",
        });
    } catch (error) {
        console.error("Error creating milestone:", error);
        if (error.code === "P2002") {
            return res.status(400).json({
                success: false,
                error: "A milestone with this order value already exists",
            });
        }
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
        const { min_order_value, delivery_charge, discount, description, is_active } = req.body;

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
        if (discount !== undefined) updateData.discount = discount;
        if (description !== undefined) updateData.description = description;
        if (is_active !== undefined) updateData.is_active = is_active;

        const data = await deliveryChargeMilestoneDao.update(parseInt(id), updateData);

        res.status(200).json({
            success: true,
            data,
            message: "Milestone updated successfully",
        });
    } catch (error) {
        console.error("Error updating milestone:", error);
        if (error.code === "P2002") {
            return res.status(400).json({
                success: false,
                error: "A milestone with this order value already exists",
            });
        }
        if (error.code === "P2025") {
            return res.status(404).json({
                success: false,
                error: "Milestone not found",
            });
        }
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

        await deliveryChargeMilestoneDao.delete(parseInt(id));

        res.status(200).json({
            success: true,
            message: "Milestone deleted successfully",
        });
    } catch (error) {
        console.error("Error deleting milestone:", error);
        if (error.code === "P2025") {
            return res.status(404).json({
                success: false,
                error: "Milestone not found",
            });
        }
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
        const milestoneId = parseInt(id);

        // First get current status
        const currentData = await deliveryChargeMilestoneDao.getById(milestoneId);

        if (!currentData) {
            return res.status(404).json({
                success: false,
                error: "Milestone not found",
            });
        }

        // Toggle the status
        const data = await deliveryChargeMilestoneDao.update(milestoneId, {
            is_active: !currentData.is_active
        });

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

        const applicableMilestone = await deliveryChargeMilestoneDao.getApplicableCharge(orderValue);

        // If no milestone found, return a default charge or error
        if (!applicableMilestone) {
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

        res.status(200).json({
            success: true,
            data: {
                orderValue,
                deliveryCharge: applicableMilestone.delivery_charge,
                discount: applicableMilestone.discount,
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
