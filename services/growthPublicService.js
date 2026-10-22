// Customer-facing projections of admin Growth settings. These reads never create
// configuration rows and never expose fraud controls, audit data or account data.
const numeric = (value, fallback = 0) => Number(value ?? fallback);
const optionalNumber = (value) => value == null ? null : Number(value);

export function createGrowthPublicService({ prisma, now = () => new Date() }) {
  async function getConfig() {
    const [referral, affiliate, rates] = await Promise.all([
      prisma.referral_configs.findFirst({ select: {
        is_enabled: true, program_name: true, new_referral_signups_enabled: true,
        referrer_reward_amount: true, referee_reward_amount: true, min_order_value: true,
        reward_validity_days: true, min_withdrawal_amount: true, max_withdrawals_per_month: true,
        withdrawal_enabled: true, return_window_days: true, max_earning_per_user: true,
        applicable_first_order: true, tiered_rewards_enabled: true, tiered_rewards_config: true,
      } }),
      prisma.affiliate_configs.findFirst({ select: {
        is_enabled: true, program_name: true, program_description: true,
        new_applications_enabled: true, new_links_enabled: true, withdrawal_enabled: true,
        cookie_duration_hours: true, default_commission_rate: true, enable_tier_bonuses: true,
        minimum_payout_amount: true, payout_day_of_month: true, commission_hold_days: true,
        enable_tds: true, tds_threshold: true, tds_rate_with_pan: true, tds_rate_without_pan: true,
        terms_and_conditions: true,
      } }),
      prisma.affiliate_category_commissions.findMany({
        where: { is_active: true }, orderBy: { category_name: "asc" },
        select: { category_id: true, category_name: true, base_commission_rate: true },
      }),
    ]);
    const referralEnabled = referral?.is_enabled !== false;
    const affiliateEnabled = affiliate?.is_enabled !== false;
    // Defaults match the Prisma schema and existing program config endpoints.
    return {
      referral: {
        is_enabled: referralEnabled,
        program_name: referral?.program_name || "Refer & Earn",
        new_signups_enabled: referralEnabled && referral?.new_referral_signups_enabled !== false,
        referrer_reward_amount: numeric(referral?.referrer_reward_amount, 75),
        referee_reward_amount: numeric(referral?.referee_reward_amount, 75),
        min_order_value: numeric(referral?.min_order_value, 200),
        reward_validity_days: numeric(referral?.reward_validity_days, 7),
        min_withdrawal_amount: numeric(referral?.min_withdrawal_amount, 100),
        max_withdrawals_per_month: numeric(referral?.max_withdrawals_per_month, 10),
        withdrawal_enabled: referral?.withdrawal_enabled !== false,
        return_window_days: numeric(referral?.return_window_days, 7),
        max_earning_per_user: numeric(referral?.max_earning_per_user, 1000),
        applicable_first_order: referral?.applicable_first_order !== false,
        tiered_rewards_enabled: referral?.tiered_rewards_enabled === true,
        tiers: (Array.isArray(referral?.tiered_rewards_config) ? referral.tiered_rewards_config : []).map(tier => ({
          name: String(tier.name || ""), minReferrals: numeric(tier.minReferrals), reward: numeric(tier.reward),
        })),
      },
      affiliate: {
        is_enabled: affiliateEnabled,
        program_name: affiliate?.program_name || "Affiliate Program",
        program_description: affiliate?.program_description || null,
        new_applications_enabled: affiliateEnabled && affiliate?.new_applications_enabled !== false,
        new_links_enabled: affiliateEnabled && affiliate?.new_links_enabled !== false,
        withdrawal_enabled: affiliate?.withdrawal_enabled !== false,
        cookie_duration_hours: numeric(affiliate?.cookie_duration_hours, 24),
        default_commission_rate: numeric(affiliate?.default_commission_rate, 5),
        enable_tier_bonuses: affiliate?.enable_tier_bonuses !== false,
        minimum_payout_amount: numeric(affiliate?.minimum_payout_amount, 500),
        payout_day_of_month: numeric(affiliate?.payout_day_of_month, 7),
        commission_hold_days: numeric(affiliate?.commission_hold_days, 7),
        enable_tds: affiliate?.enable_tds !== false,
        tds_threshold: numeric(affiliate?.tds_threshold, 15000),
        tds_rate_with_pan: numeric(affiliate?.tds_rate_with_pan, 5),
        tds_rate_without_pan: numeric(affiliate?.tds_rate_without_pan, 20),
        terms_and_conditions: affiliate?.terms_and_conditions || null,
        rates: rates.map(rate => ({
          category_id: rate.category_id, category_name: rate.category_name,
          base_commission_rate: numeric(rate.base_commission_rate),
        })),
      },
    };
  }

  async function getCampaigns(channel) {
    if (channel !== undefined && channel !== "AFFILIATE" && channel !== "REFERRAL") {
      const error = new Error("channel must be AFFILIATE or REFERRAL");
      error.status = 400;
      throw error;
    }
    const timestamp = now();
    const rows = await prisma.campaigns.findMany({
      where: { is_active: true, starts_at: { lte: timestamp }, ends_at: { gt: timestamp }, ...(channel ? { channel } : {}) },
      select: {
        id: true, name: true, description: true, channel: true, starts_at: true, ends_at: true,
        is_active: true, usage_limit: true, used_count: true,
        campaign_rule: { select: { scope_type: true, scope_id: true, reward_type: true,
          reward_value: true, max_reward_cap: true, min_order_value: true } },
      },
      orderBy: [{ ends_at: "asc" }, { id: "asc" }],
    });
    // Column-to-column usage limits are checked here; money is still reserved
    // atomically by campaignEngine when an order converts, never by this feed.
    const active = rows.filter(campaign => campaign.campaign_rule
      && campaign.is_active && new Date(campaign.starts_at) <= timestamp && new Date(campaign.ends_at) > timestamp
      && (!channel || campaign.channel === channel)
      && (campaign.usage_limit == null || campaign.used_count < campaign.usage_limit));
    const productIds = [...new Set(active.filter(c => c.campaign_rule.scope_type === "PRODUCT").map(c => c.campaign_rule.scope_id))];
    const categoryIds = [...new Set(active.filter(c => c.campaign_rule.scope_type === "CATEGORY").map(c => c.campaign_rule.scope_id))];
    const [products, categories] = await Promise.all([
      productIds.length ? prisma.products.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } }) : [],
      categoryIds.length ? prisma.categories.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true } }) : [],
    ]);
    const productNames = new Map(products.map(product => [product.id, product.name]));
    const categoryNames = new Map(categories.map(category => [category.id, category.name]));
    return active.map(campaign => {
      const rule = campaign.campaign_rule;
      return {
        id: campaign.id, name: campaign.name,
        channel: campaign.channel, starts_at: campaign.starts_at, ends_at: campaign.ends_at,
        scope_type: rule.scope_type, scope_id: rule.scope_id,
        scope_name: rule.scope_type === "STORE_WIDE" ? "Entire store"
          : (rule.scope_type === "PRODUCT" ? productNames : categoryNames).get(rule.scope_id) || null,
        reward_type: rule.reward_type, reward_value: numeric(rule.reward_value),
        max_reward_cap: optionalNumber(rule.max_reward_cap), min_order_value: optionalNumber(rule.min_order_value),
      };
    });
  }

  return { getConfig, getCampaigns };
}
