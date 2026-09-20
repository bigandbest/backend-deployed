// routes/campaignRoutes.js
import express from "express";
import {
  listCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  toggleCampaign,
  deleteCampaign,
  searchProducts,
  listCategoriesForLookup,
} from "../controller/campaignAdminController.js";
import { authenticateToken } from "../middleware/authenticate.js";
import { requireAdmin } from "../middleware/authorize.js";

const router = express.Router();

router.use(authenticateToken, requireAdmin);

// Malformed ids would otherwise reach Prisma and surface as a 500.
router.param("id", (req, res, next, id) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? next() : res.status(400).json({ success: false, error: "Invalid id" }));

router.get("/lookup/products", searchProducts);
router.get("/lookup/categories", listCategoriesForLookup);

router.get("/", listCampaigns);
router.post("/", createCampaign);
router.get("/:id", getCampaign);
router.put("/:id", updateCampaign);
router.put("/:id/toggle", toggleCampaign);
router.delete("/:id", deleteCampaign);

export default router;
