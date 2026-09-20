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

    const [statusBreakdown, dailySignups, topReferrers, tierDistribution] = await Promise.all([
      prisma.referral_transactions.groupBy({
        by: ["status"],
        _count: { id: true },
        where: { created_at: { gte: since } },
      }),
      // Real calendar-day bucketing in Asia/Kolkata (the app's business timezone — matches the
      // en-IN date formatting already used across the admin panel), aggregated in Postgres rather
      // than fetching raw rows. The previous groupBy(by:["created_at"]) grouped by exact
      // millisecond, not by day — fetched by the frontend but never actually rendered, so the
      // bug was silent until this phase built a real chart against it.
      prisma.$queryRaw`
        SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date AS day, COUNT(*)::int AS count
        FROM referral_transactions
        WHERE created_at >= ${since}
        GROUP BY day
        ORDER BY day ASC
      `,
      prisma.user_referral_profiles.findMany({
        where: { successful_referrals: { gt: 0 } },
        orderBy: { successful_referrals: "desc" },
        take: 10,
        select: { user_id: true, referral_code: true, successful_referrals: true, total_earnings: true },
      }),
      // Membership tier distribution (Analytics Q2) — how many users sit at each achieved tier.
      prisma.user_referral_profiles.groupBy({
        by: ["current_tier"],
        _count: { id: true },
      }),
    ]);

    res.json({
      success: true,
      analytics: {
        status_breakdown: statusBreakdown,
        daily_signups: dailySignups,
        top_referrers: topReferrers,
        tier_distribution: tierDistribution.map((t) => ({ tier: t.current_tier || "No tier", count: t._count.id })),
      },
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
    const { page = 1, limit = 20, search, status, tier, sort = "created_at" } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (status) where.status = status;
    if (tier) where.current_tier = tier; // Q3 (Marketing Control Center): membership tier filter
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
    const creditAmount = Number(amount);
    if (!Number.isFinite(creditAmount) || creditAmount <= 0 || creditAmount > 1_000_000) {
      return res.status(400).json({ success: false, error: "amount must be a positive number up to 1,000,000" });
    }
    const validity = Number.isFinite(Number(validity_days)) ? Math.trunc(Number(validity_days)) : NaN;
    if (!validity || validity < 1 || validity > 3650) {
      return res.status(400).json({ success: false, error: "validity_days must be between 1 and 3650" });
    }
    if (!UUID_RE.test(String(user_id))) return res.status(400).json({ success: false, error: "Invalid user_id" });
    if (!(await prisma.users.findUnique({ where: { id: user_id }, select: { id: true } }))) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const config = await referralService.getConfig();
    const profile = await referralService.getOrCreateReferralProfile(user_id, "User");

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + validity);

    const reward = await prisma.$transaction(async (tx) => {
      const r = await tx.referral_rewards.create({
        data: {
          user_id,
          user_profile_id: profile.id,
          amount: creditAmount,
          original_amount: creditAmount,
          remaining_amount: creditAmount,
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
          available_balance: { increment: creditAmount },
          total_earnings: { increment: creditAmount },
        },
      });

      return r;
    });

    await referralService.logAdminAction(user.id, user.email, user.name,
      "REWARD_CREDITED_MANUALLY", `Manually credited ₹${amount}: ${reason}`, "reward", reward.id, null, { amount, reason }, req.ip);

    await referralService.createNotification(user_id, "ADMIN_CREDIT_RECEIVED",
      { amount, validity_days },
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// referral_withdrawals has no admin_notes / processed_by / rejected_by / transaction_id columns (DB or model), so the
// admin metadata is kept in the append-only status_history JSON; rejection_reason and processed_at are real columns.
// Every transition is an atomic status-guarded updateMany inside a transaction: a repeated or concurrent call
// matches 0 rows -> 409, and can never credit/debit a balance twice.
const historyEntry = (withdrawal, entry) => [...(Array.isArray(withdrawal.status_history) ? withdrawal.status_history : []), { ...entry, timestamp: new Date() }];

export const approveWithdrawal = async (req, res) => {
  try {
    const { user } = req;
    const { id } = req.params;
    const { notes } = req.body;
    if (!UUID_RE.test(id)) return res.status(400).json({ success: false, error: "Invalid id" });

    const withdrawal = await prisma.referral_withdrawals.findUnique({ where: { id } });
    if (!withdrawal) return res.status(404).json({ success: false, error: "Withdrawal not found" });

    const guard = await prisma.referral_withdrawals.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "APPROVED", status_history: historyEntry(withdrawal, { status: "APPROVED", by: user.id, notes: notes || null }) },
    });
    if (guard.count === 0) return res.status(409).json({ success: false, error: "Can only approve PENDING withdrawals" });

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
    if (!UUID_RE.test(id)) return res.status(400).json({ success: false, error: "Invalid id" });
    if (!reason) return res.status(400).json({ success: false, error: "reason is required" });

    const withdrawal = await prisma.referral_withdrawals.findUnique({ where: { id } });
    if (!withdrawal) return res.status(404).json({ success: false, error: "Withdrawal not found" });

    // Only PENDING/APPROVED can be rejected; the balance is re-credited exactly once, in the same transaction.
    const rejected = await prisma.$transaction(async (tx) => {
      const guard = await tx.referral_withdrawals.updateMany({
        where: { id, status: { in: ["PENDING", "APPROVED"] } },
        data: {
          status: "REJECTED",
          rejection_reason: reason,
          processed_at: new Date(),
          status_history: historyEntry(withdrawal, { status: "REJECTED", by: user.id, reason }),
        },
      });
      if (guard.count === 0) return false;

      await tx.user_referral_profiles.update({
        where: { user_id: withdrawal.user_id },
        data: { available_balance: { increment: parseFloat(withdrawal.requested_amount) } },
      });
      return true;
    });
    if (!rejected) return res.status(409).json({ success: false, error: "Only PENDING or APPROVED withdrawals can be rejected" });

    await referralService.createNotification(withdrawal.user_id, "WITHDRAWAL_REJECTED",
      { amount: withdrawal.requested_amount, reason },
      { withdrawal_id: id });

    await referralService.logAdminAction(user.id, user.email, user.name,
      "WITHDRAWAL_REJECTED", `Rejected withdrawal: ${reason}`, "withdrawal", id, { status: withdrawal.status }, { status: "REJECTED" }, req.ip);

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
    if (!UUID_RE.test(id)) return res.status(400).json({ success: false, error: "Invalid id" });

    const withdrawal = await prisma.referral_withdrawals.findUnique({ where: { id } });
    if (!withdrawal) return res.status(404).json({ success: false, error: "Withdrawal not found" });

    const paid = processed_amount !== undefined && processed_amount !== null && processed_amount !== "" ? Number(processed_amount) : Number(withdrawal.requested_amount);
    if (!Number.isFinite(paid) || paid <= 0 || paid > Number(withdrawal.requested_amount)) {
      return res.status(400).json({ success: false, error: "processed_amount must be a positive number not above the requested amount" });
    }

    const completed = await prisma.$transaction(async (tx) => {
      const guard = await tx.referral_withdrawals.updateMany({
        where: { id, status: { in: ["APPROVED", "PROCESSING"] } },
        data: {
          status: "COMPLETED",
          processed_amount: paid,
          processed_at: new Date(),
          status_history: historyEntry(withdrawal, { status: "COMPLETED", by: user.id, transaction_id: transaction_id || null, payment_gateway_ref: payment_gateway_ref || null }),
        },
      });
      if (guard.count === 0) return false;

      await tx.user_referral_profiles.update({
        where: { user_id: withdrawal.user_id },
        data: { withdrawn_amount: { increment: parseFloat(withdrawal.requested_amount) } },
      });
      return true;
    });
    if (!completed) return res.status(409).json({ success: false, error: "Withdrawal must be APPROVED before processing" });

    await referralService.createNotification(withdrawal.user_id, "WITHDRAWAL_COMPLETED",
      { amount: withdrawal.requested_amount },
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

// Q2 (Marketing Control Center): fraud logs are now shared with affiliate — this admin page
// is specifically the Referral section, so it stays scoped to REFERRAL only.
export const listFraudLogs = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, severity, program } = req.query;
    // Default stays REFERRAL; the unified Fraud & Risk page passes program=ALL or AFFILIATE.
    const scope = program === "ALL" ? null : ["REFERRAL", "AFFILIATE"].includes(program) ? program : "REFERRAL";
    const result = await referralService.listFraudLogsByProgram(scope, { page, limit, status, severity });
    res.json({ success: true, ...result });
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

    await referralService.reviewFraudLogEntry(id, { status, notes, action, reviewerId: user.id });

    res.json({ success: true, message: "Fraud log reviewed" });
  } catch (error) {
    console.error("Error in reviewFraudLog:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ============================================================================
// ACTIVITY LOGS
// ============================================================================

// Module -> action prefix. Referral actions have no shared prefix, so "Referral" is everything
// that is not one of the other modules.
const ACTIVITY_MODULE_PREFIX = { Affiliate: "AFFILIATE_", Campaign: "CAMPAIGN_", Notifications: "NOTIFICATION_", Membership: "MEMBERSHIP_" };

export const listActivityLogs = async (req, res) => {
  try {
    const { page = 1, limit = 20, action, module, search, from, to } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (action) where.action = action;

    if (module && ACTIVITY_MODULE_PREFIX[module]) {
      where.action = { ...(action ? { equals: action } : {}), startsWith: ACTIVITY_MODULE_PREFIX[module] };
    } else if (module === "Referral") {
      where.AND = Object.values(ACTIVITY_MODULE_PREFIX).map((prefix) => ({ NOT: { action: { startsWith: prefix } } }));
    }

    if (search && String(search).trim()) {
      const q = String(search).trim();
      where.OR = [
        { admin_name: { contains: q, mode: "insensitive" } },
        { admin_email: { contains: q, mode: "insensitive" } },
        { action_description: { contains: q, mode: "insensitive" } },
      ];
    }

    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;
    if ((fromDate && !isNaN(fromDate)) || (toDate && !isNaN(toDate))) {
      where.created_at = {};
      if (fromDate && !isNaN(fromDate)) where.created_at.gte = fromDate;
      if (toDate && !isNaN(toDate)) {
        // A bare date (YYYY-MM-DD) means "through the end of that day".
        if (/^\d{4}-\d{2}-\d{2}$/.test(String(to))) toDate.setUTCHours(23, 59, 59, 999);
        where.created_at.lte = toDate;
      }
    }

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

// Campaign CRUD moved to controller/campaignAdminController.js (unified campaigns/campaign_rules
// engine, Phase 5) — the old referral_campaigns stub this used to manage has been dropped.
