import { reconcileAffiliateReturns } from "./affiliateReturnService.js";
import prisma from "../config/prisma.js";
import affiliateDAO from "../dao/affiliate.dao.js";
import { calculateEligibleOrderBase } from "./rewardCalculation.js";
import { supersedeByAffiliateAttribution, logAdminAction, logFraud } from "./referralService.js";
import { getActiveCampaignRules, matchingRulesForItem, computeRuleAmount, reserveCampaignUsage } from "./campaignEngine.js";

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// ─── AFFILIATE CODE GENERATION ──────────────────────────────────────────────
export const generateAffiliateCode = async (phoneOrName) => {
  const normalizedPhone = String(phoneOrName || "").replace(/\D/g, "");
  const prefix = normalizedPhone
    ? normalizedPhone.slice(-4).padStart(4, "0")
    : String(phoneOrName || "AFF")
        .replace(/[^a-zA-Z]/g, "")
        .toUpperCase()
        .substring(0, 4)
        .padEnd(4, "X");

  for (let i = 0; i < 10; i++) {
    const digits = String(Math.floor(10000 + Math.random() * 90000));
    const code = `${prefix}${digits}`;
    const existing = await prisma.affiliate_profiles.findUnique({
      where: { affiliate_code: code },
    });
    if (!existing) return code;
  }
  return `${prefix}${Date.now().toString().slice(-5)}`;
};

// ─── LINK CODE GENERATION ────────────────────────────────────────────────────
export const generateLinkCode = async () => {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 10; i++) {
    let code = "";
    for (let j = 0; j < 8; j++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    const existing = await prisma.affiliate_links.findUnique({
      where: { link_code: code },
    });
    if (!existing) return code;
  }
  return `lnk${Date.now().toString(36)}`;
};

