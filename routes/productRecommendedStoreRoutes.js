import express from "express";
import { getProductsForRecommendedStore } from "../controller/recommendedStoreController.js";

const router = express.Router();

// Frontend calls GET /api/product-recommended-stores/:storeId to fetch products for a store
router.get("/:recommended_store_id", getProductsForRecommendedStore);

export default router;
