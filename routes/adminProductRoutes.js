import express from "express";
import {
  getAllProductsForAdmin,
  updateProductWarehouseMapping,
  getProductForAdmin,
} from "../controller/adminProductController.js";

const router = express.Router();

// GET /api/admin/products - Get all products for admin with full details
router.get("/products", getAllProductsForAdmin);

// GET /api/admin/products/:productId - Get single product for admin
router.get("/products/:productId", getProductForAdmin);

// PUT /api/admin/products/:productId/warehouse-mapping - Update warehouse mapping
router.put(
  "/products/:productId/warehouse-mapping",
  updateProductWarehouseMapping
);

export default router;
