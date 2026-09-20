import campaignDAO from "../dao/campaign.dao.js";
import { logAdminAction } from "../services/referralService.js";
import prisma from "../config/prisma.js";

const audit = (req, action, description, entityType, entityId, previousValue, newValue) =>
  logAdminAction(req.user.id, req.user.email, req.user.name, action, description, entityType, entityId, previousValue, newValue, req.ip);

const VALID_CHANNELS = ["REFERRAL", "AFFILIATE"];
const VALID_SCOPE_TYPES = ["PRODUCT", "CATEGORY", "STORE_WIDE"];
const VALID_REWARD_TYPES = ["PERCENTAGE", "FIXED"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const validateCampaignInput = (body) => {
  const { name, channel, starts_at, ends_at, scope_type, reward_type, reward_value } = body;
  if (!name || !String(name).trim()) return "Campaign name is required";
  if (!VALID_CHANNELS.includes(channel)) return "channel must be REFERRAL or AFFILIATE";
  if (!starts_at || !ends_at) return "starts_at and ends_at are required";
  if (Number.isNaN(new Date(starts_at).getTime()) || Number.isNaN(new Date(ends_at).getTime())) return "starts_at and ends_at must be valid dates";
  if (new Date(starts_at) >= new Date(ends_at)) return "ends_at must be after starts_at";
  if (!VALID_SCOPE_TYPES.includes(scope_type)) return "scope_type must be PRODUCT, CATEGORY or STORE_WIDE";
  if (scope_type !== "STORE_WIDE" && !body.scope_id) return "scope_id is required for PRODUCT/CATEGORY scope";
  if (scope_type !== "STORE_WIDE" && !UUID_RE.test(String(body.scope_id))) return "scope_id must be a valid UUID";
  if (!VALID_REWARD_TYPES.includes(reward_type)) return "reward_type must be PERCENTAGE or FIXED";
  // DB columns are Decimal(10,2): finite and < 1e8, otherwise the insert fails with a 500.
  const money = (v) => Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) < 1e8;
  if (reward_value == null || !money(reward_value) || Number(reward_value) <= 0) return "reward_value must be a positive number";
  if (reward_type === "PERCENTAGE" && Number(reward_value) > 100) return "reward_value cannot exceed 100 for PERCENTAGE";
  for (const f of ["max_reward_cap", "min_order_value"]) {
    if (body[f] != null && body[f] !== "" && !money(body[f])) return `${f} must be a non-negative number`;
  }
  if (body.usage_limit != null && body.usage_limit !== "" && !(Number.isInteger(Number(body.usage_limit)) && Number(body.usage_limit) > 0 && Number(body.usage_limit) <= 2147483647)) return "usage_limit must be a positive integer";
  return null;
};

const splitBody = (body) => ({
  campaign: {
    name: body.name,
    description: body.description || null,
    channel: body.channel,
    starts_at: new Date(body.starts_at),
    ends_at: new Date(body.ends_at),
    usage_limit: body.usage_limit != null && body.usage_limit !== "" ? parseInt(body.usage_limit) : null,
    is_active: body.is_active !== false,
  },
  rule: {
    scope_type: body.scope_type,
    scope_id: body.scope_type === "STORE_WIDE" ? null : body.scope_id,
    reward_type: body.reward_type,
    reward_value: Number(body.reward_value),
    max_reward_cap: body.max_reward_cap != null && body.max_reward_cap !== "" ? Number(body.max_reward_cap) : null,
    min_order_value: body.min_order_value != null && body.min_order_value !== "" ? Number(body.min_order_value) : null,
  },
});

