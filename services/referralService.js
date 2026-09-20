// services/referralService.js
import prisma from "../config/prisma.js";
import { matchReferralCampaign } from "./campaignEngine.js";
import { renderNotification } from "./notificationTemplateService.js";
import { evaluateEarningEligibility, creditQualifyingReferral } from "./membershipService.js";

// ============================================================================
// REFERRAL CODE GENERATION
// ============================================================================

/**
 * Generate unique referral code from phone when available, otherwise from name.
 * Examples: 98761234, AMIT1234
 */
export const generateReferralCode = async (phoneOrName) => {
  const normalizedPhone = String(phoneOrName || "").replace(/\D/g, "");
  const prefix = normalizedPhone
    ? normalizedPhone.slice(-4).padStart(4, "0")
    : String(phoneOrName || "USER")
        .replace(/[^a-zA-Z]/g, "")
        .toUpperCase()
        .substring(0, 4)
        .padEnd(4, "X");

  let attempts = 0;
  while (attempts < 10) {
    const digits = String(Math.floor(1000 + Math.random() * 9000));
    const code = `${prefix}${digits}`;
    const existing = await prisma.user_referral_profiles.findUnique({
      where: { referral_code: code },
    });
    if (!existing) return code;
    attempts++;
  }
  // Fallback: use timestamp suffix
  return `${prefix}${Date.now().toString().slice(-4)}`;
};

// ============================================================================
// PROFILE MANAGEMENT
// ============================================================================

/**
 * Get or create referral profile for a user
 */
export const getOrCreateReferralProfile = async (userId, userName) => {
  let profile = await prisma.user_referral_profiles.findUnique({
    where: { user_id: userId },
  });

  if (!profile) {
    const code = await generateReferralCode(userName);
    profile = await prisma.user_referral_profiles.create({
      data: {
        user_id: userId,
        referral_code: code,
      },
    });
  }

  return profile;
};

// ============================================================================
// CODE VALIDATION & APPLICATION
// ============================================================================

/**
 * Validate a referral code before signup
 */
export const validateReferralCode = async (code) => {
  if (!code) return { valid: false, error: "Code is required" };

  const profile = await prisma.user_referral_profiles.findUnique({
    where: { referral_code: code.toUpperCase() },
  });

  if (!profile) return { valid: false, error: "Invalid referral code" };
  if (!profile.referral_code_active) return { valid: false, error: "This referral code is no longer active" };
  if (profile.is_blocked) return { valid: false, error: "This referral code is unavailable" };

  // Check config for max earnings
  const config = await getConfig();
  if (parseFloat(profile.total_earnings) >= parseFloat(config.max_earning_per_user)) {
    return { valid: false, error: "This referrer has reached their maximum earning limit" };
  }

  return { valid: true, referrerId: profile.user_id, referrerProfileId: profile.id };
};

/**
 * Apply referral code when a new user signs up
 */
