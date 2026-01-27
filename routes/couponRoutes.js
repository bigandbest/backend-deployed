import express from "express";
import {
    createCoupon,
    updateCoupon,
    toggleCouponStatus,
    getAllCoupons,
    getCouponUsageHistory,
    manualOverride,
    deleteCoupon
} from "../controller/couponController.js";
import {
    validateCouponCode,
    applyCouponCode,
    removeCouponCode,
    getAvailableCoupons,
    getUserCouponHistory
} from "../controller/userCouponController.js";
import { authenticateToken, authenticateTokenOptional } from "../middleware/authenticate.js";
import { requireAdmin } from "../middleware/authorize.js";

const router = express.Router();

// =====================================================
// USER ROUTES (Protected with JWT authentication)
// =====================================================

// Validate coupon code
router.post("/validate", authenticateToken, validateCouponCode);

// Apply coupon (reserve for checkout)
router.post("/apply", authenticateToken, applyCouponCode);

// Remove coupon (cancel reservation)
router.post("/remove", authenticateToken, removeCouponCode);

// Get available coupons for user
router.get("/available", authenticateTokenOptional, getAvailableCoupons);

// Get user's coupon usage history
router.get("/history", authenticateToken, getUserCouponHistory);

// =====================================================
// ADMIN ROUTES (Protected with admin authentication)
// =====================================================

// Create new coupon
router.post("/admin", authenticateToken, requireAdmin, createCoupon);

// Update coupon
router.put("/admin/:id", authenticateToken, requireAdmin, updateCoupon);

// Enable/Disable coupon
router.patch("/admin/:id/status", authenticateToken, requireAdmin, toggleCouponStatus);

// Get all coupons
router.get("/admin", authenticateToken, requireAdmin, getAllCoupons);

// Get coupon usage history
router.get("/admin/:id/usage", authenticateToken, requireAdmin, getCouponUsageHistory);

// Manual override
router.post("/admin/:id/override", authenticateToken, requireAdmin, manualOverride);

// Delete coupon
router.delete("/admin/:id", authenticateToken, requireAdmin, deleteCoupon);

export default router;