// GET /api/admin/campaigns
export const listCampaigns = async (req, res) => {
  try {
    const { channel, status, page, limit } = req.query;
    const { campaigns, total } = await campaignDAO.list({ channel, status, page, limit });

    // Analytics v1: attributed amount per campaign, batched in two queries for the whole page
    // rather than one query per row.
    const referralIds = campaigns.filter((c) => c.channel === "REFERRAL").map((c) => c.id);
    const affiliateIds = campaigns.filter((c) => c.channel === "AFFILIATE").map((c) => c.id);
    const attributedMap = await campaignDAO.getAttributedAmounts(referralIds, affiliateIds);
    const withAttribution = campaigns.map((c) => ({ ...c, attributed_amount: attributedMap.get(c.id) || 0 }));

    return res.json({ success: true, data: withAttribution, total });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// GET /api/admin/campaigns/:id
export const getCampaign = async (req, res) => {
  try {
    const campaign = await campaignDAO.getById(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, error: "Not found" });
    return res.json({ success: true, data: campaign });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// POST /api/admin/campaigns
export const createCampaign = async (req, res) => {
  try {
    const validationError = validateCampaignInput(req.body);
    if (validationError) return res.status(400).json({ success: false, error: validationError });

    const { campaign, rule } = splitBody(req.body);
    const created = await campaignDAO.create({ campaign: { ...campaign, created_by: req.user.id }, rule });

    await audit(req, "CAMPAIGN_CREATED", `Created campaign "${created.name}"`, "campaigns", created.id, null, created);
    return res.status(201).json({ success: true, data: created });
  } catch (err) {
    console.error("createCampaign error:", err);
    return res.status(500).json({ success: false, error: "Failed to create campaign" });
  }
};

// PUT /api/admin/campaigns/:id
export const updateCampaign = async (req, res) => {
  try {
    const existing = await campaignDAO.getById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: "Not found" });

    const validationError = validateCampaignInput(req.body);
    if (validationError) return res.status(400).json({ success: false, error: validationError });

    const { campaign, rule } = splitBody(req.body);
    const updated = await campaignDAO.update(req.params.id, { campaign, rule });

    await audit(req, "CAMPAIGN_UPDATED", `Updated campaign "${updated.name}"`, "campaigns", updated.id, existing, updated);
    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error("updateCampaign error:", err);
    return res.status(500).json({ success: false, error: "Failed to update campaign" });
  }
};

// PUT /api/admin/campaigns/:id/toggle
export const toggleCampaign = async (req, res) => {
  try {
    const existing = await campaignDAO.getById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: "Not found" });

    const updated = await campaignDAO.setActive(req.params.id, !existing.is_active);
    await audit(req, "CAMPAIGN_TOGGLED", `${updated.is_active ? "Activated" : "Deactivated"} campaign "${updated.name}"`,
      "campaigns", updated.id, { is_active: existing.is_active }, { is_active: updated.is_active });
    return res.json({ success: true, data: updated });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// DELETE /api/admin/campaigns/:id
export const deleteCampaign = async (req, res) => {
  try {
    const existing = await campaignDAO.getById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: "Not found" });

    // Usage history references this campaign for audit — deactivate rather than hard-delete
    // once it's ever been used, so past referral/affiliate records keep a resolvable campaign_id.
    const usageCount = await prisma.campaign_usage.count({ where: { campaign_id: req.params.id } });
    if (usageCount > 0) {
      await campaignDAO.setActive(req.params.id, false);
      await audit(req, "CAMPAIGN_DEACTIVATED", `Deactivated campaign "${existing.name}" (has usage history, not deleted)`, "campaigns", req.params.id, existing, { is_active: false });
      return res.json({ success: true, message: "Campaign has usage history — deactivated instead of deleted" });
    }

    await campaignDAO.remove(req.params.id);
    await audit(req, "CAMPAIGN_DELETED", `Deleted campaign "${existing.name}"`, "campaigns", req.params.id, existing, null);
    return res.json({ success: true, message: "Campaign deleted" });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// GET /api/admin/campaigns/lookup/products?search=&category_id=
export const searchProducts = async (req, res) => {
  try {
    const { search, category_id, page = 1, limit = 20 } = req.query;
    const where = { active: true };
    if (category_id) where.category_id = category_id;
    if (search) where.name = { contains: search, mode: "insensitive" };

    const products = await prisma.products.findMany({
      where,
      select: { id: true, name: true, category_id: true, category: { select: { id: true, name: true } } },
      orderBy: { created_at: "desc" },
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit),
    });
    return res.json({ success: true, data: products });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// GET /api/admin/campaigns/lookup/categories
export const listCategoriesForLookup = async (req, res) => {
  try {
    const categories = await prisma.categories.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return res.json({ success: true, data: categories });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
};
