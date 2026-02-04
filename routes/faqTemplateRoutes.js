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

router.post("/", authenticateToken, createFaqTemplate);
router.get("/", authenticateToken, getAllFaqTemplates);
router.get("/:id", authenticateToken, getFaqTemplateById);
router.put("/:id", authenticateToken, updateFaqTemplate);
router.delete("/:id", authenticateToken, deleteFaqTemplate);

export default router;
