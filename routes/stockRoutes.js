import express from "express";
import {
  updateProductStock,
  getProductStock,
  bulkUpdateStock,
  reduceStock,
  adjustStock,
  transferStock
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

// Transfer stock between warehouses
router.post("/transfer", transferStock);

// Adjust stock (add/remove)
router.post("/adjust", adjustStock);

export default router;