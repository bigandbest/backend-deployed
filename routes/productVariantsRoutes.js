import express from "express";
import {
  getProductVariants,
  addProductVariant,
  updateProductVariant,
  deleteProductVariant,
  getProductsWithVariants,
  updateVariantStock,
  getVariantWarehouseStock,
  updateVariantWarehouseStock,
  addProductVariantWithStock,
} from "../controller/productVariantsController.js";
import { authenticateToken } from "../middleware/authenticate.js";

const router = express.Router();

// Public routes - no authentication required
router.get("/products-with-variants", getProductsWithVariants);
router.get("/product/:productId/variants", getProductVariants);

// Protected routes - authentication required
router.post("/product/:productId/variants", authenticateToken, addProductVariant);
router.post("/product/:productId/variants-with-stock", authenticateToken, addProductVariantWithStock);
router.put("/variant/:variantId", authenticateToken, updateProductVariant);
router.put("/variant/:variantId/stock", authenticateToken, updateVariantStock);
router.delete("/variant/:variantId", authenticateToken, deleteProductVariant);

// Warehouse stock routes
router.get("/variant/:variantId/warehouse-stock", getVariantWarehouseStock);
router.put("/variant/:variantId/warehouse-stock/:warehouseId", authenticateToken, updateVariantWarehouseStock);

export default router;
