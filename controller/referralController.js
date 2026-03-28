// controller/referralController.js
import prisma from "../config/prisma.js";
import * as referralService from "../services/referralService.js";

// ============================================================================
// USER PROFILE & STATS
// ============================================================================

// Public config — no auth required, returns only frontend-facing fields
export const getPublicConfig = async (req, res) => {
  try {
    const config = await prisma.referral_configs.findFirst();
    if (!config) {
      return res.json({
        success: true,
        config: {
          is_enabled: true,
          referrer_reward_amount: 75,
          referee_reward_amount: 75,
          min_order_value: 200,
          reward_validity_days: 7,
          min_withdrawal_amount: 100,
          max_withdrawals_per_month: 10,
          withdrawal_enabled: true,
          return_window_days: 7,
          max_earning_per_user: 1000,
        },
      });
    }
    res.json({
      success: true,
      config: {
        is_enabled: config.is_enabled,
        referrer_reward_amount: parseFloat(config.referrer_reward_amount),
        referee_reward_amount: parseFloat(config.referee_reward_amount),
        min_order_value: parseFloat(config.min_order_value),
        reward_validity_days: config.reward_validity_days,
        min_withdrawal_amount: parseFloat(config.min_withdrawal_amount),
        max_withdrawals_per_month: config.max_withdrawals_per_month,
        withdrawal_enabled: config.withdrawal_enabled !== false,
        return_window_days: config.return_window_days,
        max_earning_per_user: parseFloat(config.max_earning_per_user),
      },
    });
  } catch (error) {
    console.error("Error in getPublicConfig:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const getProfile = async (req, res) => {
  try {
    const { user } = req;
    const profile = await referralService.getOrCreateReferralProfile(user.id, user.name);
    res.json({ success: true, profile });
  } catch (error) {
    console.error("Error in getProfile:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const generateCode = async (req, res) => {
  try {
    const { user } = req;
    let profile = await prisma.user_referral_profiles.findUnique({ where: { user_id: user.id } });

    if (profile?.referral_code) {
      return res.json({ success: true, referral_code: profile.referral_code, profile });
    }

    profile = await referralService.getOrCreateReferralProfile(user.id, user.name);
    res.json({ success: true, referral_code: profile.referral_code, profile });
  } catch (error) {
    console.error("Error in generateCode:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const getStats = async (req, res) => {
  try {
    const { user } = req;
    const [profile, wallet, config] = await Promise.all([
      referralService.getOrCreateReferralProfile(user.id, user.name),
      referralService.getWalletBalance(user.id),
      prisma.referral_configs.findFirst(),
    ]);

    res.json({
      success: true,
      stats: {
        referral_code: profile.referral_code,
        total_referrals: profile.total_referrals,
        successful_referrals: profile.successful_referrals,
        pending_referrals: profile.pending_referrals,
        failed_referrals: profile.failed_referrals,
        total_earnings: parseFloat(profile.total_earnings),
        available_balance: wallet.available,
        pending_balance: wallet.pending,
        expiring_soon: wallet.expiringSoon,
        current_tier: profile.current_tier,
        was_referred: profile.was_referred,
        referred_by_code: profile.referred_by_code,
        withdrawal_enabled: config?.withdrawal_enabled !== false,
        program_enabled: config?.is_enabled !== false,
      },
    });
  } catch (error) {
    console.error("Error in getStats:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const getReferralHistory = async (req, res) => {
  try {
    const { user } = req;
    const { page = 1, limit = 20, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = { referrer_id: user.id };
    if (status) where.status = status;

    const [transactions, total] = await Promise.all([
      prisma.referral_transactions.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: offset,
        take: parseInt(limit),
        select: {
          id: true,
          referee_name: true,
          referee_email: true,
          status: true,
          order_amount: true,
          referrer_reward_amount: true,
          reward_credited_at: true,
          created_at: true,
          order_number: true,
        },
      }),
      prisma.referral_transactions.count({ where }),
    ]);

    res.json({
      success: true,
      transactions,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    console.error("Error in getReferralHistory:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ============================================================================
// REWARDS
// ============================================================================

export const getRewards = async (req, res) => {
  try {
    const { user } = req;
    const { page = 1, limit = 20, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = { user_id: user.id };
    if (status) where.status = status;

    const [rewards, total] = await Promise.all([
      prisma.referral_rewards.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: offset,
        take: parseInt(limit),
        select: {
          id: true,
          amount: true,
          remaining_amount: true,
          used_amount: true,
          reward_type: true,
          status: true,
          credited_at: true,
          expires_at: true,
          source_description: true,
        },
      }),
      prisma.referral_rewards.count({ where }),
    ]);

    res.json({
      success: true,
      rewards,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    console.error("Error in getRewards:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ============================================================================
// WALLET
// ============================================================================

export const getWallet = async (req, res) => {
  try {
    const { user } = req;
    const wallet = await referralService.getWalletBalance(user.id);
    const profile = await prisma.user_referral_profiles.findUnique({ where: { user_id: user.id } });

    res.json({ success: true, wallet, profile });
  } catch (error) {
    console.error("Error in getWallet:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const getWalletTransactions = async (req, res) => {
  try {
    const { user } = req;
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const [usages, total] = await Promise.all([
      prisma.referral_reward_usages.findMany({
        where: { user_id: user.id },
        orderBy: { created_at: "desc" },
        skip: offset,
        take: parseInt(limit),
      }),
      prisma.referral_reward_usages.count({ where: { user_id: user.id } }),
    ]);

    res.json({
      success: true,
      transactions: usages,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    console.error("Error in getWalletTransactions:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const spendBalance = async (req, res) => {
  try {
    const { user } = req;
    const { amount, order_id, order_number } = req.body;

    if (!amount || !order_id) {
      return res.status(400).json({ success: false, error: "amount and order_id are required" });
    }

    const result = await referralService.spendReferralBalance(user.id, parseFloat(amount), order_id, order_number);
    res.json(result);
  } catch (error) {
    console.error("Error in spendBalance:", error);
    res.status(400).json({ success: false, error: error.message });
  }
};

// ============================================================================
// WITHDRAWALS
// ============================================================================

export const requestWithdrawal = async (req, res) => {
  try {
    const { user } = req;
    const { amount, payment_method, bank_name, bank_account_number, bank_ifsc_code, account_holder_name, upi_id } = req.body;

    if (!amount || !payment_method) {
      return res.status(400).json({ success: false, error: "amount and payment_method are required" });
    }

    if (payment_method === "BANK_TRANSFER" && (!bank_account_number || !bank_ifsc_code || !account_holder_name)) {
      return res.status(400).json({ success: false, error: "Bank details are required for bank transfer" });
    }

    if (payment_method === "UPI" && !upi_id) {
      return res.status(400).json({ success: false, error: "UPI ID is required" });
    }

    const paymentDetails = { bank_name, bank_account_number, bank_ifsc_code, account_holder_name, upi_id };
    const withdrawal = await referralService.requestWithdrawal(user.id, parseFloat(amount), payment_method, paymentDetails);

    res.json({ success: true, message: "Withdrawal request submitted", withdrawal });
  } catch (error) {
    console.error("Error in requestWithdrawal:", error);
    res.status(400).json({ success: false, error: error.message });
  }
};

export const getWithdrawals = async (req, res) => {
  try {
    const { user } = req;
    const { page = 1, limit = 20, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = { user_id: user.id };
    if (status) where.status = status;

    const [withdrawals, total] = await Promise.all([
      prisma.referral_withdrawals.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: offset,
        take: parseInt(limit),
        select: {
          id: true,
          requested_amount: true,
          processed_amount: true,
          payment_method: true,
          status: true,
          created_at: true,
          processed_at: true,
          failure_reason: true,
          rejection_reason: true,
          upi_id: true,
          account_holder_name: true,
          bank_name: true,
        },
      }),
      prisma.referral_withdrawals.count({ where }),
    ]);

    res.json({
      success: true,
      withdrawals,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    console.error("Error in getWithdrawals:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const getWithdrawalById = async (req, res) => {
  try {
    const { user } = req;
    const { id } = req.params;

    const withdrawal = await prisma.referral_withdrawals.findFirst({
      where: { id, user_id: user.id },
    });

    if (!withdrawal) return res.status(404).json({ success: false, error: "Withdrawal not found" });
    res.json({ success: true, withdrawal });
  } catch (error) {
    console.error("Error in getWithdrawalById:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ============================================================================
// CODE
// ============================================================================

export const applyCode = async (req, res) => {
  try {
    const { user } = req;
    const { referral_code } = req.body;
    const ipAddress = req.ip || req.headers["x-forwarded-for"];
    const userAgent = req.headers["user-agent"];

    if (!referral_code) return res.status(400).json({ success: false, error: "referral_code is required" });

    const result = await referralService.applyReferralCode(
      user.id,
      { email: user.email, name: user.name, phone: user.phone },
      referral_code,
      ipAddress,
      userAgent
    );

    if (!result.success) return res.status(400).json(result);
    res.json({ success: true, message: "Referral code applied successfully", transaction: result.transaction });
  } catch (error) {
    console.error("Error in applyCode:", error);
    res.status(400).json({ success: false, error: error.message });
  }
};

export const validateCode = async (req, res) => {
  try {
    const { referral_code } = req.body;
    const result = await referralService.validateReferralCode(referral_code);
    res.json(result);
  } catch (error) {
    console.error("Error in validateCode:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const getShareContent = async (req, res) => {
  try {
    const { user } = req;
    const profile = await referralService.getOrCreateReferralProfile(user.id, user.name);
    const config = await referralService.getConfig();

    res.json({
      success: true,
      share: {
        referral_code: profile.referral_code,
        title: `Join ${config.program_name || "Refer & Earn"} and get ₹${config.referee_reward_amount} off!`,
        message: `Use my referral code ${profile.referral_code} while signing up and get ₹${config.referee_reward_amount} off your first order! I'll earn ₹${config.referrer_reward_amount} too!`,
        short_message: `Use code ${profile.referral_code} to get ₹${config.referee_reward_amount} off!`,
      },
    });
  } catch (error) {
    console.error("Error in getShareContent:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ============================================================================
// NOTIFICATIONS
// ============================================================================

export const getNotifications = async (req, res) => {
  try {
    const { user } = req;
    const { page = 1, limit = 20, unread_only } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = { user_id: user.id };
    if (unread_only === "true") where.is_read = false;

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.referral_notifications.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: offset,
        take: parseInt(limit),
      }),
      prisma.referral_notifications.count({ where }),
      prisma.referral_notifications.count({ where: { user_id: user.id, is_read: false } }),
    ]);

    res.json({
      success: true,
      notifications,
      unread_count: unreadCount,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    console.error("Error in getNotifications:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const markNotificationRead = async (req, res) => {
  try {
    const { user } = req;
    const { id } = req.params;

    await prisma.referral_notifications.updateMany({
      where: { id, user_id: user.id },
      data: { is_read: true, read_at: new Date() },
    });

    res.json({ success: true, message: "Notification marked as read" });
  } catch (error) {
    console.error("Error in markNotificationRead:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ============================================================================
// INTERNAL HOOKS (called by order system)
// ============================================================================

export const onUserRegistered = async (req, res) => {
  try {
    const { user_id, name, email, phone, referral_code, ip_address, user_agent } = req.body;
    if (!user_id) return res.status(400).json({ success: false, error: "user_id required" });

    // Always create a referral profile for new users
    await referralService.getOrCreateReferralProfile(user_id, name);

    // Apply referral code if provided
    if (referral_code) {
      await referralService.applyReferralCode(
        user_id,
        { email, name, phone },
        referral_code,
        ip_address,
        user_agent
      );
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error in onUserRegistered:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const onOrderPlaced = async (req, res) => {
  try {
    const { user_id, order_id, order_number, order_amount } = req.body;
    if (!user_id || !order_id) return res.status(400).json({ success: false, error: "user_id and order_id required" });

    await referralService.onOrderPlaced(user_id, order_id, order_number, order_amount);
    res.json({ success: true });
  } catch (error) {
    console.error("Error in onOrderPlaced hook:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const onOrderDelivered = async (req, res) => {
  try {
    const { order_id, delivered_at } = req.body;
    if (!order_id) return res.status(400).json({ success: false, error: "order_id required" });

    await referralService.onOrderDelivered(order_id, delivered_at ? new Date(delivered_at) : new Date());
    res.json({ success: true });
  } catch (error) {
    console.error("Error in onOrderDelivered hook:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const onOrderReturned = async (req, res) => {
  try {
    const { order_id, return_type = "FULL", return_amount } = req.body;
    if (!order_id) return res.status(400).json({ success: false, error: "order_id required" });

    await referralService.onOrderReturned(order_id, return_type, return_amount);
    res.json({ success: true });
  } catch (error) {
    console.error("Error in onOrderReturned hook:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const processReturnWindowExpired = async (req, res) => {
  try {
    const { referral_transaction_id } = req.body;
    if (!referral_transaction_id) return res.status(400).json({ success: false, error: "referral_transaction_id required" });

    const result = await referralService.processReturnWindowExpiry(referral_transaction_id);
    res.json({ success: true, result });
  } catch (error) {
    console.error("Error in processReturnWindowExpired:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ============================================================================
// CRON ENDPOINTS
// ============================================================================

export const cronProcessExpiredRewards = async (req, res) => {
  try {
    const result = await referralService.processExpiredRewards();
    res.json({ success: true, ...result });
  } catch (error) {
    console.error("Error in cronProcessExpiredRewards:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const cronSendExpiryReminders = async (req, res) => {
  try {
    const result = await referralService.sendExpiryReminders();
    res.json({ success: true, ...result });
  } catch (error) {
    console.error("Error in cronSendExpiryReminders:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const cronProcessReturnWindows = async (req, res) => {
  try {
    const result = await referralService.processReturnWindowExpirations();
    res.json({ success: true, ...result });
  } catch (error) {
    console.error("Error in cronProcessReturnWindows:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};
