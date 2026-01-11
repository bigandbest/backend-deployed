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
import { authenticateToken, authenticateAdmin, authenticateTokenOptional } from "../middleware/authenticate.js";

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
router.post("/admin", authenticateAdmin, createCoupon);

// Update coupon
router.put("/admin/:id", authenticateAdmin, updateCoupon);

// Enable/Disable coupon
router.patch("/admin/:id/status", authenticateAdmin, toggleCouponStatus);

// Get all coupons
router.get("/admin", authenticateAdmin, getAllCoupons);

// Get coupon usage history
router.get("/admin/:id/usage", authenticateAdmin, getCouponUsageHistory);

// Manual override
router.post("/admin/:id/override", authenticateAdmin, manualOverride);

// Delete coupon
router.delete("/admin/:id", authenticateAdmin, deleteCoupon);

export default router;
