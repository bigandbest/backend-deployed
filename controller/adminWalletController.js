// controllers/adminWalletController.js
import { supabase } from "../config/supabaseClient.js";
import {
  createNotificationHelper,
  createAdminNotification,
} from "./NotificationHelpers.js";

// Helper function to log admin actions
const logAdminAction = async (
  walletId,
  adminId,
  action,
  amount = null,
  reason = "",
  metadata = {},
  req = null
) => {
  try {
    // Get current wallet balance for logging
    const { data: wallet } = await supabase
      .from("wallets")
      .select("balance")
      .eq("id", walletId)
      .single();

    await supabase.from("wallet_audit_logs").insert([
      {
        wallet_id: walletId,
        admin_id: adminId,
        action,
        amount: amount ? parseFloat(amount) : null,
        reason,
        previous_balance: wallet?.balance ? parseFloat(wallet.balance) : null,
        metadata,
        ip_address: req?.ip,
        user_agent: req?.get("User-Agent"),
      },
    ]);
  } catch (error) {
    console.error("Error logging admin action:", error);
  }
};

// Helper function to execute admin wallet transaction
const executeAdminWalletTransaction = async (
  userId,
  transactionType,
  amount,
  adminId,
  reason,
  metadata = {}
) => {
  // Import the transaction function from walletController
  const { executeWalletTransaction } = await import("./walletController.js");

  const idempotencyKey = `admin_${adminId}_${transactionType.toLowerCase()}_${userId}_${Date.now()}`;

  return await executeWalletTransaction(
    userId,
    transactionType,
    amount,
    "MANUAL",
    null,
    reason,
    { ...metadata, admin_action: true },
    adminId,
    null,
    null,
    idempotencyKey
  );
};