export const applyReferralCode = async (refereeId, refereeData, referralCode, ipAddress, userAgent) => {
  // Q5/Q10: program_enabled is a hard override on the new_referral_signups_enabled sub-toggle.
  // Gates only relationship formation here — generate-code and validate-code stay unaffected.
  const config = await getConfig();
  if (!config.is_enabled || !config.new_referral_signups_enabled) {
    return { success: false, error: "New referral signups are temporarily paused" };
  }

  const validation = await validateReferralCode(referralCode);
  if (!validation.valid) return { success: false, error: validation.error };

  // Prevent self-referral
  if (validation.referrerId === refereeId) {
    await logFraud(refereeId, referralCode, null, "SELF_REFERRAL", "MEDIUM", "User attempted self-referral", ipAddress, userAgent);
    return { success: false, error: "You cannot use your own referral code" };
  }

  // Check if user already used a referral code
  const existingProfile = await prisma.user_referral_profiles.findUnique({
    where: { user_id: refereeId },
  });

  if (existingProfile?.was_referred) {
    return { success: false, error: "You have already used a referral code" };
  }

  // Check IP-based fraud (max referrals per IP)
  if (config.enable_ip_tracking && ipAddress) {
    const recentFromIp = await prisma.referral_transactions.count({
      where: {
        ip_address: ipAddress,
        created_at: { gte: new Date(Date.now() - config.cooldown_hours * 3600000) },
      },
    });
    if (recentFromIp >= config.max_referrals_per_ip) {
      await logFraud(refereeId, referralCode, null, "SAME_IP", "HIGH",
        `Too many referrals from IP ${ipAddress}`, ipAddress, userAgent);
      return { success: false, error: "Too many referrals from this network" };
    }
  }

  const referrerProfile = await prisma.user_referral_profiles.findUnique({
    where: { referral_code: referralCode.toUpperCase() },
  });

  // Make sure the referee has a profile row first (outside the transaction: a concurrent create hitting the
  // unique user_id would otherwise abort it). was_referred starts false and is claimed atomically below.
  try {
    await prisma.user_referral_profiles.upsert({
      where: { user_id: refereeId },
      update: {},
      create: {
        user_id: refereeId,
        referral_code: await generateReferralCode(refereeData.phone || refereeData.name),
        was_referred: false,
      },
    });
  } catch (err) {
    if (err.code !== "P2002") throw err; // concurrent request already created it
  }

  let transaction;
  try {
    transaction = await prisma.$transaction(async (tx) => {
      // Atomic claim: concurrent/repeated requests block on this row, then match 0 rows and are rejected —
      // one referee can never end up with two referral transactions.
      const claim = await tx.user_referral_profiles.updateMany({
        where: { user_id: refereeId, was_referred: false },
        data: {
          was_referred: true,
          referred_by_user_id: referrerProfile.user_id,
          referred_by_code: referralCode.toUpperCase(),
          referred_at: new Date(),
        },
      });
      if (claim.count === 0) throw Object.assign(new Error("ALREADY_REFERRED"), { code: "ALREADY_REFERRED" });

      const created = await tx.referral_transactions.create({
        data: {
          referrer_id: referrerProfile.user_id,
          referrer_profile_id: referrerProfile.id,
          referral_code_used: referralCode.toUpperCase(),
          referee_id: refereeId,
          referee_email: refereeData.email || null,
          referee_name: refereeData.name,
          referee_phone: refereeData.phone,
          status: "SIGNUP_COMPLETED",
          status_history: [{ status: "PENDING", timestamp: new Date(), note: "Transaction created" },
                           { status: "SIGNUP_COMPLETED", timestamp: new Date(), note: "Referee signed up" }],
          ip_address: ipAddress,
          user_agent: userAgent,
        },
      });

      // Increment referrer's pending count
      await tx.user_referral_profiles.update({
        where: { id: referrerProfile.id },
        data: { total_referrals: { increment: 1 }, pending_referrals: { increment: 1 } },
      });
      return created;
    });
  } catch (err) {
    if (err.code === "ALREADY_REFERRED") return { success: false, error: "You have already used a referral code" };
    throw err;
  }

  // Send notification to referrer
  await createNotification(referrerProfile.user_id, "REFERRAL_SIGNUP",
    { referee_name: refereeData.name || "Someone" },
    { referral_transaction_id: transaction.id });

  return { success: true, transaction };
};

// ============================================================================
// ORDER PROCESSING HOOKS
// ============================================================================

/**
 * Called when a referred user places an order
 */
export const onOrderPlaced = async (refereeId, orderId, orderNumber, orderAmount) => {
  const config = await getConfig();
  if (!config.is_enabled) return;

  // Find the active referral transaction for this referee
  const referralTx = await prisma.referral_transactions.findFirst({
    where: {
      referee_id: refereeId,
      status: "SIGNUP_COMPLETED",
    },
    orderBy: { created_at: "desc" },
  });

  if (!referralTx) return;

  // Check minimum order value
  if (parseFloat(orderAmount) < parseFloat(config.min_order_value)) return;

  // Atomic guard: two concurrent calls for the same referee must not both flip this transaction.
  const history = Array.isArray(referralTx.status_history) ? referralTx.status_history : [];
  // Membership earning gate, snapshotted at order placement: a lapse during the return window must not
  // retroactively invalidate an order that was placed while the referrer was eligible.
  const orderDate = new Date();
  const membershipEligible = await evaluateEarningEligibility(referralTx.referrer_id, orderDate);
  const guard = await prisma.referral_transactions.updateMany({
    where: { id: referralTx.id, status: "SIGNUP_COMPLETED" },
    data: {
      status: "ORDER_PLACED",
      order_id: orderId,
      order_number: orderNumber,
      order_amount: orderAmount,
      order_date: orderDate,
      membership_eligible: membershipEligible,
      status_history: [...history, { status: "ORDER_PLACED", timestamp: new Date(), note: `Order ${orderNumber} placed${membershipEligible ? "" : " (referrer membership not eligible to earn)"}` }],
    },
  });
  if (guard.count === 0) return; // already processed by a concurrent call

  // Q9/Q15: match & reserve a campaign now that this order has won the transaction (avoids
  // wasting a usage slot on the losing side of the race above). Never touches attribution —
  // that's already resolved. Swallowed on error so a campaign-engine bug can't block the order.
  try {
    const orderItems = await prisma.order_items.findMany({
      where: { order_id: orderId },
      select: { product_variants: { select: { product_id: true, products: { select: { category_id: true } } } } },
    });
    const items = orderItems.map((oi) => ({
      productId: oi.product_variants?.product_id || null,
      categoryId: oi.product_variants?.products?.category_id || null,
    }));
    const campaignMatch = await matchReferralCampaign({ orderId, items, eligibleBase: orderAmount });
    if (campaignMatch) {
      await prisma.referral_transactions.update({
        where: { id: referralTx.id },
        data: {
          campaign_id: campaignMatch.campaign_id,
          campaign_name: campaignMatch.campaign_name,
          applied_reward_type: campaignMatch.applied_reward_type,
          applied_reward_value: campaignMatch.applied_reward_value,
        },
      });
    }
  } catch (err) {
    console.error(`[referralService] campaign match failed for order ${orderId}:`, err.message);
  }

  // Notify referrer
  await createNotification(referralTx.referrer_id, "REFERRAL_ORDER_PLACED",
    {},
    { referral_transaction_id: referralTx.id });
};

