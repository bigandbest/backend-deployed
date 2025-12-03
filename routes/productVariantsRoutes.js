import express from "express";
import {
  getProductVariants,
  addProductVariant,
  updateProductVariant,
  deleteProductVariant,
  getProductsWithVariants,
  updateVariantStock,
} from "../controller/productVariantsController.js";
import { authenticateToken } from "../middleware/authenticate.js";

const router = express.Router();

// Public routes - no authentication required
router.get("/products-with-variants", getProductsWithVariants);
router.get("/product/:productId/variants", getProductVariants);

// Protected routes - authentication required
router.post("/product/:productId/variants", authenticateToken, addProductVariant);
router.put("/variant/:variantId", authenticateToken, updateProductVariant);
router.put("/variant/:variantId/stock", authenticateToken, updateVariantStock);
router.delete("/variant/:variantId", authenticateToken, deleteProductVariant);

export default router;