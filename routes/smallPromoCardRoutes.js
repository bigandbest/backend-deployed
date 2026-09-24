import { Router } from "express";
import {
    addCard,
    updateCard,
    deleteCard,
    getAllCards,
} from "../controller/smallPromoCardController.js";
import multer from "multer";
import { adminWritesOnly } from "../middleware/adminWrites.js";

const router = Router();

// Writes are admin-only; GETs stay public (storefront + mobile read them)
router.use(adminWritesOnly);
const upload = multer({ storage: multer.memoryStorage() });

// Add a Card with image upload
router.post("/", upload.single("image"), addCard);

// Update a Card with optional image upload
router.put("/:id", upload.single("image"), updateCard);

// Delete a Card
router.delete("/:id", deleteCard);

// Get all Cards
router.get("/", getAllCards);

export default router;