/**
 * Called when a referred user's order is delivered
 */
export const onOrderDelivered = async (orderId, deliveredAt) => {
  const referralTx = await prisma.referral_transactions.findFirst({
    where: { order_id: orderId, status: "ORDER_PLACED" },
  });

  if (!referralTx) return;

  const config = await getConfig();
  const returnWindowEnd = new Date(deliveredAt);
  returnWindowEnd.setDate(returnWindowEnd.getDate() + config.return_window_days);

  const history = Array.isArray(referralTx.status_history) ? referralTx.status_history : [];
  const guard = await prisma.referral_transactions.updateMany({
    where: { id: referralTx.id, status: "ORDER_PLACED" },
    data: {
      status: "RETURN_WINDOW_ACTIVE",
      delivered_at: deliveredAt,
      return_window_starts_at: deliveredAt,
      return_window_ends_at: returnWindowEnd,
      status_history: [...history,
        { status: "ORDER_DELIVERED", timestamp: new Date() },
        { status: "RETURN_WINDOW_ACTIVE", timestamp: new Date(), note: `Return window ends ${returnWindowEnd.toISOString()}` }],
    },
  });
  if (guard.count === 0) return; // already processed by a concurrent call

  await createNotification(referralTx.referrer_id, "REFERRAL_ORDER_DELIVERED",
    {},
    { referral_transaction_id: referralTx.id });
};

/**
 * Called when return window expires — credits rewards
 */
