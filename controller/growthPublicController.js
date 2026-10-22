import prisma from "../config/prisma.js";
import { createGrowthPublicService } from "../services/growthPublicService.js";

const growth = createGrowthPublicService({ prisma });

export async function getGrowthConfig(req, res) {
  try {
    return res.json({ success: true, data: await growth.getConfig() });
  } catch (error) {
    console.error("getGrowthConfig error:", error.message);
    return res.status(500).json({ success: false, error: "Unable to load growth settings" });
  }
}

export async function getGrowthCampaigns(req, res) {
  try {
    return res.json({ success: true, data: await growth.getCampaigns(req.query.channel) });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ success: false, error: error.message });
    console.error("getGrowthCampaigns error:", error.message);
    return res.status(500).json({ success: false, error: "Unable to load promotions" });
  }
}
