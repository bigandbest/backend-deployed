import express from "express";
import multer from "multer";
import {
    getAllPartners,
    getActivePartners,
    addPartner,
    updatePartner,
    deletePartner
} from "../controller/partnerController.js";
import { cacheMiddleware } from "../utils/cache.js";
import { invalidateCacheMiddleware } from "../utils/cacheInvalidation.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Cache for 1 hour - partners rarely change
router.get("/", cacheMiddleware(3600), getAllPartners);
router.get("/active", cacheMiddleware(3600), getActivePartners);

// Add with image
router.post("/", invalidateCacheMiddleware('partners'), upload.single("image"), addPartner);

// Update with optional image
router.put("/:id", invalidateCacheMiddleware('partners'), upload.single("image"), updatePartner);

router.delete("/:id", invalidateCacheMiddleware('partners'), deletePartner);

export default router;
