import express from "express";
import {
  createCodOrder,
  getAllCodOrders,
  updateCodOrderStatus,
  getUserCodOrders,
  getCodOrderById,
  deleteCodOrder,
  getCodOrdersStats
} from "../controller/codOrderController.js";

const router = express.Router();

// COD Orders Routes
console.log('Setting up COD Orders routes...');

// Create COD order
router.post("/create", createCodOrder);

// Get all COD orders (Admin) with optional status filter
router.get("/all", getAllCodOrders);

// Get COD orders statistics
router.get("/stats", getCodOrdersStats);

// Get COD order by ID
router.get("/:id", getCodOrderById);

// Update COD order status
router.put("/status/:id", updateCodOrderStatus);

// Delete COD order
router.delete("/:id", deleteCodOrder);

// Get user's COD orders
router.get("/user/:user_id", getUserCodOrders);

console.log('COD Orders routes configured successfully');

export default router;