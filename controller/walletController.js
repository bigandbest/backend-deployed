// controllers/walletController.js
import { supabase } from "../config/supabaseClient.js";
import crypto from "crypto";
import Razorpay from "razorpay";
import { createNotificationHelper } from "./NotificationHelpers.js";
import dotenv from "dotenv";

dotenv.config();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Helper function to generate idempotency key
const generateIdempotencyKey = (userId, type, amount, reference = "") => {
  const data = `${userId}-${type}-${amount}-${reference}-${Date.now()}`;
  return crypto.createHash("sha256").update(data).digest("hex");
};

// Helper function to execute wallet transaction atomically
export const executeWalletTransaction = async (
  userId,
  transactionType,
  amount,
  referenceType = null,
  referenceId = null,
  description = "",
  metadata = {},
  createdBy = null,
  razorpayOrderId = null,
  razorpayPaymentId = null,
  idempotencyKey = null
) => {
  const client = supabase;

  // Start transaction
  const { data: currentWallet, error: walletError } = await client
    .from("wallets")
    .select("id, balance, is_frozen, version")
    .eq("user_id", userId)
    .single();

  if (walletError || !currentWallet) {
    throw new Error("Wallet not found");
  }

  // Check if wallet is frozen for spending operations
  if (
    currentWallet.is_frozen &&
    ["SPEND", "ADMIN_DEBIT"].includes(transactionType)
  ) {
    throw new Error("Wallet is frozen");
  }

  const balanceBefore = parseFloat(currentWallet.balance);
  let balanceAfter;

  // Calculate new balance based on transaction type
  switch (transactionType) {
    case "TOPUP":
    case "REFUND":
    case "ADMIN_CREDIT":
      balanceAfter = balanceBefore + parseFloat(amount);
      break;
    case "SPEND":
    case "ADMIN_DEBIT":
      balanceAfter = balanceBefore - parseFloat(amount);
      if (balanceAfter < 0) {
        throw new Error("Insufficient wallet balance");
      }
      break;
    default:
      throw new Error("Invalid transaction type");
  }

  // Insert transaction record
  const { data: transaction, error: transactionError } = await client
    .from("wallet_transactions")
    .insert([
      {
        wallet_id: currentWallet.id,
        user_id: userId,
        transaction_type: transactionType,
        amount: parseFloat(amount),
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        reference_type: referenceType,
        reference_id: referenceId,
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: razorpayPaymentId,
        description,
        metadata,
        idempotency_key: idempotencyKey,
        created_by: createdBy,
        status: "COMPLETED",
      },
    ])
    .select()
    .single();

  if (transactionError) {
    console.error("Transaction insert error:", transactionError);
    throw new Error("Failed to create transaction record");
  }

  // Update wallet balance with optimistic locking
  const { data: updatedWallet, error: updateError } = await client
    .from("wallets")
    .update({
      balance: balanceAfter,
      updated_at: new Date().toISOString(),
      version: currentWallet.version + 1,
    })
    .eq("id", currentWallet.id)
    .eq("version", currentWallet.version)
    .select()
    .single();

  if (updateError) {
    console.error("Wallet update error:", updateError);
    throw new Error(
      "Failed to update wallet balance - concurrent modification detected"
    );
  }

  return {
    wallet: updatedWallet,
    transaction,
  };
};

