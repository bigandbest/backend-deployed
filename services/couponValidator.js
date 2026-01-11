import { supabase } from "../config/supabaseClient.js";
import moment from "moment-timezone";
import crypto from "crypto";

/**
 * Coupon Validation Service
 * Handles all coupon validation logic with sequential checks
 */

class CouponValidator {
    /**
     * Main validation function - runs all checks in sequence
     */
    async validateCoupon(code, userId, cartData, sessionId = null) {
        try {
            // 1. Existence & Active Status
            const coupon = await this.checkExistence(code);

            // 2. Expiry & Timezone
            await this.checkExpiry(coupon);

            // 3. User Eligibility
            await this.checkUserEligibility(coupon, userId);

            // 4. Usage Limits
            await this.checkUsageLimits(coupon, userId);

            // 5. Minimum Order Value
            await this.checkMinOrderValue(coupon, cartData);

            // 6. Brand/Product Eligibility
            await this.checkBrandEligibility(coupon, cartData);

            // 7. Calculate Discount
            const discount = await this.calculateDiscount(coupon, cartData);

            // 8. Final Payable Validation
            const finalAmount = await this.validateFinalAmount(cartData, discount);

            return {
                valid: true,
                coupon,
                discount,
                finalAmount,
                message: "Coupon applied successfully"
            };
        } catch (error) {
            return {
                valid: false,
                error: error.message,
                coupon: null,
                discount: 0
            };
        }
    }

    /**
     * 1. Check if coupon exists and is active
     */
    async checkExistence(code) {
        const { data: coupon, error } = await supabase
            .from("coupons")
            .select("*")
            .ilike("code", code)
            .single();

        if (error || !coupon) {
            throw new Error("Invalid coupon code");
        }

        if (coupon.status !== "ACTIVE") {
            if (coupon.status === "EXPIRED") {
                throw new Error("This coupon has expired");
            }
            throw new Error("This coupon is not currently available");
        }

        return coupon;
    }

    /**
     * 2. Check expiry with timezone handling
     */
    async checkExpiry(coupon) {
        const timezone = coupon.timezone || "UTC";
        const now = moment().tz(timezone);
        const validFrom = moment(coupon.valid_from).tz(timezone);
        const validTo = moment(coupon.valid_to).tz(timezone);

        if (now.isBefore(validFrom)) {
            throw new Error(`Coupon will be valid from ${validFrom.format("MMM DD, YYYY HH:mm")}`);
        }

        if (now.isAfter(validTo)) {
            throw new Error("Coupon has expired");
        }

        // Check if expiring within checkout window (5 min buffer)
        const expiryBuffer = moment(validTo).subtract(5, "minutes");
        if (now.isAfter(expiryBuffer)) {
            throw new Error("Coupon expires soon. Please complete checkout quickly");
        }

        return true;
    }

    /**
     * 3. Check user eligibility (new user only)
     */
    async checkUserEligibility(coupon, userId) {
        if (!coupon.new_user_only) {
            return true;
        }

        // Check for successful orders (exclude cancelled, failed, free)
        const { data: orders, error } = await supabase
            .from("orders")
            .select("id, status, total_amount, payment_status")
            .eq("user_id", userId)
            .in("status", ["DELIVERED", "COMPLETED", "CONFIRMED"])
            .in("payment_status", ["PAID", "COD_CONFIRMED"])
            .gt("total_amount", 0);

        if (error) {
            console.error("Error checking user eligibility:", error);
            throw new Error("Unable to verify user eligibility");
        }

        if (orders && orders.length > 0) {
            throw new Error("This coupon is only valid for new users");
        }

        return true;
    }

    /**
     * 4. Check usage limits (total and per-user)
     */
    async checkUsageLimits(coupon, userId) {
        // Check total usage limit
        if (coupon.usage_limit_total) {
            const { count: totalUsage, error: totalError } = await supabase
                .from("coupon_usage")
                .select("*", { count: "exact", head: true })
                .eq("coupon_id", coupon.id)
                .in("status", ["APPLIED", "RESERVED"]);

            if (totalError) {
                console.error("Error checking total usage:", totalError);
                throw new Error("Unable to verify coupon usage");
            }

            if (totalUsage >= coupon.usage_limit_total) {
                throw new Error("Coupon usage limit has been reached");
            }
        }

        // Check per-user usage limit
        if (coupon.usage_limit_per_user) {
            const { count: userUsage, error: userError } = await supabase
                .from("coupon_usage")
                .select("*", { count: "exact", head: true })
                .eq("coupon_id", coupon.id)
                .eq("user_id", userId)
                .eq("status", "APPLIED");

            if (userError) {
                console.error("Error checking user usage:", userError);
                throw new Error("Unable to verify your coupon usage");
            }

            if (userUsage >= coupon.usage_limit_per_user) {
                throw new Error("You have already used this coupon");
            }
        }

        return true;
    }

    /**
     * 5. Check minimum order value
     */
    async checkMinOrderValue(coupon, cartData) {
        const orderValue = cartData.subtotal || cartData.total || 0;

        if (orderValue < coupon.min_order_value) {
            throw new Error(
                `Minimum order value of ₹${coupon.min_order_value} required. Add ₹${(coupon.min_order_value - orderValue).toFixed(2)} more to your cart`
            );
        }

        return true;
    }

