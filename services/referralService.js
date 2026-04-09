// services/referralService.js
import prisma from "../config/prisma.js";

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

/**
 * Get referral profile with stats for user
 */
export const getReferralProfile = async (userId) => {
  const profile = await prisma.user_referral_profiles.findUnique({
    where: { user_id: userId },
  });
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
  const config = await getConfig();
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

  // Create referral transaction
  const transaction = await prisma.referral_transactions.create({
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

  // Update or create referee's referral profile
  await prisma.user_referral_profiles.upsert({
    where: { user_id: refereeId },
    update: {
      was_referred: true,
      referred_by_user_id: referrerProfile.user_id,
      referred_by_code: referralCode.toUpperCase(),
      referred_at: new Date(),
    },
    create: {
      user_id: refereeId,
      referral_code: await generateReferralCode(refereeData.phone || refereeData.name),
      was_referred: true,
      referred_by_user_id: referrerProfile.user_id,
      referred_by_code: referralCode.toUpperCase(),
      referred_at: new Date(),
    },
  });

  // Increment referrer's pending count
  await prisma.user_referral_profiles.update({
    where: { id: referrerProfile.id },
    data: { total_referrals: { increment: 1 }, pending_referrals: { increment: 1 } },
  });

  // Send notification to referrer
  await createNotification(referrerProfile.user_id, "REFERRAL_SIGNUP",
    "New Referral!",
    `${refereeData.name || "Someone"} joined using your referral code!`,
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

  // Update transaction with order details
  const history = Array.isArray(referralTx.status_history) ? referralTx.status_history : [];
  await prisma.referral_transactions.update({
    where: { id: referralTx.id },
    data: {
      status: "ORDER_PLACED",
      order_id: orderId,
      order_number: orderNumber,
      order_amount: orderAmount,
      order_date: new Date(),
      status_history: [...history, { status: "ORDER_PLACED", timestamp: new Date(), note: `Order ${orderNumber} placed` }],
    },
  });

  // Notify referrer
  await createNotification(referralTx.referrer_id, "REFERRAL_ORDER_PLACED",
    "Order Placed",
    "Your referee placed an order! Reward pending after delivery.",
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
  await prisma.referral_transactions.update({
    where: { id: referralTx.id },
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

  await createNotification(referralTx.referrer_id, "REFERRAL_ORDER_DELIVERED",
    "Order Delivered",
    "Order delivered! Your reward will be credited after the return window.",
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

  // Calculate reward amounts (tiered or flat)
  const { referrerAmount, refereeAmount } = await calculateRewardAmounts(
    referralTx.referrer_profile,
    referralTx.order_amount,
    config
  );

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + config.reward_validity_days);

  // Use a transaction for atomicity
  const [referrerReward, refereeReward] = await prisma.$transaction(async (tx) => {
    // Credit referrer reward
    const rr = await tx.referral_rewards.create({
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
    });

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

    // Update referrer profile balance and stats
    await tx.user_referral_profiles.update({
      where: { id: referralTx.referrer_profile_id },
      data: {
        available_balance: { increment: referrerAmount },
        total_earnings: { increment: referrerAmount },
        pending_referrals: { decrement: 1 },
        successful_referrals: { increment: 1 },
      },
    });

    // Update referral transaction
    const history = Array.isArray(referralTx.status_history) ? referralTx.status_history : [];
    await tx.referral_transactions.update({
      where: { id: referralTx.id },
      data: {
        status: "COMPLETED",
        referrer_reward_amount: referrerAmount,
        referee_reward_amount: refereeAmount,
        referrer_reward_id: rr.id,
        referee_reward_id: re?.id,
        reward_credited_at: new Date(),
        status_history: [...history, { status: "COMPLETED", timestamp: new Date(), note: "Rewards credited" }],
      },
    });

    return [rr, re];
  });

  // Send notifications
  await createNotification(referralTx.referrer_id, "REWARD_CREDITED",
    "Reward Credited!",
    `₹${referrerAmount} has been credited to your wallet! Valid for ${config.reward_validity_days} days.`,
    { reward_id: referrerReward.id, amount: referrerAmount });

  if (refereeReward) {
    await createNotification(referralTx.referee_id, "REWARD_CREDITED",
      "Reward Credited!",
      `₹${refereeAmount} has been credited to your wallet! Valid for ${config.reward_validity_days} days.`,
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
    // Full return: mark as failed
    await prisma.referral_transactions.update({
      where: { id: referralTx.id },
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

    await prisma.user_referral_profiles.update({
      where: { id: referralTx.referrer_profile_id },
      data: { pending_referrals: { decrement: 1 }, failed_referrals: { increment: 1 } },
    });
  } else if (returnType === "PARTIAL") {
    // Partial return: reduce order amount, let return window continue
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

  return {
    available: parseFloat(profile.available_balance),
    pending: parseFloat(profile.pending_balance),
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
  const profile = await prisma.user_referral_profiles.findUnique({
    where: { user_id: userId },
  });

  if (!profile) throw new Error("Referral profile not found");
  if (parseFloat(profile.available_balance) < amount) throw new Error("Insufficient referral balance");

  const now = new Date();
  const activeRewards = await prisma.referral_rewards.findMany({
    where: {
      user_id: userId,
      status: { in: ["ACTIVE", "PARTIALLY_USED"] },
      expires_at: { gt: now },
    },
    orderBy: { expires_at: "asc" }, // FIFO: oldest expiry first
  });

  let remaining = parseFloat(amount);
  const usages = [];

  for (const reward of activeRewards) {
    if (remaining <= 0) break;
    const canUse = Math.min(parseFloat(reward.remaining_amount), remaining);
    if (canUse <= 0) continue;

    const newRemaining = parseFloat(reward.remaining_amount) - canUse;
    usages.push({ reward, canUse, newRemaining });
    remaining -= canUse;
  }

  if (remaining > 0) throw new Error("Insufficient referral balance");

  await prisma.$transaction(async (tx) => {
    for (const { reward, canUse, newRemaining } of usages) {
      const newStatus = newRemaining <= 0 ? "FULLY_USED" : "PARTIALLY_USED";
      await tx.referral_rewards.update({
        where: { id: reward.id },
        data: {
          used_amount: { increment: canUse },
          remaining_amount: newRemaining,
          status: newStatus,
        },
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
    }

    await tx.user_referral_profiles.update({
      where: { user_id: userId },
      data: {
        available_balance: { decrement: amount },
        used_for_purchase: { increment: amount },
      },
    });
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
  const config = await getConfig();
  const profile = await prisma.user_referral_profiles.findUnique({ where: { user_id: userId } });

  if (!profile) throw new Error("Referral profile not found");
  if (profile.is_blocked) throw new Error("Your referral account is blocked");
  if (parseFloat(amount) < parseFloat(config.min_withdrawal_amount)) {
    throw new Error(`Minimum withdrawal amount is ₹${config.min_withdrawal_amount}`);
  }
  if (parseFloat(profile.available_balance) < parseFloat(amount)) {
    throw new Error("Insufficient balance");
  }

  // Check monthly withdrawal limit
  const startOfMonth = new Date();
  startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
  const monthlyCount = await prisma.referral_withdrawals.count({
    where: { user_id: userId, created_at: { gte: startOfMonth }, status: { notIn: ["REJECTED", "CANCELLED"] } },
  });
  if (monthlyCount >= config.max_withdrawals_per_month) {
    throw new Error(`Maximum ${config.max_withdrawals_per_month} withdrawals per month`);
  }

  // Lock balance
  const withdrawal = await prisma.$transaction(async (tx) => {
    const w = await tx.referral_withdrawals.create({
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

    await tx.user_referral_profiles.update({
      where: { id: profile.id },
      data: { available_balance: { decrement: amount } },
    });

    return w;
  });

  await createNotification(userId, "WITHDRAWAL_REQUESTED",
    "Withdrawal Initiated",
    `Withdrawal of ₹${amount} has been initiated.`,
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
    await prisma.$transaction(async (tx) => {
      await tx.referral_rewards.update({
        where: { id: reward.id },
        data: { status: "EXPIRED", expired_at: new Date() },
      });

      await tx.user_referral_profiles.update({
        where: { user_id: reward.user_id },
        data: {
          available_balance: { decrement: parseFloat(reward.remaining_amount) },
          expired_amount: { increment: parseFloat(reward.remaining_amount) },
        },
      });

      await tx.referral_reward_usages.create({
        data: {
          reward_id: reward.id,
          user_id: reward.user_id,
          amount_used: parseFloat(reward.remaining_amount),
          usage_type: "EXPIRY",
          reward_balance_after: 0,
          note: "Reward expired",
        },
      });
    });

    await createNotification(reward.user_id, "REWARD_EXPIRED",
      "Reward Expired",
      `Your ₹${parseFloat(reward.original_amount)} reward has expired. Keep referring to earn more!`,
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
      "Reward Expiring Soon",
      `Your ₹${parseFloat(reward.remaining_amount)} reward expires in 2 days! Use or withdraw now.`,
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
      "Last Chance!",
      `Your ₹${parseFloat(reward.remaining_amount)} reward expires tomorrow! Don't miss out.`,
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

/**
 * Create a referral notification
 */
export const createNotification = async (userId, type, title, message, data = {}) => {
  try {
    await prisma.referral_notifications.create({
      data: { user_id: userId, type, title, message, data, channels: ["in_app"] },
    });
  } catch (err) {
    console.error("Error creating referral notification:", err);
  }
};

/**
 * Log a fraud event
 */
const logFraud = async (userId, referralCode, transactionId, fraudType, severity, description, ipAddress, userAgent) => {
  try {
    await prisma.referral_fraud_logs.create({
      data: {
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
