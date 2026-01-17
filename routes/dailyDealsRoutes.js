import express from "express";
import multer from "multer";
import {
  addDailyDeal,
  updateDailyDeal,
  deleteDailyDeal,
  getAllDailyDeals,
  getDailyDealById,
  getAllDailyDealsWithProducts,
  mapProductToDailyDeal,
  removeProductFromDailyDeal,
  getDailyDealsForProduct,
  getProductsForDailyDeal,
  bulkMapProductsToDailyDeal
} from "../controller/dailyDealsController.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// --- Daily Deal Routes ---
router.post("/add", upload.single("image_url"), addDailyDeal);
router.put("/update/:id", upload.single("image_url"), updateDailyDeal);
router.delete("/delete/:id", deleteDailyDeal);
router.get("/list", getAllDailyDeals);
router.get("/with-products", getAllDailyDealsWithProducts);
router.get("/:id", getDailyDealById);

// --- Daily Deal Product Mapping Routes ---
router.post("/product/map", mapProductToDailyDeal);
router.delete("/product/remove", removeProductFromDailyDeal);
router.get("/product/by-product/:product_id", getDailyDealsForProduct);
router.get("/product/by-deal/:daily_deal_id", getProductsForDailyDeal);
router.post("/product/bulk-map", bulkMapProductsToDailyDeal);

export default router;