    /**
     * 6. Check brand eligibility
     */
    async checkBrandEligibility(coupon, cartData) {
        // If no brand restriction, all items are eligible
        if (!coupon.allowed_brands || coupon.allowed_brands.length === 0) {
            cartData.eligibleItems = cartData.items || [];
            return true;
        }

        // Filter items by allowed brands
        const eligibleItems = (cartData.items || []).filter(item =>
            coupon.allowed_brands.includes(item.brand_id)
        );

        if (eligibleItems.length === 0) {
            throw new Error("This coupon is not applicable to items in your cart");
        }

        // Store eligible items for discount calculation
        cartData.eligibleItems = eligibleItems;
        return true;
    }

    /**
     * 7. Calculate discount amount
     */
    async calculateDiscount(coupon, cartData) {
        // Calculate base amount (eligible items only if brand-specific)
        const baseAmount = cartData.eligibleItems && cartData.eligibleItems.length > 0
            ? cartData.eligibleItems.reduce((sum, item) =>
                sum + (item.price * item.quantity), 0)
            : (cartData.subtotal || cartData.total || 0);

        let discount = 0;

        if (coupon.discount_type === "FLAT") {
            discount = coupon.discount_value;
        } else if (coupon.discount_type === "PERCENTAGE") {
            discount = (baseAmount * coupon.discount_value) / 100;

            // Apply max discount cap
            if (coupon.max_discount && discount > coupon.max_discount) {
                discount = coupon.max_discount;
            }
        }

        // Ensure discount doesn't exceed base amount
        discount = Math.min(discount, baseAmount);

        // Round to 2 decimals
        return Math.round(discount * 100) / 100;
    }

    /**
     * 8. Validate final payable amount
     */
    async validateFinalAmount(cartData, discount) {
        const total = cartData.total || cartData.subtotal || 0;
        const finalAmount = total - discount;

        if (finalAmount < 0) {
            throw new Error("Invalid discount calculation");
        }

        // Minimum payable amount (₹1)
        if (finalAmount > 0 && finalAmount < 1) {
            throw new Error("Final amount is too low");
        }

        return Math.round(finalAmount * 100) / 100;
    }

    /**
     * Reserve coupon for checkout (concurrency control)
     */
    async reserveCoupon(couponId, userId, sessionId, orderValue, discount) {
        const lockToken = `${userId}_${sessionId}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

        try {
            // Clean expired reservations first
            await supabase.rpc("clean_expired_reservations");

            const { data, error } = await supabase
                .from("coupon_reservations")
                .insert({
                    coupon_id: couponId,
                    user_id: userId,
                    session_id: sessionId,
                    reserved_amount: discount,
                    order_value: orderValue,
                    lock_token: lockToken,
                    expires_at: expiresAt
                })
                .select()
                .single();

            if (error) {
                if (error.code === "23505") { // Unique violation
                    throw new Error("Coupon already reserved for this session");
                }
                throw error;
            }

            return { lockToken, expiresAt, reservation: data };
        } catch (err) {
            throw new Error(`Failed to reserve coupon: ${err.message}`);
        }
    }

    /**
     * Apply coupon (idempotent)
     */
    async applyCoupon(couponId, userId, orderId, discount, orderValue, lockToken) {
        const idempotencyKey = `coupon_${orderId}_${couponId}`;

        // Check if already applied (idempotency)
        const { data: existing } = await supabase
            .from("coupon_usage")
            .select("*")
            .eq("idempotency_key", idempotencyKey)
            .single();

        if (existing) {
            console.log("Coupon already applied, returning existing record");
            return existing;
        }

        // Verify reservation if lockToken provided
        if (lockToken) {
            const { data: reservation } = await supabase
                .from("coupon_reservations")
                .select("*")
                .eq("lock_token", lockToken)
                .single();

            if (!reservation) {
                throw new Error("Invalid or expired reservation");
            }
        }

        // Apply coupon
        const { data, error } = await supabase
            .from("coupon_usage")
            .insert({
                coupon_id: couponId,
                user_id: userId,
                order_id: orderId,
                discount_applied: discount,
                order_value: orderValue,
                final_amount: orderValue - discount,
                idempotency_key: idempotencyKey,
                status: "APPLIED",
                applied_at: new Date()
            })
            .select()
            .single();

        if (error) {
            throw new Error(`Failed to apply coupon: ${error.message}`);
        }

        // Remove reservation if exists
        if (lockToken) {
            await supabase
                .from("coupon_reservations")
                .delete()
                .eq("lock_token", lockToken);
        }

        return data;
    }

    /**
     * Cancel coupon usage (for failed payments)
     */
    async cancelCouponUsage(orderId) {
        const { data, error } = await supabase
            .from("coupon_usage")
            .update({
                status: "CANCELLED",
                cancelled_at: new Date()
            })
            .eq("order_id", orderId)
            .select()
            .single();

        if (error) {
            console.error("Error cancelling coupon usage:", error);
        }

        return data;
    }

    /**
     * Refund coupon usage
     */
    async refundCouponUsage(orderId) {
        const { data, error } = await supabase
            .from("coupon_usage")
            .update({
                status: "REFUNDED",
                refunded_at: new Date()
            })
            .eq("order_id", orderId)
            .select()
            .single();

        if (error) {
            console.error("Error refunding coupon usage:", error);
        }

        return data;
    }
}

export default new CouponValidator();