export const processReturnWindowExpiry = async (referralTransactionId) => {
  const referralTx = await prisma.referral_transactions.findUnique({
    where: { id: referralTransactionId },
    include: { referrer_profile: true },
  });

  if (!referralTx || referralTx.status !== "RETURN_WINDOW_ACTIVE") return;

  const config = await getConfig();

  // Q3/Q10: a campaign match at placement time fully replaces the referrer's reward — the
  // snapshot already holds the final, capped rupee amount, nothing to re-derive. The referee's
  // signup bonus is unaffected either way; campaigns are a referrer-incentive tool, not a
  // referee-signup one, so it always comes from the flat config default.
  const refereeAmount = parseFloat(config.referee_reward_amount);
  const referrerAmount = referralTx.campaign_id && referralTx.applied_reward_value != null
    ? parseFloat(referralTx.applied_reward_value)
    : (await calculateRewardAmounts(referralTx.referrer_profile, referralTx.order_amount, config)).referrerAmount;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + config.reward_validity_days);

  // Use a transaction for atomicity
  const result = await prisma.$transaction(async (tx) => {
    // Atomic guard: a concurrent/overlapping cron run must not credit this transaction twice.
    const guard = await tx.referral_transactions.updateMany({
      where: { id: referralTx.id, status: "RETURN_WINDOW_ACTIVE" },
      data: { status: "COMPLETED" },
    });
    if (guard.count === 0) return null; // already completed by a concurrent run

    // Membership decides WHETHER the referrer earns (snapshot taken at order placement); tiers/campaigns decide HOW MUCH.
    // The referee's signup bonus is unaffected by the referrer's membership.
    const referrerEligible = referralTx.membership_eligible !== false;

    // Credit referrer reward
    const rr = referrerEligible ? await tx.referral_rewards.create({
      data: {
        user_id: referralTx.referrer_id,
        user_profile_id: referralTx.referrer_profile_id,
        amount: referrerAmount,
        original_amount: referrerAmount,
        remaining_amount: referrerAmount,
        reward_type: "REFERRER_REWARD",
        referral_transaction_id: referralTx.id,
        source_type: "REFERRAL",
        source_description: `Referral reward for ${referralTx.referee_name || "referee"}`,
        expires_at: expiresAt,
        status: "ACTIVE",
      },
    }) : null;

    // Credit referee reward
    const refeeProfile = await tx.user_referral_profiles.findUnique({
      where: { user_id: referralTx.referee_id },
    });

    let re = null;
    if (refeeProfile) {
      re = await tx.referral_rewards.create({
        data: {
          user_id: referralTx.referee_id,
          user_profile_id: refeeProfile.id,
          amount: refereeAmount,
          original_amount: refereeAmount,
          remaining_amount: refereeAmount,
          reward_type: "REFEREE_BONUS",
          referral_transaction_id: referralTx.id,
          source_type: "REFERRAL",
          source_description: "Signup bonus for using referral code",
          expires_at: expiresAt,
          status: "ACTIVE",
        },
      });

      // Update referee profile balance
      await tx.user_referral_profiles.update({
        where: { id: refeeProfile.id },
        data: {
          available_balance: { increment: refereeAmount },
          total_earnings: { increment: refereeAmount },
          referral_bonus_received: true,
        },
      });
    }

    // Update referrer profile balance and stats (an ineligible referral earns nothing and is not a "successful" referral)
    const updatedReferrerProfile = await tx.user_referral_profiles.update({
      where: { id: referralTx.referrer_profile_id },
      data: referrerEligible
        ? {
            available_balance: { increment: referrerAmount },
            total_earnings: { increment: referrerAmount },
            pending_referrals: { decrement: 1 },
            successful_referrals: { increment: 1 },
          }
        : { pending_referrals: { decrement: 1 } },
    });

    // Membership Q3/Q4: derive tier from the just-incremented successful_referrals count,
    // using the same shared ladder tiered rewards already reads (Q6) — never write backwards
    // (Q4/monotonicity constraint): a config edit that would otherwise "unqualify" an
    // already-achieved tier must never revoke it.
    const tiers = Array.isArray(config.tiered_rewards_config?.tiers) ? config.tiered_rewards_config.tiers : [];
    const derivedTier = deriveTierName(updatedReferrerProfile.successful_referrals, tiers);
    if (referrerEligible && tierRank(derivedTier, tiers) > tierRank(updatedReferrerProfile.current_tier, tiers)) {
      await tx.user_referral_profiles.update({
        where: { id: referralTx.referrer_profile_id },
        data: { current_tier: derivedTier },
      });
    }

    // Update referral transaction
    const history = Array.isArray(referralTx.status_history) ? referralTx.status_history : [];
    await tx.referral_transactions.update({
      where: { id: referralTx.id },
      data: {
        status: "COMPLETED",
        referrer_reward_amount: referrerEligible ? referrerAmount : 0,
        referee_reward_amount: refereeAmount,
        referrer_reward_id: rr?.id,
        referee_reward_id: re?.id,
        reward_credited_at: new Date(),
        status_history: [...history, { status: "COMPLETED", timestamp: new Date(), note: referrerEligible ? "Rewards credited" : "Referee bonus credited; referrer not eligible to earn (membership)" }],
      },
    });

    // Membership qualification in the SAME transaction as the reward: unique per referred user, replay-safe.
    await creditQualifyingReferral(tx, referralTx);

    return [rr, re];
  }, { maxWait: 10000, timeout: 30000 }); // many sequential statements; the 5s default is too tight over a remote pooler

  if (!result) return null; // guard tripped — a concurrent run already credited this transaction
  const [referrerReward, refereeReward] = result;

  // Send notifications
  if (referrerReward) {
    await createNotification(referralTx.referrer_id, "REWARD_CREDITED",
      { amount: referrerAmount, validity_days: config.reward_validity_days },
      { reward_id: referrerReward.id, amount: referrerAmount });
  }

  if (refereeReward) {
    await createNotification(referralTx.referee_id, "REWARD_CREDITED",
      { amount: refereeAmount, validity_days: config.reward_validity_days },
      { reward_id: refereeReward.id, amount: refereeAmount });
  }

  return { referrerReward, refereeReward };
};

/**
 * Called when an order is returned/cancelled — mark referral as failed
 */
export const onOrderReturned = async (orderId, returnType, returnAmount) => {
  const referralTx = await prisma.referral_transactions.findFirst({
    where: { order_id: orderId, status: { in: ["ORDER_PLACED", "RETURN_WINDOW_ACTIVE"] } },
  });

  if (!referralTx) return;

  const history = Array.isArray(referralTx.status_history) ? referralTx.status_history : [];

  if (returnType === "FULL") {
    // Full return: mark as failed. Guarded so a duplicate call for the same order is a no-op.
    const guard = await prisma.referral_transactions.updateMany({
      where: { id: referralTx.id, status: { in: ["ORDER_PLACED", "RETURN_WINDOW_ACTIVE"] } },
      data: {
        status: "FAILED",
        is_returned: true,
        return_type: "FULL",
        returned_at: new Date(),
        failure_reason: "Order fully returned",
        failed_at: new Date(),
        status_history: [...history, { status: "FAILED", timestamp: new Date(), note: "Full order return" }],
      },
    });
    if (guard.count === 0) return;

    await prisma.user_referral_profiles.update({
      where: { id: referralTx.referrer_profile_id },
      data: { pending_referrals: { decrement: 1 }, failed_referrals: { increment: 1 } },
    });
  } else if (returnType === "PARTIAL") {
    // Partial return: reduce order amount, let return window continue.
    // Not idempotency-guarded against duplicate calls for the same physical return event —
    // callers must only invoke this once per distinct partial-return approval.
    await prisma.referral_transactions.update({
      where: { id: referralTx.id },
      data: {
        is_returned: true,
        return_type: "PARTIAL",
        return_amount: returnAmount,
        returned_at: new Date(),
        order_amount: { decrement: parseFloat(returnAmount) },
        status_history: [...history, { status: referralTx.status, timestamp: new Date(), note: `Partial return: ₹${returnAmount}` }],
      },
    });
  }
};

