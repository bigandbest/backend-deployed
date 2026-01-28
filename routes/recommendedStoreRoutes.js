import express from "express";
import multer from "multer";
import {
  addRecommendedStore,
  editRecommendedStore,
  deleteRecommendedStore,
  getAllRecommendedStores,
  getActiveRecommendedStores,
  getSingleRecommendedStore,
  mapProductToRecommendedStore,
  removeProductFromRecommendedStore,
  getRecommendedStoresForProduct,
  getProductsForRecommendedStore,
  bulkMapByNames
} from "../controller/recommendedStoreController.js";
import { cacheMiddleware } from "../utils/cache.js";
import { invalidateCacheMiddleware } from "../utils/cacheInvalidation.js";

const router = express.Router();
const upload = multer();

router.post("/add", invalidateCacheMiddleware('stores'), upload.single("image_url"), addRecommendedStore);
router.put("/update/:id", invalidateCacheMiddleware('stores'), upload.single("image"), editRecommendedStore);
router.delete("/delete/:id", invalidateCacheMiddleware('stores'), deleteRecommendedStore);
router.get("/list", cacheMiddleware(3600), getAllRecommendedStores);
router.get("/active", cacheMiddleware(3600), getActiveRecommendedStores);

// --- Product Mapping Routes (Merged from productRecommendedStoreRoutes.js) ---
router.post('/map', invalidateCacheMiddleware('stores'), mapProductToRecommendedStore);
router.post('/map-bulk', invalidateCacheMiddleware('stores'), bulkMapByNames);
router.post('/remove', invalidateCacheMiddleware('stores'), removeProductFromRecommendedStore);
router.get('/product/:product_id', cacheMiddleware(1800), getRecommendedStoresForProduct);
router.get('/products/:recommended_store_id', cacheMiddleware(1800), getProductsForRecommendedStore); // Changed from /:recommended_store_id to /products/:id to avoid clash with GET /:id

router.get("/:id", getSingleRecommendedStore);

export default router;
