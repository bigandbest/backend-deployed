import { Router } from "express";
import {
  addBanner,
  updateBanner,
  deleteBanner,
  getAllBanners,
  getBannerById,
  getBannersByType,
  getMobileBanners,
  getActiveMobileBanners,
} from "../controller/addBannerController.js";
import { cacheMiddleware } from "../utils/cache.js";
import { invalidateCacheMiddleware } from "../utils/cacheInvalidation.js";
import multer from "multer";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

// Add a Banner with image upload
router.post("/add", upload.single("image"), addBanner);

// Update a Banner with optional image upload
router.put("/update/:id", upload.single("image"), updateBanner);

// Delete a Banner
router.delete("/delete/:id", deleteBanner);

// Get all Banners (cache for 10 minutes - banners change occasionally)
router.get("/all", getAllBanners);

// ─── Mobile App Specific Routes ────────────────────────────────────────────
// GET /mobile - all mobile banners (admin view, includes inactive)
router.get("/mobile", getMobileBanners);

// GET /mobile/active - only active mobile banners (primary mobile app endpoint)
router.get("/mobile/active", getActiveMobileBanners);

// Get a single Banner by ID (cache for 15 minutes)
router.get("/:id", getBannerById);

// Get all Banners by a specific type (e.g., /api/banner/type/homepage)
router.get("/type/:bannerType", getBannersByType);

export default router;