/**
 * Q1: a valid affiliate attribution on this order takes precedence over the permanent
 * referral relationship — called by affiliateService once it successfully attributes an order.
 * Does not touch the permanent referred_by_user_id relationship, only this order's transaction.
 */
export const supersedeByAffiliateAttribution = async (orderId) => {
  const referralTx = await prisma.referral_transactions.findFirst({
    where: { order_id: orderId, status: { in: ["ORDER_PLACED", "RETURN_WINDOW_ACTIVE"] } },
  });
  if (!referralTx) return;

  const history = Array.isArray(referralTx.status_history) ? referralTx.status_history : [];
  const guard = await prisma.referral_transactions.updateMany({
    where: { id: referralTx.id, status: { in: ["ORDER_PLACED", "RETURN_WINDOW_ACTIVE"] } },
    data: {
      status: "SUPERSEDED_BY_AFFILIATE",
      status_history: [...history, { status: "SUPERSEDED_BY_AFFILIATE", timestamp: new Date(), note: "Affiliate attribution took precedence for this order" }],
    },
  });
  if (guard.count === 0) return;

  await prisma.user_referral_profiles.update({
    where: { id: referralTx.referrer_profile_id },
    data: { pending_referrals: { decrement: 1 } },
  });
};

// ============================================================================
// WALLET & REWARDS
// ============================================================================

/**
 * Get wallet balance breakdown for a user
 */
export const getWalletBalance = async (userId) => {
  const profile = await prisma.user_referral_profiles.findUnique({
    where: { user_id: userId },
  });

  if (!profile) return { available: 0, pending: 0, expiringSoon: 0, totalEarned: 0 };

  const now = new Date();
  const in48h = new Date(now.getTime() + 48 * 3600000);

  const activeRewards = await prisma.referral_rewards.findMany({
    where: {
      user_id: userId,
      status: { in: ["ACTIVE", "PARTIALLY_USED"] },
      expires_at: { gt: now },
    },
    orderBy: { expires_at: "asc" },
  });

  const expiringSoon = activeRewards.filter(r => new Date(r.expires_at) <= in48h);

  // profile.pending_balance is never written anywhere — derive the real pending estimate instead
  // from in-flight referral transactions (flat reward amount; doesn't account for tiering/caps).
  const config = await getConfig();
  const pendingTxCount = await prisma.referral_transactions.count({
    where: { referrer_id: userId, status: { in: ["ORDER_PLACED", "RETURN_WINDOW_ACTIVE"] } },
  });
  const pendingEstimate = pendingTxCount * parseFloat(config.referrer_reward_amount);

  return {
    available: parseFloat(profile.available_balance),
    pending: pendingEstimate,
    expiringSoon: expiringSoon.reduce((s, r) => s + parseFloat(r.remaining_amount), 0),
    totalEarned: parseFloat(profile.total_earnings),
    withdrawn: parseFloat(profile.withdrawn_amount),
    expired: parseFloat(profile.expired_amount),
    usedForPurchase: parseFloat(profile.used_for_purchase),
    activeRewards,
  };
};

/**
 * Spend referral wallet balance on an order (FIFO)
 */
