// controllers/adminWalletController.js
import prisma from "../config/prisma.js";
/*
import {
  createNotificationHelper,
  createAdminNotification,
} from "./NotificationHelpers.js";
*/

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
    const wallet = await prisma.wallets.findUnique({
      where: { id: walletId },
      select: { balance: true }
    });

    await prisma.wallet_audit_logs.create({
      data: {
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
    });
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
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const where = {};

    // Filter by search term (name, email, phone)
    if (search) {
      where.users_wallets_user_idTousers = {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
        ]
      };
    }

    // Filter by status
    if (status === "frozen") {
      where.is_frozen = true;
    } else if (status === "active") {
      where.is_frozen = false;
    }

    const [wallets, totalCount] = await Promise.all([
      prisma.wallets.findMany({
        where,
        include: {
          users_wallets_user_idTousers: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              created_at: true
            }
          }
        },
        orderBy: { updated_at: 'desc' },
        skip,
        take
      }),
      prisma.wallets.count({ where })
    ]);

    res.json({
      success: true,
      wallets: wallets.map(w => ({ ...w, user: w.users_wallets_user_idTousers })),
      pagination: {
        page: parseInt(page),
        limit: take,
        total: totalCount,
        pages: Math.ceil(totalCount / take),
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
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    // Get wallet with user details using Prisma
    const wallet = await prisma.wallets.findUnique({
      where: { user_id: userId },
      include: {
        users_wallets_user_idTousers: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            created_at: true,
            account_type: true
          }
        }
      }
    });

    if (!wallet) {
      return res
        .status(404)
        .json({ success: false, error: "Wallet not found" });
    }

    // Get recent transactions and stats
    const [transactions, transactionsCount] = await Promise.all([
      prisma.wallet_transactions.findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' },
        skip,
        take
      }),
      prisma.wallet_transactions.count({ where: { user_id: userId } })
    ]);

    // Transaction statistics using aggregate if necessary or just summary
    // Original code used rpc 'get_wallet_stats', we can calculate manually or leave for now
    // For now, let's provide basic counts
    const stats = {
      total_topups: await prisma.wallet_transactions.aggregate({
        where: { user_id: userId, transaction_type: 'TOPUP', status: 'COMPLETED' },
        _sum: { amount: true }
      }).then(r => r._sum.amount || 0),
      total_spent: await prisma.wallet_transactions.aggregate({
        where: { user_id: userId, transaction_type: 'SPEND', status: 'COMPLETED' },
        _sum: { amount: true }
      }).then(r => r._sum.amount || 0),
      transaction_count: transactionsCount
    };

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
      wallet: { ...wallet, user: wallet.users_wallets_user_idTousers },
      transactions: transactions || [],
      stats,
      pagination: {
        page: parseInt(page),
        limit: take,
        total: transactionsCount,
        pages: Math.ceil(transactionsCount / take)
      }
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
    const wallet = await prisma.wallets.findUnique({
      where: { user_id: userId },
      select: { id: true, user_id: true, balance: true }
    });

    if (!wallet) {
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
      /*
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
      */

      // Create admin notification
      /*
      await createAdminNotification(
        `Manual Wallet Credit`,
        `Admin ${
          req.user.email || adminId
        } credited ₹${creditAmount} to user ${userId}'s wallet. Reason: ${reason}`,
        "wallet_credit",
        transaction.id
      );
      */

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
    const wallet = await prisma.wallets.findUnique({
      where: { user_id: userId },
      select: { id: true, user_id: true, balance: true, is_frozen: true }
    });

    if (!wallet) {
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
      /*
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
      */

      // Create admin notification
      /*
      await createAdminNotification(
        `Manual Wallet Debit`,
        `Admin ${
          req.user.email || adminId
        } debited ₹${debitAmount} from user ${userId}'s wallet. Reason: ${reason}`,
        "wallet_debit",
        transaction.id
      );
      */

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

    const wallet = await prisma.wallets.findUnique({
      where: { user_id: userId }
    });

    if (!wallet) {
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
    const updatedWallet = await prisma.wallets.update({
      where: { id: wallet.id },
      data: {
        is_frozen: true,
        frozen_reason: reason,
        frozen_by: adminId,
        frozen_at: new Date(),
        updated_at: new Date(),
      }
    });

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
    /*
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
    */

    // Create admin notification
    /*
    await createAdminNotification(
      `Wallet Frozen`,
      `Admin ${
        req.user.email || adminId
      } froze wallet for user ${userId}. Reason: ${reason}`,
      "wallet_freeze",
      wallet.id
    );
    */

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

    const wallet = await prisma.wallets.findUnique({
      where: { user_id: userId }
    });

    if (!wallet) {
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
    const updatedWallet = await prisma.wallets.update({
      where: { id: wallet.id },
      data: {
        is_frozen: false,
        frozen_reason: null,
        frozen_by: null,
        frozen_at: null,
        updated_at: new Date(),
      }
    });

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
    /*
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
    */

    // Create admin notification
    /*
    await createAdminNotification(
      `Wallet Unfrozen`,
      `Admin ${
        req.user.email || adminId
      } unfroze wallet for user ${userId}. Reason: ${reason}`,
      "wallet_unfreeze",
      wallet.id
    );
    */

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

    const where = {};
    if (user_id) where.user_id = user_id;
    if (transaction_type) where.transaction_type = transaction_type;
    if (start_date || end_date) {
      where.created_at = {};
      if (start_date) where.created_at.gte = new Date(start_date);
      if (end_date) where.created_at.lte = new Date(end_date);
    }

    const [transactions, totalCount] = await Promise.all([
      prisma.wallet_transactions.findMany({
        where,
        include: {
          wallet: {
            include: {
              users_wallets_user_idTousers: {
                select: { name: true, email: true, phone: true }
              }
            }
          }
        },
        orderBy: { created_at: 'desc' },
        skip: offset,
        take: parseInt(limit)
      }),
      prisma.wallet_transactions.count({ where })
    ]);

    res.json({
      success: true,
      transactions: transactions.map(t => ({
        ...t,
        wallet: t.wallet ? { ...t.wallet, user: t.wallet.users_wallets_user_idTousers } : null
      })),
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

    const where = {};
    if (wallet_id) where.wallet_id = wallet_id;
    if (admin_id) where.admin_id = admin_id;
    if (action) where.action = action;

    const [logs, totalCount] = await Promise.all([
      prisma.wallet_audit_logs.findMany({
        where,
        include: {
          wallet: {
            include: {
              users_wallets_user_idTousers: {
                select: { name: true, email: true }
              }
            }
          }
        },
        orderBy: { created_at: 'desc' },
        skip: offset,
        take: parseInt(limit)
      }),
      prisma.wallet_audit_logs.count({ where })
    ]);

    res.json({
      success: true,
      logs: logs.map(l => ({
        ...l,
        wallet: l.wallet ? { ...l.wallet, user: l.wallet.users_wallets_user_idTousers } : null
      })),
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
