import express from "express";
import {
  updateProductStock,
  getProductStock,
  bulkUpdateStock,
  reduceStock
} from "../controller/stockController.js";

const router = express.Router();

// Get product stock information
router.get("/:productId", getProductStock);

// Update single product stock
router.put("/:productId", updateProductStock);

// Reduce stock (for order processing)
router.post("/:productId/reduce", reduceStock);

// Bulk update stock for multiple products
router.post("/bulk-update", bulkUpdateStock);

export default router;