// Get user wallet details
export const getUserWallet = async (req, res) => {
  try {
    const { user } = req;
    if (!user || !user.id) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    // Get or create wallet - select only necessary fields for better performance
    let { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("id, user_id, balance, is_frozen, frozen_reason, created_at, updated_at")
      .eq("user_id", user.id)
      .single();

    if (walletError && walletError.code === "PGRST116") {
      // Wallet doesn't exist, create one
      const { data: newWallet, error: createError } = await supabase
        .from("wallets")
        .insert([{ user_id: user.id, balance: 0.0 }])
        .select("id, user_id, balance, is_frozen, frozen_reason, created_at, updated_at")
        .single();

      if (createError) {
        console.error("Error creating wallet:", createError);
        return res
          .status(500)
          .json({ success: false, error: "Failed to create wallet" });
      }

      wallet = newWallet;
    } else if (walletError) {
      console.error("Error fetching wallet:", walletError);
      return res
        .status(500)
        .json({ success: false, error: "Failed to fetch wallet" });
    }

    // Return minimal response for faster transmission
    res.json({
      success: true,
      wallet: {
        id: wallet.id,
        balance: parseFloat(wallet.balance),
        is_frozen: wallet.is_frozen,
        frozen_reason: wallet.frozen_reason,
        created_at: wallet.created_at,
        updated_at: wallet.updated_at,
      },
    });
  } catch (error) {
    console.error("Error in getUserWallet:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Get wallet transaction history
export const getWalletTransactions = async (req, res) => {
  try {
    const { user } = req;
    const { page = 1, limit = 20, type } = req.query;

    if (!user || !user.id) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = supabase
      .from("wallet_transactions")
      .select("id, transaction_type, amount, balance_before, balance_after, description, created_at, status", { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (type) {
      query = query.eq("transaction_type", type);
    }

    const { data: transactions, error, count } = await query;

    if (error) {
      console.error("Error fetching transactions:", error);
      return res
        .status(500)
        .json({ success: false, error: "Failed to fetch transactions" });
    }

    res.json({
      success: true,
      transactions: transactions || [],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count || 0,
        pages: Math.ceil((count || 0) / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Error in getWalletTransactions:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Create Razorpay order for wallet topup
export const createWalletTopupOrder = async (req, res) => {
  try {
    const { user } = req;
    const { amount } = req.body;

    if (!user || !user.id) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
      return res
        .status(400)
        .json({ success: false, error: "Valid amount is required" });
    }

    const topupAmount = parseFloat(amount);

    // Minimum topup validation
    if (topupAmount < 1) {
      return res
        .status(400)
        .json({ success: false, error: "Minimum topup amount is ₹1" });
    }

    // Maximum topup validation
    if (topupAmount > 50000) {
      return res
        .status(400)
        .json({ success: false, error: "Maximum topup amount is ₹50,000" });
    }

    // Validate Razorpay credentials
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      console.error("Razorpay credentials not configured");
      return res.status(500).json({
        success: false,
        error: "Payment gateway not configured. Please contact support.",
      });
    }

    // console.log("Razorpay credentials check:", {
    //   key_id_present: !!process.env.RAZORPAY_KEY_ID,
    //   key_id_prefix: process.env.RAZORPAY_KEY_ID?.substring(0, 8),
    //   key_secret_present: !!process.env.RAZORPAY_KEY_SECRET,
    // });

    // Get user wallet
    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (walletError) {
      console.error("Error fetching wallet:", walletError);
      return res
        .status(500)
        .json({ success: false, error: "Wallet not found" });
    }

    if (wallet.is_frozen) {
      return res
        .status(400)
        .json({ success: false, error: "Wallet is frozen" });
    }

    // Create Razorpay order
    // Generate short receipt ID (max 40 chars for Razorpay)
    const userIdHash = crypto
      .createHash("md5")
      .update(user.id)
      .digest("hex")
      .substring(0, 8);
    const timestamp = Date.now().toString().slice(-10);
    const receipt = `wlt_${userIdHash}_${timestamp}`;

    const razorpayOrderOptions = {
      amount: Math.round(topupAmount * 100), // Convert to paisa
      currency: "INR",
      receipt: receipt, // Format: wlt_12ab34cd_1234567890 (max 28 chars)
      payment_capture: 1,
    };

    console.log("Creating Razorpay order with options:", {
      amount: razorpayOrderOptions.amount,
      currency: razorpayOrderOptions.currency,
      receipt: razorpayOrderOptions.receipt,
    });

    const razorpayOrder = await razorpay.orders.create(razorpayOrderOptions);

    // Store pending topup
    const { data: pendingTopup, error: topupError } = await supabase
      .from("wallet_topups_pending")
      .insert([
        {
          user_id: user.id,
          wallet_id: wallet.id,
          amount: topupAmount,
          razorpay_order_id: razorpayOrder.id,
          expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 minutes
        },
      ])
      .select()
      .single();

    if (topupError) {
      console.error("Error creating pending topup:", topupError);
      return res
        .status(500)
        .json({ success: false, error: "Failed to create topup order" });
    }

    res.json({
      success: true,
      order_id: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      receipt: razorpayOrder.receipt,
      pending_topup_id: pendingTopup.id,
    });
  } catch (error) {
    console.error("Error in createWalletTopupOrder:", error);
    
    // Log detailed Razorpay error information
    if (error.statusCode) {
      console.error("Razorpay API Error Details:", {
        statusCode: error.statusCode,
        error: error.error,
        description: error.error?.description,
        code: error.error?.code,
        field: error.error?.field,
        source: error.error?.source,
        step: error.error?.step,
        reason: error.error?.reason,
      });
      
      // Provide user-friendly error messages
      if (error.statusCode === 401) {
        return res.status(500).json({
          success: false,
          error: "Payment gateway authentication failed. Please contact support.",
          details: "Invalid Razorpay credentials configured on the server.",
        });
      }
      
      if (error.statusCode === 400) {
        return res.status(400).json({
          success: false,
          error: error.error?.description || "Invalid payment request",
        });
      }
    }
    
    res
      .status(500)
      .json({ success: false, error: "Failed to create topup order" });
  }
};

// Webhook to handle successful wallet topup
export const walletTopupWebhook = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      event,
    } = req.body;

    // Verify Razorpay signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      console.error("Invalid Razorpay signature");
      return res
        .status(400)
        .json({ success: false, error: "Invalid signature" });
    }

    // Get pending topup
    const { data: pendingTopup, error: topupError } = await supabase
      .from("wallet_topups_pending")
      .select("*")
      .eq("razorpay_order_id", razorpay_order_id)
      .eq("status", "PENDING")
      .single();

    if (topupError || !pendingTopup) {
      console.error("Pending topup not found:", razorpay_order_id);
      return res
        .status(404)
        .json({ success: false, error: "Topup order not found" });
    }

    // Check if already processed
    if (pendingTopup.status === "COMPLETED") {
      return res.json({ success: true, message: "Topup already processed" });
    }

    // Generate idempotency key
    const idempotencyKey = generateIdempotencyKey(
      pendingTopup.user_id,
      "TOPUP",
      pendingTopup.amount,
      razorpay_order_id
    );

    try {
      // Execute wallet topup transaction
      const { wallet, transaction } = await executeWalletTransaction(
        pendingTopup.user_id,
        "TOPUP",
        pendingTopup.amount,
        "TOPUP_ORDER",
        pendingTopup.id,
        `Wallet topup via Razorpay`,
        { razorpay_order_id, razorpay_payment_id },
        null,
        razorpay_order_id,
        razorpay_payment_id,
        idempotencyKey
      );

      // Update pending topup status
      await supabase
        .from("wallet_topups_pending")
        .update({
          status: "COMPLETED",
          razorpay_payment_id,
          razorpay_signature,
          completed_at: new Date().toISOString(),
        })
        .eq("id", pendingTopup.id);

      // Create notification
      await createNotificationHelper(
        pendingTopup.user_id,
        "Wallet Recharged Successfully",
        `Your wallet has been recharged with ₹${pendingTopup.amount}. Current balance: ₹${wallet.balance}`,
        "wallet_topup",
        transaction.id,
        "user"
      );

      console.log(
        `Wallet topup completed: User ${pendingTopup.user_id}, Amount: ${pendingTopup.amount}`
      );

      res.json({
        success: true,
        message: "Wallet topup completed successfully",
      });
    } catch (transactionError) {
      console.error("Error processing wallet topup:", transactionError);

      // Mark topup as failed
      await supabase
        .from("wallet_topups_pending")
        .update({
          status: "FAILED",
          failure_reason: transactionError.message,
        })
        .eq("id", pendingTopup.id);

      res
        .status(500)
        .json({ success: false, error: "Failed to process topup" });
    }
  } catch (error) {
    console.error("Error in walletTopupWebhook:", error);
    res
      .status(500)
      .json({ success: false, error: "Webhook processing failed" });
  }
};

// Spend from wallet (for checkout)
export const spendFromWallet = async (req, res) => {
  try {
    const { user } = req;
    const { amount, order_id, description = "Order payment" } = req.body;

    if (!user || !user.id) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
      return res
        .status(400)
        .json({ success: false, error: "Valid amount is required" });
    }

    if (!order_id) {
      return res
        .status(400)
        .json({ success: false, error: "Order ID is required" });
    }

    const spendAmount = parseFloat(amount);

    // Check if order exists
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, status")
      .eq("id", order_id)
      .eq("user_id", user.id)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }

    const idempotencyKey =
      req.headers["idempotency-key"] ||
      generateIdempotencyKey(user.id, "SPEND", spendAmount, order_id);

    // Check if transaction already exists
    const { data: existingTransaction } = await supabase
      .from("wallet_transactions")
      .select("*")
      .eq("idempotency_key", idempotencyKey)
      .single();

    if (existingTransaction) {
      return res.json({
        success: true,
        message: "Transaction already processed",
        transaction: existingTransaction,
      });
    }

    try {
      const { wallet, transaction } = await executeWalletTransaction(
        user.id,
        "SPEND",
        spendAmount,
        "ORDER",
        order_id,
        description,
        { order_id },
        null,
        null,
        null,
        idempotencyKey
      );

      // Create notification
      await createNotificationHelper(
        user.id,
        "Wallet Payment Successful",
        `₹${spendAmount} debited from wallet for order #${order_id}. Remaining balance: ₹${wallet.balance}`,
        "wallet_spend",
        transaction.id,
        "user"
      );

      res.json({
        success: true,
        transaction,
        remaining_balance: parseFloat(wallet.balance),
      });
    } catch (transactionError) {
      res.status(400).json({ success: false, error: transactionError.message });
    }
  } catch (error) {
    console.error("Error in spendFromWallet:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Process refund to wallet (called internally by refund system)
export const processRefundToWallet = async (req, res) => {
  try {
    const {
      user_id,
      amount,
      refund_request_id,
      description = "Order refund",
    } = req.body;

    if (!user_id || !amount || !refund_request_id) {
      return res.status(400).json({
        success: false,
        error: "User ID, amount, and refund request ID are required",
      });
    }

    const refundAmount = parseFloat(amount);

    if (refundAmount <= 0) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid refund amount" });
    }

    const idempotencyKey = generateIdempotencyKey(
      user_id,
      "REFUND",
      refundAmount,
      refund_request_id
    );

    // Check if refund already processed
    const { data: existingTransaction } = await supabase
      .from("wallet_transactions")
      .select("*")
      .eq("idempotency_key", idempotencyKey)
      .single();

    if (existingTransaction) {
      return res.json({
        success: true,
        message: "Refund already processed",
        transaction: existingTransaction,
      });
    }

    try {
      const { wallet, transaction } = await executeWalletTransaction(
        user_id,
        "REFUND",
        refundAmount,
        "REFUND_REQUEST",
        refund_request_id,
        description,
        { refund_request_id },
        null,
        null,
        null,
        idempotencyKey
      );

      // Create notification
      await createNotificationHelper(
        user_id,
        "Refund Credited to Wallet",
        `₹${refundAmount} has been credited to your wallet as refund. Current balance: ₹${wallet.balance}`,
        "wallet_refund",
        transaction.id,
        "user"
      );

      res.json({
        success: true,
        transaction,
        wallet_balance: parseFloat(wallet.balance),
      });
    } catch (transactionError) {
      res.status(400).json({ success: false, error: transactionError.message });
    }
  } catch (error) {
    console.error("Error in processRefundToWallet:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};
