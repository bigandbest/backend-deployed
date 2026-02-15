import express from "express";
import {
  createInquiry,
  getAllInquiries,
  getInquiryById,
  updateInquiryStatus,
  deleteInquiry,
  getInquiryStats,
} from "../controller/businessPartnerInquiryController.js";
import { cacheMiddleware } from "../utils/cache.js";
import { invalidateCacheMiddleware } from "../utils/cacheInvalidation.js";

const router = express.Router();

// Public route - submit business partner inquiry
router.post(
  "/",
  invalidateCacheMiddleware("business-partner-inquiries"),
  createInquiry,
);

// Admin routes - manage inquiries
router.get("/", cacheMiddleware(300), getAllInquiries);
router.get("/stats", cacheMiddleware(300), getInquiryStats);
router.get("/:id", getInquiryById);
router.patch(
  "/:id/status",
  invalidateCacheMiddleware("business-partner-inquiries"),
  updateInquiryStatus,
);
router.delete(
  "/:id",
  invalidateCacheMiddleware("business-partner-inquiries"),
  deleteInquiry,
);

export default router;
