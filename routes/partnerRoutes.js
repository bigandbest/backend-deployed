import express from "express";
import multer from "multer";
import {
    getAllPartners,
    getActivePartners,
    addPartner,
    updatePartner,
    deletePartner
} from "../controller/partnerController.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get("/", getAllPartners);
router.get("/active", getActivePartners);

// Add with image
router.post("/", upload.single("image"), addPartner);

// Update with optional image
router.put("/:id", upload.single("image"), updatePartner);

router.delete("/:id", deletePartner);

export default router;
