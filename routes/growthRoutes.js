import express from "express";
import { getGrowthConfig, getGrowthCampaigns } from "../controller/growthPublicController.js";

const router = express.Router();
// Public customer-safe projections. Admin writes remain on /api/admin/*.
router.get("/config", getGrowthConfig);
router.get("/campaigns", getGrowthCampaigns);

export default router;
