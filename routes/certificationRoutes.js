import express from "express";
import multer from "multer";
import {
    getAllCertifications,
    getActiveCertifications,
    addCertification,
    updateCertification,
    deleteCertification
} from "../controller/certificationController.js";
import { cacheMiddleware } from "../utils/cache.js";
import { invalidateCacheMiddleware } from "../utils/cacheInvalidation.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Cache for 1 hour - certifications rarely change
router.get("/", cacheMiddleware(3600), getAllCertifications);
router.get("/active", cacheMiddleware(3600), getActiveCertifications);

// Add with image
router.post("/", invalidateCacheMiddleware('certifications'), upload.single("image"), addCertification);

// Update with optional image
router.put("/:id", invalidateCacheMiddleware('certifications'), upload.single("image"), updateCertification);

router.delete("/:id", invalidateCacheMiddleware('certifications'), deleteCertification);

export default router;
