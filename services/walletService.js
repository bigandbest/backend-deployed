// services/walletService.js
import { supabase } from "../config/supabaseClient.js";

/**
 * Enhanced checkout service that integrates wallet payments
 */
export class WalletCheckoutService {
  /**
   * Calculate how order total can be split between wallet and external payment
   */
  static async calculatePaymentSplit(userId, orderTotal) {
    try {
      const { data: wallet, error } = await supabase
        .from("wallets")
        .select("balance, is_frozen")
        .eq("user_id", userId)
        .single();

      if (error || !wallet) {
        return {
          success: false,
          error: "Wallet not found",
          split: null,
        };
      }

      if (wallet.is_frozen) {
        return {
          success: false,
          error: "Wallet is frozen",
          split: null,
        };
      }

      const walletBalance = parseFloat(wallet.balance);
      const totalAmount = parseFloat(orderTotal);

      if (walletBalance <= 0) {
        return {
          success: true,
          split: {
            wallet_amount: 0,
            external_amount: totalAmount,
            can_use_wallet: false,
            wallet_balance: walletBalance,
          },
        };
      }

      const walletAmount = Math.min(walletBalance, totalAmount);
      const externalAmount = totalAmount - walletAmount;

      return {
        success: true,
        split: {
          wallet_amount: walletAmount,
          external_amount: externalAmount,
          can_use_wallet: true,
          wallet_balance: walletBalance,
          is_full_wallet_payment: externalAmount === 0,
        },
      };
    } catch (error) {
      console.error("Error calculating payment split:", error);
      return {
        success: false,
        error: "Failed to calculate payment split",
        split: null,
      };
    }
  }

  /**
   * Process wallet payment during checkout
   */
  static async processWalletPayment(userId, orderId, walletAmount, orderTotal) {
    try {
      // Validate amounts
      if (walletAmount <= 0 || walletAmount > orderTotal) {
        throw new Error("Invalid wallet amount");
      }

      // Check wallet balance
      const { data: wallet, error: walletError } = await supabase
        .from("wallets")
        .select("id, balance, is_frozen")
        .eq("user_id", userId)
        .single();

      if (walletError || !wallet) {
        throw new Error("Wallet not found");
      }

      if (wallet.is_frozen) {
        throw new Error("Wallet is frozen");
      }

      if (parseFloat(wallet.balance) < walletAmount) {
        throw new Error("Insufficient wallet balance");
      }

      // Import wallet controller to use transaction function
      const { spendFromWallet } = await import(
        "../controller/walletController.js"
      );

      // Create mock request/response for internal call
      const mockReq = {
        user: { id: userId },
        body: {
          amount: walletAmount,
          order_id: orderId,
          description: `Order payment #${orderId}`,
        },
        headers: {},
      };

      let result = null;
      const mockRes = {
        status: (code) => ({
          json: (data) => {
            result = { status: code, data };
          },
        }),
        json: (data) => {
          result = { status: 200, data };
        },
      };

      await spendFromWallet(mockReq, mockRes);

      if (result.status !== 200) {
        throw new Error(result.data.error || "Wallet payment failed");
      }

      return {
        success: true,
        transaction: result.data.transaction,
        remaining_balance: result.data.remaining_balance,
      };
    } catch (error) {
      console.error("Error processing wallet payment:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Validate wallet payment before order creation
   */
  static async validateWalletPayment(
    userId,
    useWallet,
    walletAmount,
    orderTotal
  ) {
    if (!useWallet) {
      return { success: true, validated: false };
    }

    try {
      const splitResult = await this.calculatePaymentSplit(userId, orderTotal);

      if (!splitResult.success) {
        return { success: false, error: splitResult.error };
      }

      const { split } = splitResult;

      if (!split.can_use_wallet) {
        return { success: false, error: "Wallet cannot be used for payment" };
      }

      // If specific wallet amount is provided, validate it
      if (walletAmount !== undefined) {
        if (walletAmount > split.wallet_amount) {
          return {
            success: false,
            error: `Maximum wallet amount available is ₹${split.wallet_amount}`,
          };
        }
      }

      return {
        success: true,
        validated: true,
        split,
      };
    } catch (error) {
      console.error("Error validating wallet payment:", error);
      return {
        success: false,
        error: "Failed to validate wallet payment",
      };
    }
  }
}

/**
 * Wallet statistics service
 */
export class WalletStatsService {
  static async getUserWalletStats(userId) {
    try {
      // Get basic wallet info
      const { data: wallet, error: walletError } = await supabase
        .from("wallets")
        .select("balance, created_at, is_frozen")
        .eq("user_id", userId)
        .single();

      if (walletError) {
        throw new Error("Wallet not found");
      }

      // Get transaction statistics
      const { data: stats } = await supabase
        .from("wallet_transactions")
        .select("transaction_type, amount")
        .eq("user_id", userId)
        .eq("status", "COMPLETED");

      const statistics = {
        current_balance: parseFloat(wallet.balance),
        is_frozen: wallet.is_frozen,
        wallet_age_days: Math.floor(
          (Date.now() - new Date(wallet.created_at)) / (1000 * 60 * 60 * 24)
        ),
        total_topups: 0,
        total_spent: 0,
        total_refunds: 0,
        total_credits: 0,
        total_debits: 0,
        transaction_count: stats?.length || 0,
      };

      if (stats) {
        stats.forEach((transaction) => {
          const amount = parseFloat(transaction.amount);

          switch (transaction.transaction_type) {
            case "TOPUP":
              statistics.total_topups += amount;
              break;
            case "SPEND":
              statistics.total_spent += amount;
              break;
            case "REFUND":
              statistics.total_refunds += amount;
              break;
            case "ADMIN_CREDIT":
              statistics.total_credits += amount;
              break;
            case "ADMIN_DEBIT":
              statistics.total_debits += amount;
              break;
          }
        });
      }

      return { success: true, stats: statistics };
    } catch (error) {
      console.error("Error getting wallet stats:", error);
      return { success: false, error: error.message };
    }
  }

  static async getAdminWalletOverview() {
    try {
      // Get overall wallet statistics
      const { data: overviewData } = await supabase.rpc(
        "get_admin_wallet_overview"
      );

      const { data: recentTransactions } = await supabase
        .from("wallet_transactions")
        .select(
          `
          *,
          wallets!wallet_transactions_wallet_id_fkey(
            users!wallets_user_id_fkey(name, email)
          )
        `
        )
        .order("created_at", { ascending: false })
        .limit(10);

      const { data: frozenWallets } = await supabase
        .from("wallets")
        .select(
          `
          *,
          users!wallets_user_id_fkey(name, email)
        `
        )
        .eq("is_frozen", true)
        .order("frozen_at", { ascending: false })
        .limit(10);

      return {
        success: true,
        overview: overviewData || {},
        recent_transactions: recentTransactions || [],
        frozen_wallets: frozenWallets || [],
      };
    } catch (error) {
      console.error("Error getting admin wallet overview:", error);
      return { success: false, error: error.message };
    }
  }
}

export default { WalletCheckoutService, WalletStatsService };
