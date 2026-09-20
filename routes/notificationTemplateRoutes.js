// routes/notificationTemplateRoutes.js
import express from "express";
import { listTemplates, upsertTemplate, deleteTemplate } from "../controller/notificationTemplateAdminController.js";
import { authenticateToken } from "../middleware/authenticate.js";
import { requireAdmin } from "../middleware/authorize.js";

const router = express.Router();
router.use(authenticateToken, requireAdmin);

router.get("/", listTemplates);
router.put("/:type", upsertTemplate);
router.delete("/:type", deleteTemplate);

export default router;