export const spendReferralBalance = async (userId, amount, orderId, orderNumber) => {
  amount = Number(amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid amount");
  amount = Math.round(amount * 100) / 100;

  const profile = await prisma.user_referral_profiles.findUnique({ where: { user_id: userId } });
  if (!profile) throw new Error("Referral profile not found");

  await prisma.$transaction(async (tx) => {
    // Atomic balance claim first: it locks the profile row, so concurrent spends run one at a time and the
    // balance can never go negative or be spent twice.
    const claim = await tx.user_referral_profiles.updateMany({
      where: { user_id: userId, available_balance: { gte: amount } },
      data: { available_balance: { decrement: amount }, used_for_purchase: { increment: amount } },
    });
    if (claim.count === 0) throw new Error("Insufficient referral balance");

    const activeRewards = await tx.referral_rewards.findMany({
      where: { user_id: userId, status: { in: ["ACTIVE", "PARTIALLY_USED"] }, expires_at: { gt: new Date() } },
      orderBy: { expires_at: "asc" }, // FIFO: oldest expiry first
    });

    let remaining = amount;
    for (const reward of activeRewards) {
      if (remaining <= 0) break;
      const canUse = Math.min(parseFloat(reward.remaining_amount), remaining);
      if (canUse <= 0) continue;

      // Relative decrement on the locked row (never an absolute value computed from an earlier read).
      const updated = await tx.referral_rewards.update({
        where: { id: reward.id },
        data: { used_amount: { increment: canUse }, remaining_amount: { decrement: canUse } },
      });
      const newRemaining = parseFloat(updated.remaining_amount);
      if (newRemaining < 0) throw new Error("Insufficient referral balance");
      await tx.referral_rewards.update({
        where: { id: reward.id },
        data: { status: newRemaining <= 0 ? "FULLY_USED" : "PARTIALLY_USED" },
      });

      await tx.referral_reward_usages.create({
        data: {
          reward_id: reward.id,
          user_id: userId,
          amount_used: canUse,
          usage_type: "PURCHASE",
          order_id: orderId,
          order_number: orderNumber,
          reward_balance_after: newRemaining,
          note: `Used for order ${orderNumber}`,
        },
      });
      remaining = Math.round((remaining - canUse) * 100) / 100;
    }

    // Not enough unexpired rewards to cover the spend: roll everything back.
    if (remaining > 0) throw new Error("Insufficient referral balance");
  });

  return { success: true, amountUsed: amount };
};

// ============================================================================
// WITHDRAWAL
// ============================================================================

/**
 * Request a withdrawal
 */
export const requestWithdrawal = async (userId, amount, paymentMethod, paymentDetails) => {
  amount = Number(amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid withdrawal amount");
  amount = Math.round(amount * 100) / 100;

  const config = await getConfig();
  if (!config.withdrawal_enabled) throw new Error("Withdrawals are temporarily paused");

  const profile = await prisma.user_referral_profiles.findUnique({ where: { user_id: userId } });

  if (!profile) throw new Error("Referral profile not found");
  if (profile.is_blocked) throw new Error("Your referral account is blocked");
  if (amount < parseFloat(config.min_withdrawal_amount)) {
    throw new Error(`Minimum withdrawal amount is ₹${config.min_withdrawal_amount}`);
  }

  const startOfMonth = new Date();
  startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);

  // Lock balance. The atomic conditional decrement comes first: it locks the profile row, so concurrent requests
  // are serialized — each sees the previous one's debit and withdrawal count, and the balance can't go negative.
  const withdrawal = await prisma.$transaction(async (tx) => {
    const claim = await tx.user_referral_profiles.updateMany({
      where: { id: profile.id, is_blocked: false, available_balance: { gte: amount } },
      data: { available_balance: { decrement: amount } },
    });
    if (claim.count === 0) throw new Error("Insufficient balance");

    const monthlyCount = await tx.referral_withdrawals.count({
      where: { user_id: userId, created_at: { gte: startOfMonth }, status: { notIn: ["REJECTED", "CANCELLED"] } },
    });
    if (monthlyCount >= config.max_withdrawals_per_month) {
      throw new Error(`Maximum ${config.max_withdrawals_per_month} withdrawals per month`);
    }

    return tx.referral_withdrawals.create({
      data: {
        user_id: userId,
        user_profile_id: profile.id,
        requested_amount: amount,
        payment_method: paymentMethod,
        status: "PENDING",
        status_history: [{ status: "PENDING", timestamp: new Date() }],
        ...paymentDetails,
      },
    });
  });

  await createNotification(userId, "WITHDRAWAL_REQUESTED",
    { amount },
    { withdrawal_id: withdrawal.id });

  return withdrawal;
};

// ============================================================================
// CRON JOBS
// ============================================================================

/**
 * Process return window expirations (run hourly)
 */
export const processReturnWindowExpirations = async () => {
  const expired = await prisma.referral_transactions.findMany({
    where: {
      status: "RETURN_WINDOW_ACTIVE",
      return_window_ends_at: { lte: new Date() },
      is_returned: false,
    },
  });

  for (const tx of expired) {
    try {
      await processReturnWindowExpiry(tx.id);
    } catch (err) {
      console.error(`Error processing return window for transaction ${tx.id}:`, err);
    }
  }

  return { processed: expired.length };
};

/**
 * Process expired rewards (run daily at midnight)
 */
export const processExpiredRewards = async () => {
  const expiredRewards = await prisma.referral_rewards.findMany({
    where: {
      status: { in: ["ACTIVE", "PARTIALLY_USED"] },
      expires_at: { lte: new Date() },
    },
  });

  for (const reward of expiredRewards) {
    const expired = await prisma.$transaction(async (tx) => {
      // Atomic guard: an overlapping/repeated run matches 0 rows and must not debit the balance again.
      const guard = await tx.referral_rewards.updateMany({
        where: { id: reward.id, status: { in: ["ACTIVE", "PARTIALLY_USED"] } },
        data: { status: "EXPIRED", expired_at: new Date() },
      });
      if (guard.count === 0) return false;

      // Re-read under the row lock: a spend between the list query and here may have reduced remaining_amount.
      const fresh = await tx.referral_rewards.findUnique({ where: { id: reward.id }, select: { remaining_amount: true } });
      const remainingNow = parseFloat(fresh.remaining_amount);

      await tx.user_referral_profiles.update({
        where: { user_id: reward.user_id },
        data: {
          available_balance: { decrement: remainingNow },
          expired_amount: { increment: remainingNow },
        },
      });

      await tx.referral_reward_usages.create({
        data: {
          reward_id: reward.id,
          user_id: reward.user_id,
          amount_used: remainingNow,
          usage_type: "EXPIRY",
          reward_balance_after: 0,
          note: "Reward expired",
        },
      });
      return true;
    });
    if (!expired) continue;

    await createNotification(reward.user_id, "REWARD_EXPIRED",
      { amount: parseFloat(reward.original_amount) },
      { reward_id: reward.id });
  }

  return { processed: expiredRewards.length };
};

/**
 * Send expiry reminders (run daily at 9 AM)
 */
export const sendExpiryReminders = async () => {
  const config = await getConfig();
  const now = new Date();

  // 48-hour reminder
  const in48h = new Date(now.getTime() + 48 * 3600000);
  const rewards48h = await prisma.referral_rewards.findMany({
    where: {
      status: { in: ["ACTIVE", "PARTIALLY_USED"] },
      expires_at: { gte: now, lte: in48h },
      expiry_reminder_sent: false,
    },
  });

  for (const reward of rewards48h) {
    await createNotification(reward.user_id, "REWARD_EXPIRING_SOON",
      { amount: parseFloat(reward.remaining_amount) },
      { reward_id: reward.id });

    await prisma.referral_rewards.update({
      where: { id: reward.id },
      data: { expiry_reminder_sent: true, expiry_reminder_sent_at: new Date() },
    });
  }

  // 24-hour reminder
  const in24h = new Date(now.getTime() + 24 * 3600000);
  const rewards24h = await prisma.referral_rewards.findMany({
    where: {
      status: { in: ["ACTIVE", "PARTIALLY_USED"] },
      expires_at: { gte: now, lte: in24h },
      urgent_reminder_sent: false,
    },
  });

  for (const reward of rewards24h) {
    await createNotification(reward.user_id, "REWARD_EXPIRING_URGENT",
      { amount: parseFloat(reward.remaining_amount) },
      { reward_id: reward.id });

    await prisma.referral_rewards.update({
      where: { id: reward.id },
      data: { urgent_reminder_sent: true, urgent_reminder_sent_at: new Date() },
    });
  }

  return { reminders48h: rewards48h.length, reminders24h: rewards24h.length };
};

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get active referral config (or create default if none exists)
 */
export const getConfig = async () => {
  let config = await prisma.referral_configs.findFirst({ orderBy: { created_at: "asc" } });
  if (!config) {
    config = await prisma.referral_configs.create({ data: {} });
  }
  return config;
};

/**
 * Calculate reward amounts based on tier or flat config
 */
const calculateRewardAmounts = async (referrerProfile, orderAmount, config) => {
  let referrerAmount = parseFloat(config.referrer_reward_amount);
  const refereeAmount = parseFloat(config.referee_reward_amount);

  if (config.tiered_rewards_enabled && config.tiered_rewards_config) {
    const tiers = config.tiered_rewards_config.tiers || [];
    const successfulCount = referrerProfile.successful_referrals;
    for (const tier of tiers.sort((a, b) => b.minReferrals - a.minReferrals)) {
      if (successfulCount >= tier.minReferrals) {
        referrerAmount = tier.reward;
        break;
      }
    }
  }

  // Cap at max earning
  const currentEarnings = parseFloat(referrerProfile.total_earnings);
  const maxEarning = parseFloat(config.max_earning_per_user);
  if (currentEarnings + referrerAmount > maxEarning) {
    referrerAmount = Math.max(0, maxEarning - currentEarnings);
  }

  return { referrerAmount, refereeAmount };
};

// ============================================================================
// MEMBERSHIP (Q1-Q7) — status/display only, derived from the same tier ladder
// tiered_rewards_config already uses for the reward-amount bump (Q6: shared
// config, independent consumers — membership never touches reward calculation).
// ============================================================================

/**
 * Highest tier whose minReferrals threshold the count has reached, or null if the
 * ladder is empty/unconfigured or no tier's threshold is met yet.
 */
export const deriveTierName = (successfulReferrals, tiers) => {
  if (!Array.isArray(tiers) || tiers.length === 0) return null;
  const sorted = [...tiers].sort((a, b) => Number(a.minReferrals) - Number(b.minReferrals));
  let achieved = null;
  for (const t of sorted) {
    if (Number(successfulReferrals) >= Number(t.minReferrals)) achieved = t;
  }
  return achieved?.name || null;
};

/**
 * Position of a tier name in the ladder (higher = better). Unknown/null tiers rank
 * lowest (-1) so any real derived tier always outranks "no tier yet", and a tier name
 * that no longer exists in an edited ladder never blocks further progress upward.
 */
const tierRank = (tierName, tiers) => {
  if (!tierName || !Array.isArray(tiers)) return -1;
  const sorted = [...tiers].sort((a, b) => Number(a.minReferrals) - Number(b.minReferrals));
  return sorted.findIndex((t) => t.name === tierName);
};

/**
 * Membership progress for the referral dashboard — computed at read time, nothing
 * persisted beyond the already-stored current_tier (Q7: status/display only).
 */
export const getMembershipStatus = async (profile, config) => {
  const tiers = Array.isArray(config?.tiered_rewards_config?.tiers)
    ? [...config.tiered_rewards_config.tiers].sort((a, b) => Number(a.minReferrals) - Number(b.minReferrals))
    : [];
  const successfulReferrals = profile.successful_referrals;
  const currentTier = profile.current_tier;
  const currentRank = tierRank(currentTier, tiers);
  const next = tiers[currentRank + 1] || null;

  return {
    current_tier: currentTier,
    successful_referrals: successfulReferrals,
    next_tier: next?.name || null,
    next_tier_threshold: next ? Number(next.minReferrals) : null,
    referrals_to_next_tier: next ? Math.max(0, Number(next.minReferrals) - successfulReferrals) : null,
  };
};

/**
 * Create a referral notification. Title/message come from an admin-configured template when one
 * is active for this type, otherwise the hardcoded default — both rendered through the same
 * interpolation path (Q1). `variables` are the named values the copy can reference (e.g.
 * {amount, validity_days}); `data` is the existing separate metadata payload, unchanged.
 */
export const createNotification = async (userId, type, variables = {}, data = {}) => {
  try {
    const rendered = await renderNotification(type, variables);
    if (!rendered) {
      console.error(`Unknown notification type "${type}" — skipping`);
      return;
    }
    await prisma.referral_notifications.create({
      data: { user_id: userId, type, title: rendered.title, message: rendered.message, data, channels: ["in_app"] },
    });
  } catch (err) {
    console.error("Error creating referral notification:", err);
  }
};

/**
 * Log a fraud event. Shared across referral and affiliate (Q2, Marketing Control Center) via
 * the `program` discriminator — exported so affiliateService.js can log its own self-referral
 * block without a second fraud-log table. Already swallows its own errors, so a logging failure
 * can never turn a blocked (or valid) transaction into something else.
 */
export const logFraud = async (userId, referralCode, transactionId, fraudType, severity, description, ipAddress, userAgent, program = "REFERRAL") => {
  try {
    await prisma.referral_fraud_logs.create({
      data: {
        program,
        user_id: userId,
        referral_code: referralCode,
        referral_transaction_id: transactionId,
        fraud_type: fraudType,
        severity,
        description,
        ip_address: ipAddress,
        user_agent: userAgent,
        detected_by: "SYSTEM",
      },
    });
  } catch (err) {
    console.error("Error logging fraud:", err);
  }
};

// Shared list/review for the admin fraud-log pages (referral + affiliate) — the two admin
// controllers only differ in which `program` they're scoped to, so that logic lives here once.
export const listFraudLogsByProgram = async (program, { page = 1, limit = 20, status, severity } = {}) => {
  // Non-numeric / non-positive input falls back to defaults; limit is capped so one request can't pull the whole table.
  page = Math.max(1, parseInt(page) || 1);
  limit = Math.min(100, Math.max(1, parseInt(limit) || 20));
  const offset = (page - 1) * limit;
  // `program` omitted = every program (unified Fraud & Risk page).
  const where = program ? { program } : {};
  if (status) where.status = status;
  if (severity) where.severity = severity;

  const [logs, total] = await Promise.all([
    prisma.referral_fraud_logs.findMany({ where, orderBy: { created_at: "desc" }, skip: offset, take: parseInt(limit) }),
    prisma.referral_fraud_logs.count({ where }),
  ]);

  return { logs, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) } };
};

export const reviewFraudLogEntry = async (id, { status, notes, action, reviewerId }) => {
  return prisma.referral_fraud_logs.update({
    where: { id },
    data: {
      status,
      reviewed_by: reviewerId,
      reviewed_at: new Date(),
      review_notes: notes,
      action_taken: action,
      action_taken_by: reviewerId,
      action_taken_at: new Date(),
    },
  });
};

/**
 * Log an admin action
 */
export const logAdminAction = async (adminId, adminEmail, adminName, action, description, entityType, entityId, previousValue, newValue, ipAddress) => {
  try {
    await prisma.referral_admin_logs.create({
      data: {
        admin_id: adminId,
        admin_email: adminEmail,
        admin_name: adminName,
        action,
        action_description: description,
        entity_type: entityType,
        entity_id: entityId,
        previous_value: previousValue,
        new_value: newValue,
        ip_address: ipAddress,
      },
    });
  } catch (err) {
    console.error("Error logging admin action:", err);
  }
};
