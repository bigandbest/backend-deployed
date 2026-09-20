import express from "express";
import {
  getAllProductsForAdmin,
  getProductSummaryForAdmin,
  getProductFilterOptions,
  updateProductWarehouseMapping,
  getProductForAdmin,
  deleteProductForAdmin,
  updateProduct,
  createProduct,
} from "../controller/adminProductController.js";
import { authenticateToken } from "../middleware/authenticate.js";
import { requireAdmin } from "../middleware/authorize.js";

const router = express.Router();

// POST /api/admin/products - Create new product
router.post("/products", authenticateToken, requireAdmin, createProduct);

// GET /api/admin/products - Get all products for admin with full details
router.get("/products", authenticateToken, requireAdmin, getAllProductsForAdmin);

// Static paths must be registered before /products/:productId
// New endpoints are admin-guarded (the admin client already sends its Bearer token).
router.get("/products/summary", authenticateToken, requireAdmin, getProductSummaryForAdmin);
router.get("/products/filter-options", authenticateToken, requireAdmin, getProductFilterOptions);

// GET /api/admin/products/:productId - Get single product for admin
router.get("/products/:productId", authenticateToken, requireAdmin, getProductForAdmin);

// PUT /api/admin/products/:productId - Update product (general update)
router.put("/products/:productId", authenticateToken, requireAdmin, updateProduct);

// PUT /api/admin/products/:productId/warehouse-mapping - Update warehouse mapping
router.put("/products/:productId/warehouse-mapping", authenticateToken, requireAdmin, updateProductWarehouseMapping);

// DELETE /api/admin/products/:productId - Delete product for admin
router.delete("/products/:productId", authenticateToken, requireAdmin, deleteProductForAdmin);

export default router;

