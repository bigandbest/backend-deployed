/**
 * USER COUPON CONTROLLERS
 */
const supabase = require('../config/supabaseClient');
const CouponValidator = require('../services/couponValidator');
const couponValidator = new CouponValidator();

/**
 * Validate coupon code
 */
export const validateCouponCode = async (req, res) => {
    try {
        const { code, cart_data } = req.body;
        const userId = req.user?.id;

        if (!code || !cart_data) {
            return res.status(400).json({
                success: false,
                error: "Missing required fields"
            });
        }

        const result = await couponValidator.validateCoupon(
            code,
            userId,
            cart_data
        );

        if (!result.valid) {
            return res.status(400).json({
                success: false,
                error: result.error
            });
        }

        res.status(200).json({
            success: true,
            data: {
                coupon: result.coupon,
                discount: result.discount,
                finalAmount: result.finalAmount
            },
            message: result.message
        });
    } catch (error) {
        console.error("Error validating coupon:", error);
        res.status(500).json({
            success: false,
            error: "Failed to validate coupon",
            message: error.message
        });
    }
};

/**
 * Apply coupon (reserve for checkout)
 */
export const applyCouponCode = async (req, res) => {
    try {
        const { code, cart_data, session_id } = req.body;
        const userId = req.user?.id;

        if (!code || !cart_data || !session_id) {
            return res.status(400).json({
                success: false,
                error: "Missing required fields"
            });
        }

        // Validate coupon first
        const validation = await couponValidator.validateCoupon(
            code,
            userId,
            cart_data,
            session_id
        );

        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                error: validation.error
            });
        }

        // Reserve coupon
        const reservation = await couponValidator.reserveCoupon(
            validation.coupon.id,
            userId,
            session_id,
            cart_data.total || cart_data.subtotal,
            validation.discount
        );

        res.status(200).json({
            success: true,
            data: {
                coupon: validation.coupon,
                discount: validation.discount,
                finalAmount: validation.finalAmount,
                lockToken: reservation.lockToken,
                expiresAt: reservation.expiresAt
            },
            message: "Coupon applied successfully"
        });
    } catch (error) {
        console.error("Error applying coupon:", error);
        res.status(500).json({
            success: false,
            error: "Failed to apply coupon",
            message: error.message
        });
    }
};

/**
 * Remove coupon (cancel reservation)
 */
export const removeCouponCode = async (req, res) => {
    try {
        const { lock_token } = req.body;

        if (!lock_token) {
            return res.status(400).json({
                success: false,
                error: "Lock token required"
            });
        }

        // Remove reservation
        const { error } = await supabase
            .from("coupon_reservations")
            .delete()
            .eq("lock_token", lock_token);

        if (error) throw error;

        res.status(200).json({
            success: true,
            message: "Coupon removed successfully"
        });
    } catch (error) {
        console.error("Error removing coupon:", error);
        res.status(500).json({
            success: false,
            error: "Failed to remove coupon",
            message: error.message
        });
    }
};

/**
 * Get available coupons for user
 */
export const getAvailableCoupons = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { cart_value } = req.query;

        // Get active coupons
        let query = supabase
            .from("coupons")
            .select("*")
            .eq("status", "ACTIVE")
            .lte("valid_from", new Date().toISOString())
            .gte("valid_to", new Date().toISOString())
            .order("discount_value", { ascending: false });

        // Filter by minimum order value if cart value provided
        if (cart_value) {
            query = query.lte("min_order_value", parseFloat(cart_value));
        }

        const { data: coupons, error } = await query;

        if (error) throw error;

        // Filter out coupons user has already used (if per-user limit)
        const availableCoupons = [];

        for (const coupon of coupons) {
            // Check if new user only
            if (coupon.new_user_only) {
                const { data: orders } = await supabase
                    .from("orders")
                    .select("id")
                    .eq("user_id", userId)
                    .in("status", ["DELIVERED", "COMPLETED"])
                    .limit(1);

                if (orders && orders.length > 0) {
                    continue; // Skip this coupon
                }
            }

            // Check usage limit
            if (coupon.usage_limit_per_user) {
                const { count } = await supabase
                    .from("coupon_usage")
                    .select("*", { count: "exact", head: true })
                    .eq("coupon_id", coupon.id)
                    .eq("user_id", userId)
                    .eq("status", "APPLIED");

                if (count >= coupon.usage_limit_per_user) {
                    continue; // Skip this coupon
                }
            }

            availableCoupons.push(coupon);
        }

        res.status(200).json({
            success: true,
            data: availableCoupons,
            count: availableCoupons.length
        });
    } catch (error) {
        console.error("Error fetching available coupons:", error);
        res.status(500).json({
            success: false,
            error: "Failed to fetch available coupons",
            message: error.message
        });
    }
};

/**
 * Get user's coupon usage history
 */
export const getUserCouponHistory = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        const { data, error, count } = await supabase
            .from("coupon_usage")
            .select("*, coupons(code, description)", { count: "exact" })
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .range(offset, offset + limit - 1);

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
        console.error("Error fetching user coupon history:", error);
        res.status(500).json({
            success: false,
            error: "Failed to fetch coupon history",
            message: error.message
        });
    }
};
