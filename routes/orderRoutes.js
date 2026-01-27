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
  createRazorpayOrder,
  verifyRazorpayPayment,
  verifyRazorpaySignature,
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
  getSlotAvailability,
} from "../controller/scheduledOrderController.js";

import { authenticateToken } from "../middleware/authenticate.js";
import { requireAdmin } from "../middleware/authorize.js";
import {
  validateDeliveryAvailability,
  enrichOrderWithDelivery,
} from "../middleware/deliveryValidation.js";

const router = express.Router();

// Authentication middleware removed - using centralized authenticateToken from middleware/authenticate.js

router.get("/all", getAllOrders);
router.get("/", getAllOrders);
router.post(
  "/place",
  validateDeliveryAvailability,
  enrichOrderWithDelivery,
  placeOrder,
);
router.post(
  "/place-detailed",
  validateDeliveryAvailability,
  enrichOrderWithDelivery,
  placeOrderWithDetailedAddress,
);
router.get("/status/:id", async (req, res) => {
  try {
    const order = await orderDao.getById(parseInt(req.params.id));
    if (!order) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }
    return res.json({ success: true, status: order.status });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Authenticated endpoint for getting user's own orders
router.get("/my-orders", authenticateToken, getMyOrders);

// Get complete order details by ID for authenticated user
router.get("/details/:orderId", authenticateToken, getOrderDetails);

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
router.get(
  "/scheduling/available-slots/:warehouseId",
  authenticateToken,
  getAvailableSlotsForWarehouse,
);
router.get(
  "/scheduling/slot-availability",
  authenticateToken,
  getSlotAvailability,
);

// Admin routes for scheduled orders
router.get("/scheduled/admin/all", authenticateToken, requireAdmin, getAllScheduledOrders);
router.post(
  "/scheduled/admin/:id/execute",
  authenticateToken, requireAdmin,
  manuallyExecuteOrder,
);

// Admin routes for time slot management
router.post("/admin/slots", authenticateToken, requireAdmin, createTimeSlot);
router.put("/admin/slots/:id", authenticateToken, requireAdmin, updateTimeSlot);
router.delete("/admin/slots/:id", authenticateToken, requireAdmin, deleteTimeSlot);
router.get("/admin/slots", authenticateToken, requireAdmin, getAllTimeSlots);

// Admin routes for warehouse slot configuration
router.post("/admin/warehouse-slots", authenticateToken, requireAdmin, assignSlotToWarehouse);
router.put(
  "/admin/warehouse-slots/:id",
  authenticateToken, requireAdmin,
  updateWarehouseSlotConfig,
);
router.delete(
  "/admin/warehouse-slots/:id",
  authenticateToken, requireAdmin,
  removeSlotFromWarehouse,
);
router.get(
  "/admin/warehouse/:warehouseId/slots",
  authenticateToken, requireAdmin,
  getWarehouseSlots,
);

// --- Payment & Online Order Routes (Merged) ---
router.post("/payments/create-order", createRazorpayOrder);
router.post("/payments/verify-payment", verifyRazorpayPayment);
router.post("/payments/verify-signature", verifyRazorpaySignature);

// Legacy Online Payment Order Route
router.post("/online-order/create", placeOrderWithDetailedAddress);

export default router;
