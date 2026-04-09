// controller/adminReferralController.js
import prisma from "../config/prisma.js";
import * as referralService from "../services/referralService.js";

// ============================================================================
// DASHBOARD
// ============================================================================

export const getDashboard = async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    const [
      totalUsers,
      totalTransactions,
      completedThisMonth,
      completedLastMonth,
      pendingWithdrawals,
      totalRewardsCredited,
      totalWithdrawn,
      recentTransactions,
    ] = await Promise.all([
      prisma.user_referral_profiles.count(),
      prisma.referral_transactions.count(),
      prisma.referral_transactions.count({ where: { status: "COMPLETED", created_at: { gte: startOfMonth } } }),
      prisma.referral_transactions.count({ where: { status: "COMPLETED", created_at: { gte: startOfLastMonth, lte: endOfLastMonth } } }),
      prisma.referral_withdrawals.count({ where: { status: "PENDING" } }),
      prisma.referral_rewards.aggregate({ _sum: { original_amount: true } }),
      prisma.referral_withdrawals.aggregate({ _sum: { processed_amount: true }, where: { status: "COMPLETED" } }),
      prisma.referral_transactions.findMany({
        orderBy: { created_at: "desc" },
        take: 10,
        select: { id: true, referee_name: true, referee_phone: true, referral_code_used: true, status: true, created_at: true, referrer_reward_amount: true },
      }),
    ]);

    res.json({
      success: true,
      dashboard: {
        total_users: totalUsers,
        total_transactions: totalTransactions,
        completed_this_month: completedThisMonth,
        completed_last_month: completedLastMonth,
        growth_rate: completedLastMonth > 0 ? (((completedThisMonth - completedLastMonth) / completedLastMonth) * 100).toFixed(1) : null,
        pending_withdrawals: pendingWithdrawals,
        total_rewards_credited: parseFloat(totalRewardsCredited._sum.original_amount || 0),
        total_withdrawn: parseFloat(totalWithdrawn._sum.processed_amount || 0),
        recent_transactions: recentTransactions,
      },
    });
  } catch (error) {
    console.error("Error in getDashboard:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const getAnalytics = async (req, res) => {
  try {
    const { period = "30" } = req.query;
    const days = parseInt(period);
    const since = new Date(Date.now() - days * 24 * 3600000);

    const [statusBreakdown, dailySignups, topReferrers] = await Promise.all([
      prisma.referral_transactions.groupBy({
        by: ["status"],
        _count: { id: true },
        where: { created_at: { gte: since } },
      }),
      prisma.referral_transactions.groupBy({
        by: ["created_at"],
        _count: { id: true },
        where: { created_at: { gte: since } },
        orderBy: { created_at: "asc" },
      }),
      prisma.user_referral_profiles.findMany({
        where: { successful_referrals: { gt: 0 } },
        orderBy: { successful_referrals: "desc" },
        take: 10,
        select: { user_id: true, referral_code: true, successful_referrals: true, total_earnings: true },
      }),
    ]);

    res.json({
      success: true,
      analytics: { status_breakdown: statusBreakdown, daily_signups: dailySignups, top_referrers: topReferrers },
    });
  } catch (error) {
    console.error("Error in getAnalytics:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ============================================================================
// CONFIG
// ============================================================================

export const getConfig = async (req, res) => {
  try {
    const config = await referralService.getConfig();
    res.json({ success: true, config });
  } catch (error) {
    console.error("Error in getConfig:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const updateConfig = async (req, res) => {
  try {
    const { user } = req;
    let config = await prisma.referral_configs.findFirst();

    const updateData = { ...req.body, updated_by: user.id, updated_at: new Date() };
    delete updateData.id; // Don't allow ID update

    if (config) {
      config = await prisma.referral_configs.update({ where: { id: config.id }, data: updateData });
    } else {
      config = await prisma.referral_configs.create({ data: { ...updateData, created_by: user.id } });
    }

    await referralService.logAdminAction(user.id, user.email, user.name,
      "CONFIG_UPDATED", "Updated referral configuration", "config", config.id, null, updateData, req.ip);

    res.json({ success: true, message: "Configuration updated", config });
  } catch (error) {
    console.error("Error in updateConfig:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ============================================================================
// USER MANAGEMENT
// ============================================================================

export const listUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status, sort = "created_at" } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { referral_code: { contains: search, mode: "insensitive" } },
        { referred_by_code: { contains: search, mode: "insensitive" } },
      ];
    }

    const [profiles, total] = await Promise.all([
      prisma.user_referral_profiles.findMany({
        where,
        orderBy: { [sort]: "desc" },
        skip: offset,
        take: parseInt(limit),
      }),
      prisma.user_referral_profiles.count({ where }),
    ]);

    // Fetch user info for each profile
    const userIds = profiles.map(p => p.user_id);
    const users = await prisma.users.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true, phone: true },
    });
    const userMap = Object.fromEntries(users.map(u => [u.id, u]));

    const enriched = profiles.map(p => ({ ...p, user: userMap[p.user_id] || null }));

    res.json({
      success: true,
      users: enriched,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    console.error("Error in listUsers:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const getUserDetail = async (req, res) => {
  try {
    const { id } = req.params;

    const profile = await prisma.user_referral_profiles.findFirst({
      where: { OR: [{ id }, { user_id: id }] },
      include: {
        referral_transactions: { orderBy: { created_at: "desc" }, take: 5 },
        referral_rewards: { orderBy: { created_at: "desc" }, take: 5 },
        referral_withdrawals: { orderBy: { created_at: "desc" }, take: 5 },
      },
    });

    if (!profile) return res.status(404).json({ success: false, error: "User referral profile not found" });

    const user = await prisma.users.findUnique({
      where: { id: profile.user_id },
      select: { id: true, name: true, email: true, phone: true, created_at: true },
    });

    res.json({ success: true, profile, user });
  } catch (error) {
    console.error("Error in getUserDetail:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const blockUser = async (req, res) => {
  try {
    const { user } = req;
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) return res.status(400).json({ success: false, error: "reason is required" });

    const profile = await prisma.user_referral_profiles.findFirst({ where: { OR: [{ id }, { user_id: id }] } });
    if (!profile) return res.status(404).json({ success: false, error: "Profile not found" });

    await prisma.user_referral_profiles.update({
      where: { id: profile.id },
      data: { is_blocked: true, block_reason: reason, blocked_at: new Date(), blocked_by: user.id, status: "BLOCKED" },
    });

    await referralService.logAdminAction(user.id, user.email, user.name,
      "USER_BLOCKED", `Blocked user referral account: ${reason}`, "user", profile.user_id, { is_blocked: false }, { is_blocked: true, reason }, req.ip);

    res.json({ success: true, message: "User blocked from referral program" });
  } catch (error) {
    console.error("Error in blockUser:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const unblockUser = async (req, res) => {
  try {
    const { user } = req;
    const { id } = req.params;

    const profile = await prisma.user_referral_profiles.findFirst({ where: { OR: [{ id }, { user_id: id }] } });
    if (!profile) return res.status(404).json({ success: false, error: "Profile not found" });

    await prisma.user_referral_profiles.update({
      where: { id: profile.id },
      data: { is_blocked: false, block_reason: null, status: "ACTIVE" },
    });

    await referralService.logAdminAction(user.id, user.email, user.name,
      "USER_UNBLOCKED", "Unblocked user referral account", "user", profile.user_id, { is_blocked: true }, { is_blocked: false }, req.ip);

    res.json({ success: true, message: "User unblocked" });
  } catch (error) {
    console.error("Error in unblockUser:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const deactivateCode = async (req, res) => {
  try {
    const { user } = req;
    const { id } = req.params;

    const profile = await prisma.user_referral_profiles.findFirst({ where: { OR: [{ id }, { user_id: id }] } });
    if (!profile) return res.status(404).json({ success: false, error: "Profile not found" });

    await prisma.user_referral_profiles.update({ where: { id: profile.id }, data: { referral_code_active: false } });
    await referralService.logAdminAction(user.id, user.email, user.name,
      "USER_CODE_DEACTIVATED", "Deactivated referral code", "user", profile.user_id, null, null, req.ip);

    res.json({ success: true, message: "Referral code deactivated" });
  } catch (error) {
    console.error("Error in deactivateCode:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const reactivateCode = async (req, res) => {
  try {
    const { user } = req;
    const { id } = req.params;

    const profile = await prisma.user_referral_profiles.findFirst({ where: { OR: [{ id }, { user_id: id }] } });
    if (!profile) return res.status(404).json({ success: false, error: "Profile not found" });

    await prisma.user_referral_profiles.update({ where: { id: profile.id }, data: { referral_code_active: true } });
    await referralService.logAdminAction(user.id, user.email, user.name,
      "USER_CODE_REACTIVATED", "Reactivated referral code", "user", profile.user_id, null, null, req.ip);

    res.json({ success: true, message: "Referral code reactivated" });
  } catch (error) {
    console.error("Error in reactivateCode:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ============================================================================
// TRANSACTIONS
// ============================================================================

export const listTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { referral_code_used: { contains: search, mode: "insensitive" } },
        { referee_name: { contains: search, mode: "insensitive" } },
        { referee_phone: { contains: search, mode: "insensitive" } },
        { referee_email: { contains: search, mode: "insensitive" } },
        { order_number: { contains: search, mode: "insensitive" } },
      ];
    }

    const [transactions, total] = await Promise.all([
      prisma.referral_transactions.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: offset,
        take: parseInt(limit),
      }),
      prisma.referral_transactions.count({ where }),
    ]);

    res.json({
      success: true,
      transactions,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    console.error("Error in listTransactions:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const getTransactionDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const transaction = await prisma.referral_transactions.findUnique({ where: { id } });
    if (!transaction) return res.status(404).json({ success: false, error: "Transaction not found" });
    res.json({ success: true, transaction });
  } catch (error) {
    console.error("Error in getTransactionDetail:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ============================================================================
// REWARDS
// ============================================================================

export const listRewards = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, user_id } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (status) where.status = status;
    if (user_id) where.user_id = user_id;

    const [rewards, total] = await Promise.all([
      prisma.referral_rewards.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: offset,
        take: parseInt(limit),
      }),
      prisma.referral_rewards.count({ where }),
    ]);

    res.json({
      success: true,
      rewards,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    console.error("Error in listRewards:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const manualCreditReward = async (req, res) => {
  try {
    const { user } = req;
    const { user_id, amount, reason, validity_days = 7 } = req.body;

    if (!user_id || !amount || !reason) {
      return res.status(400).json({ success: false, error: "user_id, amount, and reason are required" });
    }

    const config = await referralService.getConfig();
    const profile = await referralService.getOrCreateReferralProfile(user_id, "User");

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + parseInt(validity_days));

    const reward = await prisma.$transaction(async (tx) => {
      const r = await tx.referral_rewards.create({
        data: {
          user_id,
          user_profile_id: profile.id,
          amount: parseFloat(amount),
          original_amount: parseFloat(amount),
          remaining_amount: parseFloat(amount),
          reward_type: "ADMIN_CREDIT",
          source_type: "ADMIN_CREDIT",
          source_description: reason,
          expires_at: expiresAt,
          status: "ACTIVE",
        },
      });

      await tx.user_referral_profiles.update({
        where: { id: profile.id },
        data: {
          available_balance: { increment: parseFloat(amount) },
          total_earnings: { increment: parseFloat(amount) },
        },
      });

      return r;
    });

    await referralService.logAdminAction(user.id, user.email, user.name,
      "REWARD_CREDITED_MANUALLY", `Manually credited ₹${amount}: ${reason}`, "reward", reward.id, null, { amount, reason }, req.ip);

    await referralService.createNotification(user_id, "ADMIN_CREDIT_RECEIVED",
      "Reward Credited!",
      `₹${amount} has been credited to your referral wallet. Valid for ${validity_days} days.`,
      { reward_id: reward.id });

    res.json({ success: true, message: "Reward credited", reward });
  } catch (error) {
    console.error("Error in manualCreditReward:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const extendRewardExpiry = async (req, res) => {
  try {
    const { user } = req;
    const { id } = req.params;
    const { days, reason } = req.body;

    if (!days || !reason) return res.status(400).json({ success: false, error: "days and reason are required" });

    const reward = await prisma.referral_rewards.findUnique({ where: { id } });
    if (!reward) return res.status(404).json({ success: false, error: "Reward not found" });

    const newExpiry = new Date(reward.expires_at);
    newExpiry.setDate(newExpiry.getDate() + parseInt(days));

    await prisma.referral_rewards.update({
      where: { id },
      data: {
        expires_at: newExpiry,
        is_extended: true,
        extended_by: user.id,
        extended_at: new Date(),
        previous_expiry_date: reward.expires_at,
        extension_reason: reason,
      },
    });

    await referralService.logAdminAction(user.id, user.email, user.name,
      "REWARD_EXPIRY_EXTENDED", `Extended reward expiry by ${days} days: ${reason}`, "reward", id, { expires_at: reward.expires_at }, { expires_at: newExpiry }, req.ip);

    res.json({ success: true, message: "Reward expiry extended", new_expiry: newExpiry });
  } catch (error) {
    console.error("Error in extendRewardExpiry:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const cancelReward = async (req, res) => {
  try {
    const { user } = req;
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) return res.status(400).json({ success: false, error: "reason is required" });

    const reward = await prisma.referral_rewards.findUnique({ where: { id } });
    if (!reward) return res.status(404).json({ success: false, error: "Reward not found" });

    await prisma.$transaction(async (tx) => {
      await tx.referral_rewards.update({
        where: { id },
        data: { status: "CANCELLED", is_cancelled: true, cancelled_by: user.id, cancelled_at: new Date(), cancellation_reason: reason },
      });

      // Deduct from available balance if still active
      if (["ACTIVE", "PARTIALLY_USED"].includes(reward.status)) {
        await tx.user_referral_profiles.update({
          where: { user_id: reward.user_id },
          data: { available_balance: { decrement: parseFloat(reward.remaining_amount) } },
        });
      }
    });

    await referralService.logAdminAction(user.id, user.email, user.name,
      "REWARD_CANCELLED", `Cancelled reward: ${reason}`, "reward", id, { status: reward.status }, { status: "CANCELLED" }, req.ip);

    res.json({ success: true, message: "Reward cancelled" });
  } catch (error) {
    console.error("Error in cancelReward:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ============================================================================
// WITHDRAWALS
// ============================================================================

export const listWithdrawals = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (status) where.status = status;

    const [withdrawals, total] = await Promise.all([
      prisma.referral_withdrawals.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: offset,
        take: parseInt(limit),
      }),
      prisma.referral_withdrawals.count({ where }),
    ]);

    // Enrich with user info
    const userIds = [...new Set(withdrawals.map(w => w.user_id))];
    const users = await prisma.users.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true },
    });
    const userMap = Object.fromEntries(users.map(u => [u.id, u]));
    const enriched = withdrawals.map(w => ({ ...w, user: userMap[w.user_id] || null }));

    res.json({
      success: true,
      withdrawals: enriched,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    console.error("Error in listWithdrawals:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const approveWithdrawal = async (req, res) => {
  try {
    const { user } = req;
    const { id } = req.params;
    const { notes } = req.body;

    const withdrawal = await prisma.referral_withdrawals.findUnique({ where: { id } });
    if (!withdrawal) return res.status(404).json({ success: false, error: "Withdrawal not found" });
    if (withdrawal.status !== "PENDING") return res.status(400).json({ success: false, error: "Can only approve PENDING withdrawals" });

    const history = Array.isArray(withdrawal.status_history) ? withdrawal.status_history : [];
    await prisma.referral_withdrawals.update({
      where: { id },
      data: {
        status: "APPROVED",
        admin_notes: notes,
        processed_by: user.id,
        status_history: [...history, { status: "APPROVED", timestamp: new Date(), by: user.id }],
      },
    });

    await referralService.logAdminAction(user.id, user.email, user.name,
      "WITHDRAWAL_APPROVED", `Approved withdrawal of ₹${withdrawal.requested_amount}`, "withdrawal", id, { status: "PENDING" }, { status: "APPROVED" }, req.ip);

    res.json({ success: true, message: "Withdrawal approved" });
  } catch (error) {
    console.error("Error in approveWithdrawal:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const rejectWithdrawal = async (req, res) => {
  try {
    const { user } = req;
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) return res.status(400).json({ success: false, error: "reason is required" });

    const withdrawal = await prisma.referral_withdrawals.findUnique({ where: { id } });
    if (!withdrawal) return res.status(404).json({ success: false, error: "Withdrawal not found" });

    await prisma.$transaction(async (tx) => {
      const history = Array.isArray(withdrawal.status_history) ? withdrawal.status_history : [];
      await tx.referral_withdrawals.update({
        where: { id },
        data: {
          status: "REJECTED",
          rejection_reason: reason,
          rejected_by: user.id,
          rejected_at: new Date(),
          status_history: [...history, { status: "REJECTED", timestamp: new Date(), reason }],
        },
      });

      // Re-credit balance to user
      await tx.user_referral_profiles.update({
        where: { user_id: withdrawal.user_id },
        data: { available_balance: { increment: parseFloat(withdrawal.requested_amount) } },
      });
    });

    await referralService.createNotification(withdrawal.user_id, "WITHDRAWAL_REJECTED",
      "Withdrawal Rejected",
      `Your withdrawal request of ₹${withdrawal.requested_amount} was rejected. Reason: ${reason}`,
      { withdrawal_id: id });

    await referralService.logAdminAction(user.id, user.email, user.name,
      "WITHDRAWAL_REJECTED", `Rejected withdrawal: ${reason}`, "withdrawal", id, { status: "PENDING" }, { status: "REJECTED" }, req.ip);

    res.json({ success: true, message: "Withdrawal rejected and balance restored" });
  } catch (error) {
    console.error("Error in rejectWithdrawal:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const processWithdrawal = async (req, res) => {
  try {
    const { user } = req;
    const { id } = req.params;
    const { transaction_id, payment_gateway_ref, processed_amount } = req.body;

    const withdrawal = await prisma.referral_withdrawals.findUnique({ where: { id } });
    if (!withdrawal) return res.status(404).json({ success: false, error: "Withdrawal not found" });
    if (!["APPROVED", "PROCESSING"].includes(withdrawal.status)) {
      return res.status(400).json({ success: false, error: "Withdrawal must be APPROVED before processing" });
    }

    const history = Array.isArray(withdrawal.status_history) ? withdrawal.status_history : [];
    await prisma.$transaction(async (tx) => {
      await tx.referral_withdrawals.update({
        where: { id },
        data: {
          status: "COMPLETED",
          processed_amount: processed_amount || withdrawal.requested_amount,
          processed_at: new Date(),
          processed_by: user.id,
          transaction_id,
          payment_gateway_ref,
          status_history: [...history, { status: "COMPLETED", timestamp: new Date() }],
        },
      });

      await tx.user_referral_profiles.update({
        where: { user_id: withdrawal.user_id },
        data: { withdrawn_amount: { increment: parseFloat(withdrawal.requested_amount) } },
      });
    });

    await referralService.createNotification(withdrawal.user_id, "WITHDRAWAL_COMPLETED",
      "Withdrawal Successful",
      `₹${withdrawal.requested_amount} has been transferred to your account.`,
      { withdrawal_id: id });

    await referralService.logAdminAction(user.id, user.email, user.name,
      "WITHDRAWAL_PROCESSED", `Processed withdrawal of ₹${withdrawal.requested_amount}`, "withdrawal", id, null, null, req.ip);

    res.json({ success: true, message: "Withdrawal processed successfully" });
  } catch (error) {
    console.error("Error in processWithdrawal:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ============================================================================
// FRAUD LOGS
// ============================================================================

export const listFraudLogs = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, severity } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (status) where.status = status;
    if (severity) where.severity = severity;

    const [logs, total] = await Promise.all([
      prisma.referral_fraud_logs.findMany({ where, orderBy: { created_at: "desc" }, skip: offset, take: parseInt(limit) }),
      prisma.referral_fraud_logs.count({ where }),
    ]);

    res.json({
      success: true,
      logs,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    console.error("Error in listFraudLogs:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const reviewFraudLog = async (req, res) => {
  try {
    const { user } = req;
    const { id } = req.params;
    const { status, notes, action } = req.body;

    await prisma.referral_fraud_logs.update({
      where: { id },
      data: {
        status,
        reviewed_by: user.id,
        reviewed_at: new Date(),
        review_notes: notes,
        action_taken: action,
        action_taken_by: user.id,
        action_taken_at: new Date(),
      },
    });

    res.json({ success: true, message: "Fraud log reviewed" });
  } catch (error) {
    console.error("Error in reviewFraudLog:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ============================================================================
// ACTIVITY LOGS
// ============================================================================

export const listActivityLogs = async (req, res) => {
  try {
    const { page = 1, limit = 20, action } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (action) where.action = action;

    const [logs, total] = await Promise.all([
      prisma.referral_admin_logs.findMany({ where, orderBy: { created_at: "desc" }, skip: offset, take: parseInt(limit) }),
      prisma.referral_admin_logs.count({ where }),
    ]);

    res.json({
      success: true,
      logs,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    console.error("Error in listActivityLogs:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ============================================================================
// REPORTS
// ============================================================================

export const exportReport = async (req, res) => {
  try {
    const { type = "transactions", from, to } = req.query;
    const where = {};
    if (from) where.created_at = { ...where.created_at, gte: new Date(from) };
    if (to) where.created_at = { ...where.created_at, lte: new Date(to) };

    let data;
    if (type === "transactions") {
      data = await prisma.referral_transactions.findMany({ where, orderBy: { created_at: "desc" } });
    } else if (type === "rewards") {
      data = await prisma.referral_rewards.findMany({ where, orderBy: { created_at: "desc" } });
    } else if (type === "withdrawals") {
      data = await prisma.referral_withdrawals.findMany({ where, orderBy: { created_at: "desc" } });
    } else {
      data = await prisma.user_referral_profiles.findMany({ orderBy: { created_at: "desc" } });
    }

    res.json({ success: true, data, count: data.length, type });
  } catch (error) {
    console.error("Error in exportReport:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ============================================================================
// CAMPAIGNS
// ============================================================================

export const listCampaigns = async (req, res) => {
  try {
    const { page = 1, limit = 20, active } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (active !== undefined) where.is_active = active === "true";

    const [campaigns, total] = await Promise.all([
      prisma.referral_campaigns.findMany({ where, orderBy: { created_at: "desc" }, skip: offset, take: parseInt(limit) }),
      prisma.referral_campaigns.count({ where }),
    ]);

    res.json({
      success: true,
      campaigns,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    console.error("Error in listCampaigns:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const createCampaign = async (req, res) => {
  try {
    const { user } = req;
    const campaign = await prisma.referral_campaigns.create({
      data: { ...req.body, created_by: user.id },
    });
    res.status(201).json({ success: true, campaign });
  } catch (error) {
    console.error("Error in createCampaign:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updateCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const data = { ...req.body, updated_at: new Date() };
    delete data.id;

    const campaign = await prisma.referral_campaigns.update({ where: { id }, data });
    res.json({ success: true, campaign });
  } catch (error) {
    console.error("Error in updateCampaign:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const deleteCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.referral_campaigns.update({ where: { id }, data: { is_active: false } }); // Soft delete
    res.json({ success: true, message: "Campaign deactivated" });
  } catch (error) {
    console.error("Error in deleteCampaign:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};
