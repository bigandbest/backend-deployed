import express from "express";
import { supabase } from "../config/supabaseClient.js";
import {
  getAllOrders,
  placeOrder,
  placeOrderWithDetailedAddress,
  getUserOrders,
  getMyOrders,
  getOrderDetails,
  updateOrderStatus,
  cancelOrder,
  deleteOrderById,
  getOrderTracking,
  getAllOrderItems,
  getOrderItemsByOrderId,
  getOrderItemsByProductId,
  deleteOrderItemsByOrderId,
} from "../controller/orderController.js";
import {
  createScheduledOrder,
  getUserScheduledOrders,
  getScheduledOrderById,
  updateScheduledOrder,
  cancelScheduledOrder,
  getAllScheduledOrders,
  manuallyExecuteOrder,
  createTimeSlot,
  updateTimeSlot,
  deleteTimeSlot,
  getAllTimeSlots,
  assignSlotToWarehouse,
  updateWarehouseSlotConfig,
  removeSlotFromWarehouse,
  getWarehouseSlots,
  getAvailableSlotsForWarehouse,
  getSlotAvailability
} from "../controller/scheduledOrderController.js";

import { authenticateToken, authenticateAdmin } from "../middleware/authenticate.js";
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

// Get complete order details by ID for authenticated user
router.get("/details/:orderId", authenticateUser, getOrderDetails);

// Admin/legacy endpoint with user_id parameter
router.get("/user/:user_id", getUserOrders);

router.put("/status/:id", updateOrderStatus);
router.put("/cancel/:id", cancelOrder);
router.delete("/delete/:id", deleteOrderById);

// Tracking endpoint - returns simple timeline for an order
router.get("/track/:orderId", getOrderTracking);

// --- Order Items Routes (Merged from orderItemsRoutes.js) ---
router.get("/items/all", getAllOrderItems);
router.get("/items/order/:order_id", getOrderItemsByOrderId);
router.get("/items/product/:product_id", getOrderItemsByProductId);
router.delete("/items/order/:order_id", deleteOrderItemsByOrderId);

// --- Scheduled Order Routes ---
router.post("/scheduled/create", authenticateToken, createScheduledOrder);
router.get("/scheduled/my-orders", authenticateToken, getUserScheduledOrders);
router.get("/scheduled/details/:id", authenticateToken, getScheduledOrderById);
router.put("/scheduled/update/:id", authenticateToken, updateScheduledOrder);
router.delete("/scheduled/cancel/:id", authenticateToken, cancelScheduledOrder);

// User routes for scheduling slots
router.get("/scheduling/available-slots/:warehouseId", authenticateToken, getAvailableSlotsForWarehouse);
router.get("/scheduling/slot-availability", authenticateToken, getSlotAvailability);

// Admin routes for scheduled orders
router.get("/scheduled/admin/all", authenticateAdmin, getAllScheduledOrders);
router.post("/scheduled/admin/:id/execute", authenticateAdmin, manuallyExecuteOrder);

// Admin routes for time slot management
router.post("/scheduling/admin/slots", authenticateAdmin, createTimeSlot);
router.put("/scheduling/admin/slots/:id", authenticateAdmin, updateTimeSlot);
router.delete("/scheduling/admin/slots/:id", authenticateAdmin, deleteTimeSlot);
router.get("/scheduling/admin/slots", authenticateAdmin, getAllTimeSlots);

// Admin routes for warehouse slot configuration
router.post("/scheduling/admin/warehouse-slots", authenticateAdmin, assignSlotToWarehouse);
router.put("/scheduling/admin/warehouse-slots/:id", authenticateAdmin, updateWarehouseSlotConfig);
router.delete("/scheduling/admin/warehouse-slots/:id", authenticateAdmin, removeSlotFromWarehouse);
router.get("/scheduling/admin/warehouse/:warehouseId/slots", authenticateAdmin, getWarehouseSlots);

export default router;
