import couponDAO from "../dao/coupon.dao.js";
import couponValidator from "../services/couponValidator.js";
import moment from "moment-timezone";

/**
 * ADMIN COUPON CONTROLLERS
 */

/**
 * Create a new coupon
 */
export const createCoupon = async (req, res) => {
    try {
        const {
            code,
            discount_type,
            discount_value,
            max_discount,
            min_order_value,
            allowed_brands,
            new_user_only,
            usage_limit_total,
            usage_limit_per_user,
            valid_from,
            valid_to,
            timezone,
            description,
            terms_conditions
        } = req.body;

        // Validation
        if (!code || !discount_type || !discount_value || !valid_from || !valid_to) {
            return res.status(400).json({
                success: false,
                error: "Missing required fields"
            });
        }

        // Validate discount type
        if (!["FLAT", "PERCENTAGE"].includes(discount_type)) {
            return res.status(400).json({
                success: false,
                error: "Invalid discount type. Must be FLAT or PERCENTAGE"
            });
        }

        // Validate percentage
        if (discount_type === "PERCENTAGE" && (discount_value < 0 || discount_value > 100)) {
            return res.status(400).json({
                success: false,
                error: "Percentage discount must be between 0 and 100"
            });
        }

        const existing = await couponDAO.getByCode(code);
        if (existing) {
            return res.status(400).json({
                success: false,
                error: "Coupon code already exists"
            });
        }

        const tz = timezone || "UTC";
        const processedValidFrom = moment.tz(valid_from, tz).toISOString();
        const processedValidTo = moment.tz(valid_to, tz).toISOString();

        const data = await couponDAO.create({
            code: code.toUpperCase(),
            discount_type,
            discount_value,
            max_discount,
            min_order_value: min_order_value || 0,
            allowed_brands: allowed_brands || [],
            new_user_only: new_user_only || false,
            usage_limit_total,
            usage_limit_per_user: usage_limit_per_user || 1,
            valid_from: processedValidFrom,
            valid_to: processedValidTo,
            timezone: tz,
            description,
            terms_conditions,
            created_by: req.user?.id,
            status: "ACTIVE"
        });

        res.status(201).json({
            success: true,
            data,
            message: "Coupon created successfully"
        });
    } catch (error) {
        console.error("Error creating coupon:", error);
        res.status(500).json({
            success: false,
            error: "Failed to create coupon",
            message: error.message
        });
    }
};

/**
 * Update coupon
 */
export const updateCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const currentCoupon = await couponDAO.getById(id);
        if (!currentCoupon) {
            return res.status(404).json({
                success: false,
                error: "Coupon not found"
            });
        }

        const tz = updates.timezone || currentCoupon.timezone || "UTC";
        if (updates.valid_from) {
            updates.valid_from = moment.tz(updates.valid_from, tz).toISOString();
        }
        if (updates.valid_to) {
            updates.valid_to = moment.tz(updates.valid_to, tz).toISOString();
        }

        const data = await couponDAO.update(id, updates);

        res.status(200).json({
            success: true,
            data,
            message: "Coupon updated successfully"
        });
    } catch (error) {
        console.error("Error updating coupon:", error);
        res.status(500).json({
            success: false,
            error: "Failed to update coupon",
            message: error.message
        });
    }
};

/**
 * Enable/Disable coupon
 */
export const toggleCouponStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!["ACTIVE", "DISABLED"].includes(status)) {
            return res.status(400).json({
                success: false,
                error: "Invalid status. Must be ACTIVE or DISABLED"
            });
        }

        const data = await couponDAO.updateStatus(id, status);

        res.status(200).json({
            success: true,
            data,
            message: `Coupon ${status.toLowerCase()} successfully`
        });
    } catch (error) {
        console.error("Error toggling coupon status:", error);
        res.status(500).json({
            success: false,
            error: "Failed to update coupon status",
            message: error.message
        });
    }
};

/**
 * Get all coupons (admin)
 */
export const getAllCoupons = async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        const result = await couponDAO.list(
            { status },
            { page: parseInt(page), limit: parseInt(limit) }
        );

        res.status(200).json({
            success: true,
            data: result.items,
            pagination: {
                total: result.total,
                page: result.page,
                limit: result.limit,
                pages: Math.ceil(result.total / result.limit)
            }
        });
    } catch (error) {
        console.error("Error fetching coupons:", error);
        res.status(500).json({
            success: false,
            error: "Failed to fetch coupons",
            message: error.message
        });
    }
};

/**
 * Get coupon usage history
 */
export const getCouponUsageHistory = async (req, res) => {
    try {
        const { id } = req.params;
        const { page = 1, limit = 50 } = req.query;
        const offset = (page - 1) * limit;

        const result = await couponDAO.getUsageHistory(
            id,
            { page: parseInt(page), limit: parseInt(limit) }
        );

        res.status(200).json({
            success: true,
            data: {
                usage: result.usage,
                statistics: {
                    total_usage: result.total,
                    total_discount: 0,
                    unique_users: 0,
                    avg_discount: 0
                }
            },
            pagination: {
                total: result.total,
                page: result.page,
                limit: result.limit,
                pages: Math.ceil(result.total / result.limit)
            }
        });
    } catch (error) {
        console.error("Error fetching usage history:", error);
        res.status(500).json({
            success: false,
            error: "Failed to fetch usage history",
            message: error.message
        });
    }
};

/**
 * Manual override - force apply/cancel coupon
 */
export const manualOverride = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, order_id, user_id, reason } = req.body;

        if (!["APPLY", "CANCEL", "REFUND"].includes(action)) {
            return res.status(400).json({
                success: false,
                error: "Invalid action"
            });
        }

        let result;

        if (action === "CANCEL") {
            result = await couponValidator.cancelCouponUsage(order_id);
        } else if (action === "REFUND") {
            result = await couponValidator.refundCouponUsage(order_id);
        }

        // Log audit
        await supabase.from("coupon_audit_logs").insert({
            coupon_id: id,
            user_id: req.user?.id,
            action: `MANUAL_${action}`,
            metadata: { order_id, target_user_id: user_id, reason }
        });

        res.status(200).json({
            success: true,
            data: result,
            message: `Coupon ${action.toLowerCase()} override successful`
        });
    } catch (error) {
        console.error("Error in manual override:", error);
        res.status(500).json({
            success: false,
            error: "Manual override failed",
            message: error.message
        });
    }
};

/**
 * Delete coupon (soft delete by setting status to DISABLED)
 */
export const deleteCoupon = async (req, res) => {
    try {
        const { id } = req.params;

        await couponDAO.delete(id);

        res.status(200).json({
            success: true,
            message: "Coupon deleted successfully"
        });

    } catch (error) {
        // If record to delete does not exist (P2025), treat as success (idempotent)
        if (error.code === 'P2025') {
            return res.status(200).json({
                success: true,
                message: "Coupon deleted successfully (or already deleted)"
            });
        }

        // If Foreign Key Constraint failed (P2003) - likely due to usage history
        if (error.code === 'P2003') {
            try {
                // Fallback to soft delete
                await couponDAO.updateStatus(req.params.id, "DISABLED");
                return res.status(200).json({
                    success: true,
                    message: "Coupon has usage history, so it was disabled instead of deleted."
                });
            } catch (softDeleteError) {
                // If even soft delete fails
                return res.status(500).json({
                    success: false,
                    error: "Failed to delete or disable coupon",
                    message: softDeleteError.message
                });
            }
        }

        console.error("Error deleting coupon:", error);
        res.status(500).json({
            success: false,
            error: "Failed to delete coupon",
            message: error.message
        });
    }
};
