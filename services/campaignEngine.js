// services/campaignEngine.js
// Shared Campaign + Reward Rules engine (rules.md 19.13 — centralized, not duplicated per module).
// Consumed by referralService (order-level matching) and affiliateService (per-item matching).
import prisma from "../config/prisma.js";

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const SPECIFICITY = { PRODUCT: 0, CATEGORY: 1, STORE_WIDE: 2 };

// Computes the reward/commission amount a rule produces for a base value, applying the cap (Q2).
export const computeRuleAmount = (rule, baseValue) => {
  const base = Number(baseValue) || 0;
  let amount = rule.reward_type === "PERCENTAGE"
    ? (base * Number(rule.reward_value)) / 100
    : Number(rule.reward_value);
  if (rule.max_reward_cap != null) amount = Math.min(amount, Number(rule.max_reward_cap));
  return round2(Math.max(0, amount));
};

// Loads every currently-active, in-window campaign rule for a channel in one query — matched
// in memory per item/order rather than queried per item (rules.md 19.3 — avoid N+1).
// Boundary is starts_at <= now < ends_at, per Q2's clarification.
export const getActiveCampaignRules = async (channel) => {
  const now = new Date();
  return prisma.campaign_rules.findMany({
    where: {
      campaigns: { channel, is_active: true, starts_at: { lte: now }, ends_at: { gt: now } },
    },
    include: { campaigns: true },
  });
};

// Q4: PRODUCT > CATEGORY > STORE_WIDE. Returns the single best-specificity match, or null.
// usage_limit is intentionally NOT checked here — that's enforced atomically at reservation time.
export const matchRuleForItem = (rules, { productId, categoryId }) => {
  const candidates = rules.filter((r) => {
    if (r.scope_type === "PRODUCT") return productId && r.scope_id === productId;
    if (r.scope_type === "CATEGORY") return categoryId && r.scope_id === categoryId;
    return true; // STORE_WIDE
  });
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => SPECIFICITY[a.scope_type] - SPECIFICITY[b.scope_type]);
  return candidates[0];
};

// Q12/Q13: atomic compare-and-swap on used_count + idempotency-guarded usage row.
// Returns true if this order holds a reserved slot (freshly reserved, or already had one on a
// retried call), false if the campaign has no usage left (caller falls back to the default).
export const reserveCampaignUsage = async (campaignId, orderId, channel) => {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.campaign_usage.findUnique({
        where: { campaign_id_order_id: { campaign_id: campaignId, order_id: orderId } },
      });
      if (existing) return true; // idempotent retry — already consumed this order's slot

      const campaign = await tx.campaigns.findUnique({
        where: { id: campaignId },
        select: { is_active: true, usage_limit: true },
      });
      if (!campaign || !campaign.is_active) return false;

      const where = { id: campaignId, is_active: true };
      if (campaign.usage_limit != null) where.used_count = { lt: campaign.usage_limit };

      const guard = await tx.campaigns.updateMany({ where, data: { used_count: { increment: 1 } } });
      if (guard.count === 0) return false; // limit reached (concurrently or otherwise)

      await tx.campaign_usage.create({ data: { campaign_id: campaignId, order_id: orderId, channel } });
      return true;
    });
  } catch (err) {
    if (err.code === "P2002") return true; // concurrent call already inserted the usage row
    console.error(`[campaignEngine] reserveCampaignUsage failed for campaign ${campaignId}, order ${orderId}:`, err.message);
    return false;
  }
};

// REFERRAL (Q9 — order-level): one campaign decision for the whole order. Eligible if any item
// falls in the campaign's scope; most-specific match wins across items. min_order_value (Q14) is
// checked against the whole order's eligible base. Returns the final, already-capped rupee amount
// as applied_reward_value — the snapshot is the authoritative money going forward (Q10), no need
// to re-derive it from the rule later. Returns null if no campaign applies or usage is exhausted.
export const matchReferralCampaign = async ({ orderId, items, eligibleBase }) => {
  const rules = await getActiveCampaignRules("REFERRAL");
  if (rules.length === 0) return null;

  let best = null;
  for (const item of items) {
    const match = matchRuleForItem(rules, item);
    if (!match) continue;
    if (!best || SPECIFICITY[match.scope_type] < SPECIFICITY[best.scope_type]) best = match;
  }
  if (!best) return null;
  if (best.min_order_value != null && Number(eligibleBase) < Number(best.min_order_value)) return null;

  const reserved = await reserveCampaignUsage(best.campaign_id, orderId, "REFERRAL");
  if (!reserved) return null; // exhausted — caller falls back to the flat config default

  return {
    campaign_id: best.campaign_id,
    campaign_name: best.campaigns.name,
    applied_reward_type: best.reward_type,
    applied_reward_value: computeRuleAmount(best, eligibleBase),
  };
};