// Get all wallets (admin only)
export const getAllWallets = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = supabase
      .from("wallets")
      .select(
        `
        *,
        users!wallets_user_id_fkey(
          id, name, email, phone, created_at
        )
      `
      )
      .order("updated_at", { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    // Filter by search term
    if (search) {
      query = query.or(`
        users.name.ilike.%${search}%,
        users.email.ilike.%${search}%,
        users.phone.ilike.%${search}%
      `);
    }

    // Filter by status
    if (status === "frozen") {
      query = query.eq("is_frozen", true);
    } else if (status === "active") {
      query = query.eq("is_frozen", false);
    }

    const { data: wallets, error, count } = await query;

    if (error) {
      console.error("Error fetching wallets:", error);
      return res
        .status(500)
        .json({ success: false, error: "Failed to fetch wallets" });
    }

    // Get total count for pagination
    const { count: totalCount } = await supabase
      .from("wallets")
      .select("*", { count: "exact", head: true });

    res.json({
      success: true,
      wallets,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Error in getAllWallets:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Get specific user wallet details (admin)
export const getUserWalletDetails = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    // Get wallet with user details
    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select(
        `
        *,
        users!wallets_user_id_fkey(
          id, name, email, phone, created_at, account_type
        )
      `
      )
      .eq("user_id", userId)
      .single();

    if (walletError) {
      return res
        .status(404)
        .json({ success: false, error: "Wallet not found" });
    }

    // Get recent transactions
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { data: transactions, error: transactionError } = await supabase
      .from("wallet_transactions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (transactionError) {
      console.error("Error fetching transactions:", transactionError);
    }

    // Get transaction statistics
    const { data: stats } = await supabase.rpc("get_wallet_stats", {
      wallet_user_id: userId,
    });

    // Log admin action
    if (req.user?.id) {
      await logAdminAction(
        wallet.id,
        req.user.id,
        "VIEW_DETAILS",
        null,
        "Viewed wallet details",
        {},
        req
      );
    }

    res.json({
      success: true,
      wallet,
      transactions: transactions || [],
      stats: stats || {
        total_topups: 0,
        total_spent: 0,
        total_refunds: 0,
        transaction_count: 0,
      },
    });
  } catch (error) {
    console.error("Error in getUserWalletDetails:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Manual credit to wallet (admin)
export const manualCreditWallet = async (req, res) => {
  try {
    const { userId } = req.params;
    const { amount, reason, notify_user = true } = req.body;
    const adminId = req.user?.id;

    if (!adminId) {
      return res
        .status(401)
        .json({ success: false, error: "Admin authentication required" });
    }

    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
      return res
        .status(400)
        .json({ success: false, error: "Valid amount is required" });
    }

    if (!reason || reason.trim().length < 5) {
      return res
        .status(400)
        .json({
          success: false,
          error: "Reason is required (minimum 5 characters)",
        });
    }

    const creditAmount = parseFloat(amount);

    if (creditAmount > 10000) {
      return res.status(400).json({
        success: false,
        error: "Maximum manual credit limit is ₹10,000",
      });
    }

    // Get wallet
    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("id, user_id, balance")
      .eq("user_id", userId)
      .single();

    if (walletError) {
      return res
        .status(404)
        .json({ success: false, error: "Wallet not found" });
    }

    try {
      const { wallet: updatedWallet, transaction } =
        await executeAdminWalletTransaction(
          userId,
          "ADMIN_CREDIT",
          creditAmount,
          adminId,
          reason,
          { manual_credit: true }
        );

      // Log admin action
      await logAdminAction(
        wallet.id,
        adminId,
        "MANUAL_CREDIT",
        creditAmount,
        reason,
        { transaction_id: transaction.id },
        req
      );

      // Send notification to user
      if (notify_user) {
        await createNotificationHelper(
          userId,
          "Wallet Credited",
          `₹${creditAmount} has been credited to your wallet by admin. Reason: ${reason}. Current balance: ₹${updatedWallet.balance}`,
          "wallet_credit",
          transaction.id,
          "user"
        );
      }

      // Create admin notification
      await createAdminNotification(
        `Manual Wallet Credit`,
        `Admin ${
          req.user.email || adminId
        } credited ₹${creditAmount} to user ${userId}'s wallet. Reason: ${reason}`,
        "wallet_credit",
        transaction.id
      );

      res.json({
        success: true,
        message: "Wallet credited successfully",
        transaction,
        new_balance: parseFloat(updatedWallet.balance),
      });
    } catch (transactionError) {
      res.status(400).json({ success: false, error: transactionError.message });
    }
  } catch (error) {
    console.error("Error in manualCreditWallet:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Manual debit from wallet (admin)
export const manualDebitWallet = async (req, res) => {
  try {
    const { userId } = req.params;
    const { amount, reason, notify_user = true } = req.body;
    const adminId = req.user?.id;

    if (!adminId) {
      return res
        .status(401)
        .json({ success: false, error: "Admin authentication required" });
    }

    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
      return res
        .status(400)
        .json({ success: false, error: "Valid amount is required" });
    }

    if (!reason || reason.trim().length < 5) {
      return res
        .status(400)
        .json({
          success: false,
          error: "Reason is required (minimum 5 characters)",
        });
    }

    const debitAmount = parseFloat(amount);

    // Get wallet
    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("id, user_id, balance, is_frozen")
      .eq("user_id", userId)
      .single();

    if (walletError) {
      return res
        .status(404)
        .json({ success: false, error: "Wallet not found" });
    }

    if (parseFloat(wallet.balance) < debitAmount) {
      return res.status(400).json({
        success: false,
        error: "Insufficient wallet balance",
      });
    }

    try {
      const { wallet: updatedWallet, transaction } =
        await executeAdminWalletTransaction(
          userId,
          "ADMIN_DEBIT",
          debitAmount,
          adminId,
          reason,
          { manual_debit: true }
        );

      // Log admin action
      await logAdminAction(
        wallet.id,
        adminId,
        "MANUAL_DEBIT",
        debitAmount,
        reason,
        { transaction_id: transaction.id },
        req
      );

      // Send notification to user
      if (notify_user) {
        await createNotificationHelper(
          userId,
          "Wallet Debited",
          `₹${debitAmount} has been debited from your wallet by admin. Reason: ${reason}. Current balance: ₹${updatedWallet.balance}`,
          "wallet_debit",
          transaction.id,
          "user"
        );
      }

      // Create admin notification
      await createAdminNotification(
        `Manual Wallet Debit`,
        `Admin ${
          req.user.email || adminId
        } debited ₹${debitAmount} from user ${userId}'s wallet. Reason: ${reason}`,
        "wallet_debit",
        transaction.id
      );

      res.json({
        success: true,
        message: "Wallet debited successfully",
        transaction,
        new_balance: parseFloat(updatedWallet.balance),
      });
    } catch (transactionError) {
      res.status(400).json({ success: false, error: transactionError.message });
    }
  } catch (error) {
    console.error("Error in manualDebitWallet:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Freeze wallet (admin)
export const freezeWallet = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason, notify_user = true } = req.body;
    const adminId = req.user?.id;

    if (!adminId) {
      return res
        .status(401)
        .json({ success: false, error: "Admin authentication required" });
    }

    if (!reason || reason.trim().length < 5) {
      return res
        .status(400)
        .json({
          success: false,
          error: "Reason is required (minimum 5 characters)",
        });
    }

    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (walletError) {
      return res
        .status(404)
        .json({ success: false, error: "Wallet not found" });
    }

    if (wallet.is_frozen) {
      return res
        .status(400)
        .json({ success: false, error: "Wallet is already frozen" });
    }

    // Update wallet to frozen status
    const { data: updatedWallet, error: updateError } = await supabase
      .from("wallets")
      .update({
        is_frozen: true,
        frozen_reason: reason,
        frozen_by: adminId,
        frozen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", wallet.id)
      .select()
      .single();

    if (updateError) {
      console.error("Error freezing wallet:", updateError);
      return res
        .status(500)
        .json({ success: false, error: "Failed to freeze wallet" });
    }

    // Log admin action
    await logAdminAction(
      wallet.id,
      adminId,
      "FREEZE",
      null,
      reason,
      { freeze_action: true },
      req
    );

    // Send notification to user
    if (notify_user) {
      await createNotificationHelper(
        userId,
        "Wallet Frozen",
        `Your wallet has been frozen by admin. Reason: ${reason}. You can still add money but cannot make payments.`,
        "wallet_freeze",
        wallet.id,
        "user"
      );
    }

    // Create admin notification
    await createAdminNotification(
      `Wallet Frozen`,
      `Admin ${
        req.user.email || adminId
      } froze wallet for user ${userId}. Reason: ${reason}`,
      "wallet_freeze",
      wallet.id
    );

    res.json({
      success: true,
      message: "Wallet frozen successfully",
      wallet: updatedWallet,
    });
  } catch (error) {
    console.error("Error in freezeWallet:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Unfreeze wallet (admin)
export const unfreezeWallet = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason, notify_user = true } = req.body;
    const adminId = req.user?.id;

    if (!adminId) {
      return res
        .status(401)
        .json({ success: false, error: "Admin authentication required" });
    }

    if (!reason || reason.trim().length < 5) {
      return res
        .status(400)
        .json({
          success: false,
          error: "Reason is required (minimum 5 characters)",
        });
    }

    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (walletError) {
      return res
        .status(404)
        .json({ success: false, error: "Wallet not found" });
    }

    if (!wallet.is_frozen) {
      return res
        .status(400)
        .json({ success: false, error: "Wallet is not frozen" });
    }

    // Update wallet to unfrozen status
    const { data: updatedWallet, error: updateError } = await supabase
      .from("wallets")
      .update({
        is_frozen: false,
        frozen_reason: null,
        frozen_by: null,
        frozen_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", wallet.id)
      .select()
      .single();

    if (updateError) {
      console.error("Error unfreezing wallet:", updateError);
      return res
        .status(500)
        .json({ success: false, error: "Failed to unfreeze wallet" });
    }

    // Log admin action
    await logAdminAction(
      wallet.id,
      adminId,
      "UNFREEZE",
      null,
      reason,
      { unfreeze_action: true },
      req
    );

    // Send notification to user
    if (notify_user) {
      await createNotificationHelper(
        userId,
        "Wallet Unfrozen",
        `Your wallet has been unfrozen by admin. Reason: ${reason}. You can now make payments using your wallet.`,
        "wallet_unfreeze",
        wallet.id,
        "user"
      );
    }

    // Create admin notification
    await createAdminNotification(
      `Wallet Unfrozen`,
      `Admin ${
        req.user.email || adminId
      } unfroze wallet for user ${userId}. Reason: ${reason}`,
      "wallet_unfreeze",
      wallet.id
    );

    res.json({
      success: true,
      message: "Wallet unfrozen successfully",
      wallet: updatedWallet,
    });
  } catch (error) {
    console.error("Error in unfreezeWallet:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Get wallet transactions for admin view
export const getWalletTransactionsAdmin = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      user_id,
      transaction_type,
      start_date,
      end_date,
    } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = supabase
      .from("wallet_transactions")
      .select(
        `
        *,
        wallets!wallet_transactions_wallet_id_fkey(
          user_id,
          users!wallets_user_id_fkey(
            name, email, phone
          )
        )
      `
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    // Apply filters
    if (user_id) {
      query = query.eq("user_id", user_id);
    }

    if (transaction_type) {
      query = query.eq("transaction_type", transaction_type);
    }

    if (start_date) {
      query = query.gte("created_at", start_date);
    }

    if (end_date) {
      query = query.lte("created_at", end_date);
    }

    const { data: transactions, error, count } = await query;

    if (error) {
      console.error("Error fetching transactions:", error);
      return res
        .status(500)
        .json({ success: false, error: "Failed to fetch transactions" });
    }

    // Get total count for pagination
    let countQuery = supabase
      .from("wallet_transactions")
      .select("*", { count: "exact", head: true });

    if (user_id) countQuery = countQuery.eq("user_id", user_id);
    if (transaction_type)
      countQuery = countQuery.eq("transaction_type", transaction_type);
    if (start_date) countQuery = countQuery.gte("created_at", start_date);
    if (end_date) countQuery = countQuery.lte("created_at", end_date);

    const { count: totalCount } = await countQuery;

    res.json({
      success: true,
      transactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Error in getWalletTransactionsAdmin:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Get wallet audit logs (admin)
export const getWalletAuditLogs = async (req, res) => {
  try {
    const { page = 1, limit = 50, wallet_id, admin_id, action } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = supabase
      .from("wallet_audit_logs")
      .select(
        `
        *,
        wallets!wallet_audit_logs_wallet_id_fkey(
          user_id,
          users!wallets_user_id_fkey(
            name, email
          )
        )
      `
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    // Apply filters
    if (wallet_id) {
      query = query.eq("wallet_id", wallet_id);
    }

    if (admin_id) {
      query = query.eq("admin_id", admin_id);
    }

    if (action) {
      query = query.eq("action", action);
    }

    const { data: logs, error } = await query;

    if (error) {
      console.error("Error fetching audit logs:", error);
      return res
        .status(500)
        .json({ success: false, error: "Failed to fetch audit logs" });
    }

    // Get total count
    let countQuery = supabase
      .from("wallet_audit_logs")
      .select("*", { count: "exact", head: true });

    if (wallet_id) countQuery = countQuery.eq("wallet_id", wallet_id);
    if (admin_id) countQuery = countQuery.eq("admin_id", admin_id);
    if (action) countQuery = countQuery.eq("action", action);

    const { count: totalCount } = await countQuery;

    res.json({
      success: true,
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Error in getWalletAuditLogs:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};
