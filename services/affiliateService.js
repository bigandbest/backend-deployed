import prisma from "../config/prisma.js";
import affiliateDAO from "../dao/affiliate.dao.js";
import { calculateEligibleOrderBase } from "./rewardCalculation.js";
import { supersedeByAffiliateAttribution, logAdminAction, logFraud } from "./referralService.js";
import { getActiveCampaignRules, matchRuleForItem, computeRuleAmount, reserveCampaignUsage } from "./campaignEngine.js";

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
export const calculateCommission = async (orderItems, tierBonus = 0, eligibleBase = null, orderId = null) => {
  const config = await affiliateDAO.getConfig();
  const defaultRate = Number(config.default_commission_rate);
  const campaignRules = orderId ? await getActiveCampaignRules("AFFILIATE") : [];

  let totalCommission = 0;
  const breakdown = [];
  const campaignContribution = new Map(); // campaign_id -> { name, amount }
  const categoryCommissions = new Map(); // category_id -> category commission row (memo)

  const itemsTotal = orderItems.reduce((sum, i) => sum + Number(i.price) * Number(i.quantity), 0);
  const discountRatio = eligibleBase == null || itemsTotal <= 0 ? 1 : Math.min(1, Math.max(0, Number(eligibleBase) / itemsTotal));

  // Match campaign rules per item, then reserve ONE usage slot per distinct campaign BEFORE pricing (Q11/Q16).
  // A campaign whose usage_limit is exhausted yields no slot => its items fall back to the default/category rate,
  // so the cap actually caps the payout (previously the campaign rate was still paid, just without a campaign_id).
  const candidates = orderItems.map((item) => {
    if (!campaignRules.length) return null;
    const candidate = matchRuleForItem(campaignRules, { productId: item.product_id, categoryId: item.category_id });
    return candidate && (candidate.min_order_value == null || Number(eligibleBase) >= Number(candidate.min_order_value)) ? candidate : null;
  });
  const slotGranted = new Map(); // campaign_id -> boolean
  if (orderId) {
    for (const c of candidates) {
      if (c && !slotGranted.has(c.campaign_id)) slotGranted.set(c.campaign_id, await reserveCampaignUsage(c.campaign_id, orderId, "AFFILIATE"));
    }
  }

  for (const [idx, item] of orderItems.entries()) {
    const itemValue = round2(Number(item.price) * Number(item.quantity) * discountRatio);
    const matchedRule = candidates[idx] && slotGranted.get(candidates[idx].campaign_id) ? candidates[idx] : null;

    let rate, effectiveRate, commission, source;
    if (matchedRule) {
      // Campaign fully replaces the default/category rate — no tier-bonus stacking on top (Q3).
      rate = Number(matchedRule.reward_value);
      effectiveRate = rate;
      commission = computeRuleAmount(matchedRule, itemValue);
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
    if (existing) return existing;

    const profile = await affiliateDAO.getProfileByCode(affiliateCode);
    if (!profile || profile.status !== "ACTIVE") return null;

    // Fetch the order from our orders table
    const order = await prisma.orders.findUnique({
      where: { id: orderId },
      include: { order_items: { include: { product_variants: { include: { products: true } } } } },
    });
    if (!order) return null;

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
      product_id: oi.product_variants?.product_id,
      category_id: oi.product_variants?.products?.category_id,
      price: Number(oi.price),
      quantity: oi.quantity,
    }));

    const { grossCommission, netCommission, breakdown, campaignsUsed } = await calculateCommission(items, tierBonus, eligibleBase, orderId);

    // Q16: campaign_id is only set when exactly one distinct campaign contributed — the
    // convenience field for the common case. campaign_breakdown is always the authoritative,
    // per-item snapshot (Q10), whether zero, one, or several campaigns touched this order.
    const singleCampaign = campaignsUsed.length === 1 ? campaignsUsed[0] : null;

    // Return window starts at actual delivery (see onOrderDelivered), not order creation —
    // left unset here so the auto-approval cron never picks this up prematurely.
    const affiliateOrder = await affiliateDAO.createAffiliateOrder({
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
      campaign_breakdown: breakdown.some((b) => b.campaign_id) ? breakdown : null,
    });

    // Update profile stats
    await affiliateDAO.incrementProfileStats(profile.id, {
      total_orders: { increment: 1 },
      total_sales: { increment: eligibleBase },
      pending_balance: { increment: netCommission },
      total_commission_earned: { increment: netCommission },
    });

    // Q1: this valid affiliate attribution takes precedence over any pending referral on this order.
    await supersedeByAffiliateAttribution(orderId);

    return affiliateOrder;
  } catch (err) {
    // Unique violation on order_id means a concurrent call already created this row — fetch and return it.
    if (err.code === "P2002") {
      return affiliateDAO.getAffiliateOrderByOrderId(orderId);
    }
    console.error("Error processing affiliate order:", err);
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
  const affOrder = await affiliateDAO.getAffiliateOrderByOrderId(orderId);
  if (!affOrder || affOrder.is_returned) return;

  if (returnType === "FULL") {
    if (affOrder.commission_status === "PAID") {
      const guard = await prisma.affiliate_orders.updateMany({
        where: { id: affOrder.id, is_returned: false },
        data: { is_returned: true, return_amount: affOrder.gross_order_value },
      });
      if (guard.count === 0) return; // already processed

      // Q12: commission already paid out — absorb the loss, no debt. Persisted (not just
      // console.warn'd) so the business can query realized losses via GET /admin/referral/activity-logs.
      await logAdminAction(null, null, "SYSTEM", "AFFILIATE_COMMISSION_LOSS_ABSORBED",
        `Order ${orderId} returned after commission already paid — no clawback`,
        "affiliate_order", affOrder.id,
        { commission_status: "PAID" },
        { return_type: returnType, return_amount: affOrder.gross_order_value });
      return;
    }

    // is_returned guard lives in the same transaction as the balance reversal (not a separate
    // updateMany beforehand) — a crash mid-way must not leave is_returned=true with the
    // commission never actually reversed, since that state is a silent, permanent no-op below.
    await prisma.$transaction(async (tx) => {
      const guard = await tx.affiliate_orders.updateMany({
        where: { id: affOrder.id, is_returned: false },
        data: { is_returned: true, return_amount: affOrder.gross_order_value },
      });
      if (guard.count === 0) return; // already processed (concurrent call)

      const wasApproved = affOrder.commission_status === "APPROVED";
      await tx.affiliate_orders.update({ where: { id: affOrder.id }, data: { commission_status: "REVERSED" } });

      if (wasApproved) {
        // Reverse the actual post-TDS amount credited to available_balance, not the pre-TDS order value.
        const commission = await tx.affiliate_commissions.findUnique({ where: { affiliate_order_id: affOrder.id } });
        await tx.affiliate_profiles.update({
          where: { id: affOrder.affiliate_id },
          data: {
            available_balance: { decrement: Number(commission?.final_amount || 0) },
            // Earned was incremented by the pre-TDS commission at conversion — reverse the same amount.
            total_commission_earned: { decrement: Number(affOrder.final_commission || 0) },
          },
        });
        await tx.affiliate_commissions.updateMany({
          where: { affiliate_order_id: affOrder.id },
          data: { status: "CANCELLED", cancelled_at: new Date(), cancellation_reason: "Order returned/cancelled" },
        });
      } else {
        // Still PENDING — reverse the pre-TDS amount that was provisionally added to pending_balance.
        await tx.affiliate_profiles.update({
          where: { id: affOrder.affiliate_id },
          data: {
            pending_balance: { decrement: Number(affOrder.final_commission || 0) },
            total_commission_earned: { decrement: Number(affOrder.final_commission || 0) },
          },
        });
      }
    });
  } else if (returnType === "PARTIAL") {
    // Only meaningful while commission hasn't been approved/paid yet.
    if (affOrder.commission_status !== "PENDING") {
      console.warn(`[affiliateService] Partial return for order ${orderId} ignored — commission already ${affOrder.commission_status}`);
      return;
    }
    await prisma.affiliate_orders.update({
      where: { id: affOrder.id },
      data: { return_amount: { increment: Number(returnAmount || 0) } },
    });
  }
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

  try {
    return await prisma.$transaction(async (tx) => {
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
