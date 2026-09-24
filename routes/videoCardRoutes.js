import { Router } from "express";
import {
  addVideoCard,
  updateVideoCard,
  deleteVideoCard,
  getAllVideoCards,
  getActiveVideoCards,
  getVideoCardById,
} from "../controller/videoCardController.js";
import multer from "multer";
import { adminWritesOnly } from "../middleware/adminWrites.js";

const router = Router();

// Writes are admin-only; GETs stay public (storefront + mobile read them)
router.use(adminWritesOnly);
const upload = multer();

// Add a Video Card with optional thumbnail upload
router.post("/add", upload.any(), addVideoCard);

// Update a Video Card with optional thumbnail upload
router.put("/update/:id", updateVideoCard);

// Delete a Video Card
router.delete("/delete/:id", deleteVideoCard);

// Get all Video Cards
router.get("/all", getAllVideoCards);

// Get active Video Cards
router.get("/active", getActiveVideoCards);

// Get a single Video Card by ID
router.get("/:id", getVideoCardById);

export default router;
