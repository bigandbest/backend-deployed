import prisma from "../config/prisma.js";
import affiliateDAO from "../dao/affiliate.dao.js";

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
export const calculateCommission = async (orderItems, tierBonus = 0) => {
  const config = await affiliateDAO.getConfig();
  const defaultRate = Number(config.default_commission_rate);

  let totalCommission = 0;
  const breakdown = [];

  for (const item of orderItems) {
    const itemValue = Number(item.price) * Number(item.quantity);
    let rate = defaultRate;

    // Try to get category-specific rate from the product's category
    if (item.category_id) {
      const catComm = await affiliateDAO.getCategoryCommissionByCategory(
        item.category_id,
      );
      if (catComm && catComm.is_active) {
        rate = Number(catComm.base_commission_rate);
      }
    }

    const effectiveRate = rate + Number(tierBonus);
    const commission = (itemValue * effectiveRate) / 100;
    totalCommission += commission;
    breakdown.push({ productId: item.product_id, itemValue, rate, effectiveRate, commission });
  }

  return {
    grossCommission: totalCommission,
    netCommission: totalCommission,
    breakdown,
  };
};

// ─── TIER CALCULATION ────────────────────────────────────────────────────────
export const calculateTier = (monthlySales) => {
  if (monthlySales >= 500000) return { name: "Platinum", bonus: 2 };
  if (monthlySales >= 100000) return { name: "Gold", bonus: 1 };
  if (monthlySales >= 25000) return { name: "Silver", bonus: 0.5 };
  return { name: "Bronze", bonus: 0 };
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

    // Self-referral check
    if (config.block_self_referral && order.user_id === profile.user_id) {
      return null;
    }

    const orderValue = Number(order.total) - Number(order.shipping || 0);
    const tierBonus = Number(profile.tier_bonus);

    // Build items for commission calculation
    const items = order.order_items.map((oi) => ({
      product_id: oi.product_variants?.product_id,
      category_id: oi.product_variants?.products?.category_id,
      price: Number(oi.price),
      quantity: oi.quantity,
    }));

    const { grossCommission, netCommission } = await calculateCommission(items, tierBonus);

    const holdDays = config.commission_hold_days || 7;
    const returnWindowEndsAt = new Date();
    returnWindowEndsAt.setDate(returnWindowEndsAt.getDate() + holdDays + 7);

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
      gross_order_value: orderValue,
      discount_amount: Number(order.coupon_discount || 0),
      net_order_value: orderValue,
      final_order_value: orderValue,
      return_window_ends_at: returnWindowEndsAt,
      commission_rate: grossCommission > 0 ? (grossCommission / orderValue) * 100 : 0,
      commission_amount: grossCommission,
      tier_bonus: tierBonus,
      final_commission: netCommission,
    });

    // Update profile stats
    await affiliateDAO.incrementProfileStats(profile.id, {
      total_orders: { increment: 1 },
      total_sales: { increment: orderValue },
      pending_balance: { increment: netCommission },
      total_commission_earned: { increment: netCommission },
    });

    return affiliateOrder;
  } catch (err) {
    console.error("Error processing affiliate order:", err);
    return null;
  }
};

// ─── APPROVE COMMISSION ──────────────────────────────────────────────────────
export const approveCommission = async (affiliateOrderId, adminId) => {
  const config = await affiliateDAO.getConfig();

  const affOrder = await prisma.affiliate_orders.findUnique({
    where: { id: affiliateOrderId },
    include: { affiliate_profile: true },
  });
  if (!affOrder) throw new Error("Affiliate order not found");

  const profile = affOrder.affiliate_profile;
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

  const commission = await affiliateDAO.createCommission({
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
  });

  // Update order
  await affiliateDAO.updateAffiliateOrder(affiliateOrderId, {
    commission_status: "APPROVED",
    processed_at: new Date(),
  });

  // Move from pending to available balance
  await affiliateDAO.incrementProfileStats(profile.id, {
    available_balance: { increment: netAmount },
    pending_balance: { decrement: finalAmount },
  });

  return commission;
};
