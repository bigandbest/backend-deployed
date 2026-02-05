import express from "express";
import {
  createFaqTemplate,
  getAllFaqTemplates,
  getFaqTemplateById,
  updateFaqTemplate,
  deleteFaqTemplate,
} from "../controller/faqTemplateController.js";
import { authenticateToken } from "../middleware/authenticate.js";

const router = express.Router();

// Public routes (no authentication required)
router.get("/", getAllFaqTemplates);
router.get("/:id", getFaqTemplateById);

// Protected routes (admin only)
router.post("/", authenticateToken, createFaqTemplate);
router.put("/:id", authenticateToken, updateFaqTemplate);
router.delete("/:id", authenticateToken, deleteFaqTemplate);

export default router;
