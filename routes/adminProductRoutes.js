import express from "express";
import {
  getAllProductsForAdmin,
  updateProductWarehouseMapping,
  getProductForAdmin,
  deleteProductForAdmin,
  updateProduct,
  createProduct,
} from "../controller/adminProductController.js";
import { cacheMiddleware } from "../utils/cache.js";
import { invalidateCacheMiddleware } from "../utils/cacheInvalidation.js";

const router = express.Router();

// POST /api/admin/products - Create new product
router.post("/products", invalidateCacheMiddleware('products'), createProduct);

// GET /api/admin/products - Get all products for admin with full details
// Cache for 2 minutes, vary by query params
router.get(
  "/products", 
  cacheMiddleware(120, (req) => {
    const page = req.query.page || '1';
    const limit = req.query.limit || '50';
    const category = req.query.category_id || 'all';
    const search = req.query.search || 'none';
    return `admin:products:${page}:${limit}:${category}:${search}`;
  }),
  getAllProductsForAdmin
);

// GET /api/admin/products/:productId - Get single product for admin
router.get("/products/:productId", getProductForAdmin);

// PUT /api/admin/products/:productId - Update product (general update)
router.put("/products/:productId", invalidateCacheMiddleware('products'), updateProduct);

// PUT /api/admin/products/:productId/warehouse-mapping - Update warehouse mapping
router.put(
  "/products/:productId/warehouse-mapping",
  invalidateCacheMiddleware('products'),
  updateProductWarehouseMapping
);

// DELETE /api/admin/products/:productId - Delete product for admin
router.delete("/products/:productId", invalidateCacheMiddleware('products'), deleteProductForAdmin);

export default router;

