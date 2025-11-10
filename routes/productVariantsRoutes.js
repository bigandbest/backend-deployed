import express from "express";
import {
  getProductVariants,
  addProductVariant,
  updateProductVariant,
  deleteProductVariant,
  getProductsWithVariants,
} from "../controller/productVariantsController.js";
import { authenticate } from "../middleware/authenticate.js";

const router = express.Router();

// Public routes - no authentication required
router.get("/products-with-variants", getProductsWithVariants);
router.get("/product/:productId/variants", getProductVariants);

// Protected routes - authentication required
router.post("/product/:productId/variants", authenticate, addProductVariant);
router.put("/variant/:variantId", authenticate, updateProductVariant);
router.delete("/variant/:variantId", authenticate, deleteProductVariant);

export default router;