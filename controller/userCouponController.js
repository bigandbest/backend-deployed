/**
 * USER COUPON CONTROLLERS
 */
import { supabase } from "../config/supabaseClient.js";
import couponValidator from "../services/couponValidator.js";
import prisma from "../config/prisma.js";
import { redisGet, redisSet } from "../lib/redis.js";
import { couponsKey, COUPONS_TTL } from "../lib/cacheKeys.js";

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
        error: "Missing required fields",
      });
    }

    const result = await couponValidator.validateCoupon(
      code,
      userId,
      cart_data,
    );

    if (!result.valid) {
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

    res.status(200).json({
      success: true,
      data: {
        coupon: result.coupon,
        discount: result.discount,
        finalAmount: result.finalAmount,
      },
      message: result.message,
    });
  } catch (error) {
    console.error("Error validating coupon:", error);
    res.status(500).json({
      success: false,
      error: "Failed to validate coupon",
      message: error.message,
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
        error: "Missing required fields",
      });
    }

    // Validate coupon
    const validation = await couponValidator.validateCoupon(
      code,
      userId,
      cart_data,
      session_id,
    );

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error,
      });
    }

    // Return validation results without creating a reservation
    // The coupon will be applied when the actual order is created
    const lockToken = `${userId}_${session_id}_${Date.now()}`;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    res.status(200).json({
      success: true,
      data: {
        coupon: validation.coupon,
        discount: validation.discount,
        finalAmount: validation.finalAmount,
        lockToken: lockToken,
        expiresAt: expiresAt,
      },
      message: "Coupon applied successfully",
    });
  } catch (error) {
    console.error("Error applying coupon:", error);
    res.status(500).json({
      success: false,
      error: "Failed to apply coupon",
      message: error.message,
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
        error: "Lock token required",
      });
    }

    // Since we're not creating database reservations anymore,
    // just return success. The coupon validation will run again
    // when the user proceeds to checkout.
    res.status(200).json({
      success: true,
      message: "Coupon removed successfully",
    });
  } catch (error) {
    console.error("Error removing coupon:", error);
    res.status(500).json({
      success: false,
      error: "Failed to remove coupon",
      message: error.message,
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

    // ── Cache-aside (cart-value bucket, 2-min TTL) ───────────────────────────
    const cartValueNum = cart_value ? parseFloat(cart_value) : 0;
    const bucket = Math.floor(cartValueNum / 100) * 100;
    const cacheKey = couponsKey(bucket);
    const cached = await redisGet(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.status(200).json(cached);
    }
    // ────────────────────────────────────────────────────────────────────────

    // Use Prisma to fetch active coupons (Bypasses RLS)
    const now = new Date();

    // Build where clause
    const whereClause = {
      status: "ACTIVE",
      valid_from: { lte: now },
      valid_to: { gte: now },
    };

    if (cart_value) {
      whereClause.min_order_value = { lte: parseFloat(cart_value) };
    }

    const coupons = await prisma.coupons.findMany({
      where: whereClause,
      orderBy: { discount_value: "desc" },
    });

    // Filter out coupons user has already used (if per-user limit)
    const availableCoupons = [];

    for (const coupon of coupons) {
      // Check if new user only
      if (coupon.new_user_only) {
        const orderCount = await prisma.orders.count({
          where: {
            user_id: userId,
            status: { in: ["DELIVERED", "COMPLETED"] },
          },
        });

        if (orderCount > 0) {
          continue; // Skip this coupon
        }
      }

      // Check usage limit
      if (coupon.usage_limit_per_user) {
        const usageCount = await prisma.coupon_usage.count({
          where: {
            coupon_id: coupon.id,
            user_id: userId,
            status: "APPLIED",
          },
        });

        if (usageCount >= coupon.usage_limit_per_user) {
          continue; // Skip this coupon
        }
      }

      availableCoupons.push(coupon);
    }

    const responseBody = {
      success: true,
      data: availableCoupons,
      count: availableCoupons.length,
    };

    await redisSet(cacheKey, responseBody, COUPONS_TTL);
    res.setHeader('X-Cache', 'MISS');
    res.status(200).json(responseBody);
  } catch (error) {
    console.error("Error fetching available coupons:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch available coupons",
      message: error.message,
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
        pages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching user coupon history:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch coupon history",
      message: error.message,
    });
  }
};
