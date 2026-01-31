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

const router = express.Router();
const upload = multer();

router.post("/add", upload.single("image_url"), addRecommendedStore);
router.put("/update/:id", upload.single("image"), editRecommendedStore);
router.delete("/delete/:id", deleteRecommendedStore);
router.get("/list", getAllRecommendedStores);
router.get("/active", getActiveRecommendedStores);

// --- Product Mapping Routes (Merged from productRecommendedStoreRoutes.js) ---
router.post('/map', mapProductToRecommendedStore);
router.post('/map-bulk', bulkMapByNames);
router.post('/remove', removeProductFromRecommendedStore);
router.get('/product/:product_id', getRecommendedStoresForProduct);
router.get('/products/:recommended_store_id', getProductsForRecommendedStore); // Changed from /:recommended_store_id to /products/:id to avoid clash with GET /:id

router.get("/:id", getSingleRecommendedStore);

export default router;
