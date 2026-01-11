import { supabase } from "../config/supabaseClient.js";
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

        // Check if code already exists
        const { data: existing } = await supabase
            .from("coupons")
            .select("id")
            .ilike("code", code)
            .single();

        if (existing) {
            return res.status(400).json({
                success: false,
                error: "Coupon code already exists"
            });
        }

        // Create coupon
        const { data, error } = await supabase
            .from("coupons")
            .insert({
                code: code.toUpperCase(),
                discount_type,
                discount_value,
                max_discount,
                min_order_value: min_order_value || 0,
                allowed_brands: allowed_brands || [],
                new_user_only: new_user_only || false,
                usage_limit_total,
                usage_limit_per_user: usage_limit_per_user || 1,
                valid_from,
                valid_to,
                timezone: timezone || "UTC",
                description,
                terms_conditions,
                created_by: req.user?.id,
                status: "ACTIVE"
            })
            .select()
            .single();

        if (error) throw error;

        // Log audit
        await supabase.from("coupon_audit_logs").insert({
            coupon_id: data.id,
            user_id: req.user?.id,
            action: "CREATED",
            new_values: data
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

        // Get current coupon
        const { data: currentCoupon } = await supabase
            .from("coupons")
            .select("*")
            .eq("id", id)
            .single();

        if (!currentCoupon) {
            return res.status(404).json({
                success: false,
                error: "Coupon not found"
            });
        }

        // Update coupon
        const { data, error } = await supabase
            .from("coupons")
            .update(updates)
            .eq("id", id)
            .select()
            .single();

        if (error) throw error;

        // Log audit
        await supabase.from("coupon_audit_logs").insert({
            coupon_id: id,
            user_id: req.user?.id,
            action: "UPDATED",
            old_values: currentCoupon,
            new_values: data
        });

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

        const { data, error } = await supabase
            .from("coupons")
            .update({ status })
            .eq("id", id)
            .select()
            .single();

        if (error) throw error;

        // Log audit
        await supabase.from("coupon_audit_logs").insert({
            coupon_id: id,
            user_id: req.user?.id,
            action: status === "ACTIVE" ? "ENABLED" : "DISABLED"
        });

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

        let query = supabase
            .from("coupons")
            .select("*, coupon_usage(count)", { count: "exact" })
            .order("created_at", { ascending: false })
            .range(offset, offset + limit - 1);

        if (status) {
            query = query.eq("status", status);
        }

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

        // Get usage records
        const { data: usage, error: usageError, count } = await supabase
            .from("coupon_usage")
            .select("*", { count: "exact" })
            .eq("coupon_id", id)
            .order("created_at", { ascending: false })
            .range(offset, offset + limit - 1);

        if (usageError) throw usageError;

        // Get statistics
        const { data: stats } = await supabase.rpc("get_coupon_stats", {
            coupon_uuid: id
        });

        res.status(200).json({
            success: true,
            data: {
                usage,
                statistics: stats?.[0] || {
                    total_usage: 0,
                    total_discount: 0,
                    unique_users: 0,
                    avg_discount: 0
                }
            },
            pagination: {
                total: count,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(count / limit)
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

        const { data, error } = await supabase
            .from("coupons")
            .update({ status: "DISABLED" })
            .eq("id", id)
            .select()
            .single();

        if (error) throw error;

        // Log audit
        await supabase.from("coupon_audit_logs").insert({
            coupon_id: id,
            user_id: req.user?.id,
            action: "DELETED"
        });

        res.status(200).json({
            success: true,
            message: "Coupon deleted successfully"
        });
    } catch (error) {
        console.error("Error deleting coupon:", error);
        res.status(500).json({
            success: false,
            error: "Failed to delete coupon",
            message: error.message
        });
    }
};