// ─── PAYOUT NUMBER GENERATION ─────────────────────────────────────────────────
export const generatePayoutNumber = async () => {
  const date = new Date();
  const prefix = `PAY-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
  const last = await prisma.affiliate_payouts.findFirst({
    where: { payout_number: { startsWith: prefix } },
    orderBy: { created_at: "desc" },
  });
  const seq = last
    ? parseInt(last.payout_number.split("-").pop(), 10) + 1
    : 1;
  return `${prefix}-${String(seq).padStart(4, "0")}`;
};

// ─── COMMISSION CALCULATION ──────────────────────────────────────────────────
// Q9 (per-item), Q3 (campaign replaces default/category rate, no stacking with tier bonus),
// Q14 (min_order_value checked against the whole order's eligible base, not the item's own value).
// eligibleBase/orderId are optional so existing unit-level callers (if any) keep working without
// campaign evaluation; processAffiliateOrder always passes both.
// Confirmed rule: commission = DISCOUNTED item price x rate. order_items.price is already the item's selling
// price (variant/bulk discounts resolved at order creation). Order-level discounts (coupon + discount_charge)
// are not allocated to items anywhere else, so they are spread pro-rata over item value: eligibleBase is
// subtotal - coupon - discount_charge (rewardCalculation), and each item's commissionable value is
// itemValue * (eligibleBase / sum(itemValue)), capped at 1 (never above the item's own price).
// eligibleBase = null means "unknown" (no order-level discount information) => items used as-is.
export const calculateCommission = async (orderItems, tierBonus = 0, eligibleBase = null, orderId = null, orderDate = new Date()) => {
  const config = await affiliateDAO.getConfig();
  const defaultRate = Number(config.default_commission_rate);
  const campaignRules = orderId ? await getActiveCampaignRules("AFFILIATE", orderDate) : [];

  let totalCommission = 0;
  const breakdown = [];
  const campaignContribution = new Map(); // campaign_id -> { name, amount }
  const categoryCommissions = new Map(); // category_id -> category commission row (memo)

  const itemsTotal = orderItems.reduce((sum, i) => sum + Number(i.price) * Number(i.quantity), 0);
  const discountRatio = eligibleBase == null || itemsTotal <= 0 ? 1 : Math.min(1, Math.max(0, Number(eligibleBase) / itemsTotal));

  // Try eligible campaigns in deterministic priority order, including quota fallback.
  const candidates = [];
  const slotGranted = new Map();
  for (const item of orderItems) {
    let selected = null;
    for (const rule of matchingRulesForItem(campaignRules, { productId: item.product_id, categoryId: item.category_id })) {
      if (rule.min_order_value != null && Number(eligibleBase ?? itemsTotal) < Number(rule.min_order_value)) continue;
      if (!slotGranted.has(rule.campaign_id)) slotGranted.set(rule.campaign_id, await reserveCampaignUsage(rule.campaign_id, orderId, "AFFILIATE", orderDate));
      if (slotGranted.get(rule.campaign_id)) { selected = rule; break; }
    }
    candidates.push(selected);
  }

  for (const [idx, item] of orderItems.entries()) {
    const itemValue = round2(Number(item.price) * Number(item.quantity) * discountRatio);
    const matchedRule = candidates[idx] && slotGranted.get(candidates[idx].campaign_id) ? candidates[idx] : null;

    let rate, effectiveRate, commission, source;
    if (matchedRule) {
      // Campaign fully replaces the default/category rate — no tier-bonus stacking on top (Q3).
      rate = Number(matchedRule.reward_value);
      effectiveRate = rate;
      const paid = campaignContribution.get(matchedRule.campaign_id)?.amount || 0;
      commission = computeRuleAmount(matchedRule, itemValue);
      // The admin cap is per campaign per order, shared by every matching line.
      if (matchedRule.max_reward_cap != null) commission = round2(Math.min(commission, Math.max(0, Number(matchedRule.max_reward_cap) - paid)));
      source = "CAMPAIGN";
    } else {
      rate = defaultRate;
      source = "DEFAULT";
      if (item.category_id) {
        // One lookup per distinct category per order, not per line item.
        if (!categoryCommissions.has(item.category_id)) {
          categoryCommissions.set(item.category_id, await affiliateDAO.getCategoryCommissionByCategory(item.category_id));
        }
        const catComm = categoryCommissions.get(item.category_id);
        if (catComm && catComm.is_active) {
          rate = Number(catComm.base_commission_rate);
          source = "CATEGORY";
        }
      }
      effectiveRate = rate + Number(tierBonus);
      commission = round2((itemValue * effectiveRate) / 100);
    }

    totalCommission += commission;
    breakdown.push({
      order_item_id: item.order_item_id || null,
      quantity: Number(item.quantity),
      product_id: item.product_id,
      item_value: itemValue,
      source,
      rate: effectiveRate,
      commission,
      campaign_id: matchedRule?.campaign_id || null,
      campaign_name: matchedRule?.campaigns?.name || null,
    });

    if (matchedRule) {
      const prev = campaignContribution.get(matchedRule.campaign_id) || { name: matchedRule.campaigns.name, amount: 0 };
      prev.amount += commission;
      campaignContribution.set(matchedRule.campaign_id, prev);
    }
  }

  const campaignsUsed = [...campaignContribution].map(([campaign_id, info]) => ({ campaign_id, campaign_name: info.name, amount: round2(info.amount) }));

  return {
    grossCommission: round2(totalCommission),
    netCommission: round2(totalCommission),
    breakdown,
    campaignsUsed,
  };
};

// ─── PROCESS AFFILIATE ORDER ─────────────────────────────────────────────────
export const processAffiliateOrder = async (orderId, affiliateCode, cookieData = {}) => {
  try {
    // Check if already processed
    const existing = await affiliateDAO.getAffiliateOrderByOrderId(orderId);
    if (existing) {
      await supersedeByAffiliateAttribution(orderId);
      await affiliateDAO.finalizeClickAttribution(existing);
      return existing;
    }

    const profile = await affiliateDAO.getProfileByCode(affiliateCode);
    if (!profile || profile.status !== "ACTIVE" || profile.is_blocked) return null;

    // Fetch the order from our orders table
    const order = await prisma.orders.findUnique({
      where: { id: orderId },
      include: { order_items: { include: { product_variants: { include: { products: true } } } } },
    });
    if (!order) return null;

    // Bind a provided click to its affiliate and customer before using it for link statistics.
    // Ref-only legacy attribution remains supported when the client has no click ID.
    if (cookieData.clickId) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(cookieData.clickId))) return null;
      const click = await affiliateDAO.getClickById(cookieData.clickId);
      if (!click || click.affiliate_id !== profile.id
        || (click.user_id && click.user_id !== order.user_id)
        || click.is_converted
        || (click.created_at && order.created_at && new Date(click.created_at) > new Date(order.created_at))
        || (click.cookie_expires_at && new Date(click.cookie_expires_at) <= new Date(order.created_at))) return null;
    }

    const config = await affiliateDAO.getConfig();

    // Self-referral check. Q2 (Marketing Control Center): this block already existed but was
    // silent — the attempt is now also logged for admin review, using the same fraud-log
    // infrastructure referral already had, just tagged AFFILIATE. Existing blocking behavior is
    // unchanged either way; logFraud swallows its own errors, so a logging failure can't turn
    // this block into something else.
    if (config.block_self_referral && order.user_id === profile.user_id) {
      await logFraud(order.user_id, affiliateCode, null, "SELF_REFERRAL", "MEDIUM",
        "Affiliate attempted to earn commission on their own order", null, null, "AFFILIATE");
      return null;
    }

    // Eligible base: product value after discounts, excluding shipping/tax — shared with referral.
    const eligibleBase = calculateEligibleOrderBase(order);
    const tierBonus = Number(profile.tier_bonus);

    // Build items for commission calculation
    const items = order.order_items.map((oi) => ({
      order_item_id: oi.id,
      product_id: oi.product_variants?.product_id,
      category_id: oi.product_variants?.products?.category_id,
      price: Number(oi.price),
      quantity: oi.quantity,
    }));

    const { grossCommission, netCommission, breakdown, campaignsUsed } = await calculateCommission(items, tierBonus, eligibleBase, orderId, order.created_at || new Date());

    // Q16: campaign_id is only set when exactly one distinct campaign contributed — the
    // convenience field for the common case. campaign_breakdown is always the authoritative,
    // per-item snapshot (Q10), whether zero, one, or several campaigns touched this order.
    const singleCampaign = campaignsUsed.length === 1 ? campaignsUsed[0] : null;

    // Return window starts at actual delivery (see onOrderDelivered), not order creation —
    // left unset here so the auto-approval cron never picks this up prematurely.
    const affiliateOrder = await prisma.$transaction(async (tx) => {
      const created = await tx.affiliate_orders.create({ data: {
        affiliate_id: profile.id,
        affiliate_code: affiliateCode,
        click_id: cookieData.clickId || null,
        order_id: orderId,
        order_number: order.id.slice(0, 8).toUpperCase(),
        customer_id: order.user_id,
        customer_email: null,
        order_date: order.created_at || new Date(),
        order_status: order.status || "Pending",
        gross_order_value: Number(order.subtotal || 0),
        discount_amount: Number(order.coupon_discount || 0) + Number(order.discount_charge || 0),
        net_order_value: eligibleBase,
        final_order_value: eligibleBase,
        commission_rate: grossCommission > 0 && eligibleBase > 0 ? (grossCommission / eligibleBase) * 100 : 0,
        commission_amount: grossCommission,
        tier_bonus: tierBonus,
        final_commission: netCommission,
        campaign_id: singleCampaign?.campaign_id || null,
        campaign_name: singleCampaign?.campaign_name || null,
        campaign_breakdown: breakdown,
      } });

      await tx.affiliate_profiles.update({ where: { id: profile.id }, data: {
        total_orders: { increment: 1 },
        total_sales: { increment: eligibleBase },
        pending_balance: { increment: netCommission },
        total_commission_earned: { increment: netCommission },
      } });
      return created;
    });

    // Q1: this valid affiliate attribution takes precedence over any pending referral on this order.
    await supersedeByAffiliateAttribution(orderId);

    await affiliateDAO.finalizeClickAttribution(affiliateOrder);

    return affiliateOrder;
  } catch (err) {
    // Unique violation on order_id means a concurrent call already created this row — fetch and return it.
    if (err.code === "P2002") {
      const existing = await affiliateDAO.getAffiliateOrderByOrderId(orderId);
      if (existing) {
        await supersedeByAffiliateAttribution(orderId);
        await affiliateDAO.finalizeClickAttribution(existing);
        return existing;
      }
      if (cookieData.retryOnError) throw err;
      return null;
    }
    console.error("Error processing affiliate order:", err);
    if (cookieData.retryOnError) throw err;
    return null;
  }
};

// ─── ORDER DELIVERED — starts the return-window clock from the real delivery date ────────────
export const onOrderDelivered = async (orderId, deliveredAt) => {
  const affOrder = await affiliateDAO.getAffiliateOrderByOrderId(orderId);
  if (!affOrder || affOrder.delivered_at) return; // no affiliate attribution, or already processed

  const config = await affiliateDAO.getConfig();
  const returnWindowEndsAt = new Date(deliveredAt);
  returnWindowEndsAt.setDate(returnWindowEndsAt.getDate() + (config.commission_hold_days || 7));

  await prisma.affiliate_orders.updateMany({
    where: { id: affOrder.id, delivered_at: null },
    data: { delivered_at: deliveredAt, return_window_ends_at: returnWindowEndsAt },
  });
};

// ─── ORDER RETURNED/CANCELLED — reverse commission, no clawback once already paid out ─────────
export const onOrderReturned = async (orderId, returnType, returnAmount) => {
  if (returnType === "FULL") return reconcileAffiliateReturns(orderId, { full: true });
  if (returnType === "PARTIAL") return reconcileAffiliateReturns(orderId);
};

// ─── AUTO-APPROVE COMMISSIONS WHOSE RETURN WINDOW HAS PASSED (cron) ──────────────────────────
export const processCommissionAutoApproval = async () => {
  const due = await affiliateDAO.findDueForAutoApproval();
  let processed = 0;
  for (const affOrder of due) {
    try {
      const result = await approveCommission(affOrder.id, null);
      if (result) processed++;
    } catch (err) {
      console.error(`[affiliateService] auto-approve failed for affiliate_order ${affOrder.id}:`, err.message);
    }
  }
  return { processed, checked: due.length };
};

// ─── APPROVE COMMISSION ──────────────────────────────────────────────────────
// adminId: unused (pre-existing — no admin_id column on affiliate_commissions); pass null from the cron.
export const approveCommission = async (affiliateOrderId, adminId) => {
  const config = await affiliateDAO.getConfig();

  const affOrder = await prisma.affiliate_orders.findUnique({
    where: { id: affiliateOrderId },
    include: { affiliate_profiles: true },
  });
  if (!affOrder) throw new Error("Affiliate order not found");
  if (affOrder.commission_status !== "PENDING") return null; // already approved/reversed — idempotent no-op
  await reconcileAffiliateReturns(affOrder.order_id);


  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM affiliate_orders WHERE id = ${affiliateOrderId}::uuid FOR UPDATE`;
      const affOrder = await tx.affiliate_orders.findUnique({ where: { id: affiliateOrderId }, include: { affiliate_profiles: true } });
      if (!affOrder || affOrder.commission_status !== "PENDING") return null;
      const profile = affOrder.affiliate_profiles;
      const finalAmount = Number(affOrder.final_commission || 0);
      const tierBonus = Number(affOrder.tier_bonus || 0);
      const baseRate = Number(affOrder.commission_rate || 0);
      const effectiveRate = baseRate + tierBonus;

      // TDS calculation
      let tdsApplicable = false;
      let tdsRate = 0;
      let tdsAmount = 0;
      if (config.enable_tds) {
        tdsApplicable = true;
        tdsRate = profile.pan_number
          ? Number(config.tds_rate_with_pan)
          : Number(config.tds_rate_without_pan);
        tdsAmount = (finalAmount * tdsRate) / 100;
      }

      const netAmount = finalAmount - tdsAmount;
      // Atomic guard: reject if another call already moved this order out of PENDING.
      const guard = await tx.affiliate_orders.updateMany({
        where: { id: affiliateOrderId, commission_status: "PENDING" },
        data: { commission_status: "APPROVED", processed_at: new Date() },
      });
      if (guard.count === 0) return null;

      const commission = await tx.affiliate_commissions.create({
        data: {
          affiliate_id: profile.id,
          affiliate_order_id: affiliateOrderId,
          order_id: affOrder.order_id,
          order_value: affOrder.final_order_value,
          base_commission_rate: baseRate,
          tier_bonus: tierBonus,
          effective_rate: effectiveRate,
          gross_commission: finalAmount,
          net_commission: netAmount,
          tds_applicable: tdsApplicable,
          tds_rate: tdsRate,
          tds_amount: tdsAmount,
          final_amount: netAmount,
          status: "APPROVED",
          order_date: affOrder.order_date,
          approved_at: new Date(),
          qualified_at: new Date(),
          campaign_id: affOrder.campaign_id,
          campaign_name: affOrder.campaign_name,
          campaign_breakdown: affOrder.campaign_breakdown,
        },
      });

      // Move from pending to available balance
      await tx.affiliate_profiles.update({
        where: { id: profile.id },
        data: {
          available_balance: { increment: netAmount },
          pending_balance: { decrement: finalAmount },
        },
      });

      return commission;
    });
  } catch (err) {
    if (err.code === "P2002") return null; // duplicate commission row — already approved concurrently
    throw err;
  }
};
