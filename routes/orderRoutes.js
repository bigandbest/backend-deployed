import express from "express";
import { supabase } from "../config/supabaseClient.js";
import {
  getAllOrders,
  placeOrder,
  placeOrderWithDetailedAddress,
  getUserOrders,
  getMyOrders,
  updateOrderStatus,
  cancelOrder,
  deleteOrderById,
  getOrderTracking,
} from "../controller/orderController.js";
import {
  validateDeliveryAvailability,
  enrichOrderWithDelivery,
} from "../middleware/deliveryValidation.js";

const router = express.Router();

// Authentication middleware
const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: "No authorization token provided",
      });
    }

    // Verify token with Supabase
    const { data: user, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        success: false,
        error: "Invalid or expired token",
      });
    }

    req.user = user.user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: "Authentication failed",
    });
  }
};

router.get("/all", getAllOrders);
router.get("/", getAllOrders);
router.post(
  "/place",
  validateDeliveryAvailability,
  enrichOrderWithDelivery,
  placeOrder
);
router.post(
  "/place-detailed",
  validateDeliveryAvailability,
  enrichOrderWithDelivery,
  placeOrderWithDetailedAddress
);
router.get("/status/:id", async (req, res) => {
  const { data, error } = await supabase
    .from("orders")
    .select("status")
    .eq("id", req.params.id)
    .single();
  if (error)
    return res.status(500).json({ success: false, error: error.message });
  return res.json({ success: true, status: data.status });
});

// Authenticated endpoint for getting user's own orders
router.get("/my-orders", authenticateUser, getMyOrders);

// Admin/legacy endpoint with user_id parameter
router.get("/user/:user_id", getUserOrders);

router.put("/status/:id", updateOrderStatus);
router.put("/cancel/:id", cancelOrder);
router.delete("/delete/:id", deleteOrderById);

// Tracking endpoint - returns simple timeline for an order
router.get("/track/:orderId", getOrderTracking);

export default router;
