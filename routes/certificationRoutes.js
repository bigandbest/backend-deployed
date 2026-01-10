import express from "express";
import multer from "multer";
import {
    getAllCertifications,
    getActiveCertifications,
    addCertification,
    updateCertification,
    deleteCertification
} from "../controller/certificationController.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get("/", getAllCertifications);
router.get("/active", getActiveCertifications);

// Add with image
router.post("/", upload.single("image"), addCertification);

// Update with optional image
router.put("/:id", upload.single("image"), updateCertification);

router.delete("/:id", deleteCertification);

export default router;
