import prisma from "../config/prisma.js";

class CampaignDAO {
  async list({ channel, status, page = 1, limit = 20 } = {}) {
    const where = {};
    if (channel) where.channel = channel;
    if (status === "ACTIVE") where.is_active = true;
    if (status === "INACTIVE") where.is_active = false;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [campaigns, total] = await Promise.all([
      prisma.campaigns.findMany({
        where,
        include: { campaign_rule: true },
        orderBy: { created_at: "desc" },
        skip,
        take: parseInt(limit),
      }),
      prisma.campaigns.count({ where }),
    ]);
    return { campaigns, total };
  }

  async getById(id) {
    return prisma.campaigns.findUnique({ where: { id }, include: { campaign_rule: true } });
  }

  // Rejects overlapping active scope for the same channel isn't enforced (Q4 resolves overlap
  // by specificity at match time, not by blocking creation) — admins may intentionally stack a
  // product-level campaign inside a wider category campaign.
  async create({ campaign, rule }) {
    return prisma.campaigns.create({
      data: { ...campaign, campaign_rule: { create: rule } },
      include: { campaign_rule: true },
    });
  }

  async update(id, { campaign, rule }) {
    return prisma.campaigns.update({
      where: { id },
      data: {
        ...campaign,
        ...(rule ? { campaign_rule: { update: rule } } : {}),
      },
      include: { campaign_rule: true },
    });
  }

  async setActive(id, isActive) {
    return prisma.campaigns.update({ where: { id }, data: { is_active: isActive } });
  }

  async remove(id) {
    return prisma.campaigns.delete({ where: { id } });
  }

  // Analytics v1 — batched, not per-row (rules.md 19.3). Uses the persisted snapshot/association
  // (referral_transactions.campaign_id, affiliate_commissions.campaign_breakdown) rather than
  // reconstructing historical matches, per the locked instruction. Referral matches per order
  // (Q9) so the scalar campaign_id is always complete; affiliate matches per item and a single
  // order can touch several campaigns (Q16), so campaign_breakdown — not the scalar campaign_id
  // convenience field — is the only complete source there. Only COMPLETED/approved money counts,
  // matching how each program already reports "credited" amounts elsewhere.
  async getAttributedAmounts(referralIds, affiliateIds) {
    const [referralRows, affiliateRows] = await Promise.all([
      referralIds.length
        ? prisma.$queryRaw`
            SELECT campaign_id, SUM(referrer_reward_amount) AS attributed
            FROM referral_transactions
            WHERE campaign_id = ANY(${referralIds}::uuid[]) AND status = 'COMPLETED'
            GROUP BY campaign_id
          `
        : [],
      affiliateIds.length
        ? prisma.$queryRaw`
            SELECT elem->>'campaign_id' AS campaign_id, SUM((elem->>'commission')::numeric) AS attributed
            FROM affiliate_commissions, jsonb_array_elements(campaign_breakdown) elem
            WHERE campaign_breakdown IS NOT NULL
              AND elem->>'campaign_id' = ANY(${affiliateIds}::text[])
              AND status IN ('APPROVED', 'IN_PAYOUT', 'PAID')
            GROUP BY elem->>'campaign_id'
          `
        : [],
    ]);
    const map = new Map();
    for (const r of [...referralRows, ...affiliateRows]) map.set(r.campaign_id, Number(r.attributed || 0));
    return map;
  }
}

export default new CampaignDAO();
