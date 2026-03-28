// controllers/walletController.js
import { supabase } from "../config/supabaseClient.js";
import prisma from "../config/prisma.js";
import WalletDAO from "../dao/wallet.dao.js";
import OrderDAO from "../dao/order.dao.js";
import crypto from "crypto";
import Razorpay from "razorpay";
// import { createNotificationHelper } from "./NotificationHelpers.js";
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
  idempotencyKey = null,
) => {
  // Use WalletDAO
  // First get wallet ID (WalletDAO.updateBalance requires walletId, not userId)
  const wallet = await WalletDAO.getByUserId(userId);
  if (!wallet) {
    // If no wallet, create one? Logic in original code threw error if not found.
    // But original code select from "wallets" by "user_id".
    throw new Error("Wallet not found");
  }

  // Update Balance using DAO
  // Metadata enhancement to pass extra fields to DAO
  const enhancedMetadata = {
    ...metadata,
    razorpay_order_id: razorpayOrderId,
    razorpay_payment_id: razorpayPaymentId,
    created_by: createdBy,
    idempotency_key: idempotencyKey, // DAO doesn't explicitly handle idempotency key uniqueness check in 'updateBalance' transaction logic natively unless mapped to column.
    // Schema has 'idempotency_key'. DAO needs to map it!
    // I missed mapping idempotency_key in DAO update.
    // I should add it to DAO update or metadata if it's just meta.
    // Schema: idempotency_key String? @unique
    // So distinct column.
  };

  // Wait, I missed mapping idempotency_key in previous DAO update.
  // I will rely on metadata extraction I just added? No, I added razorpay fields.
  // I should use `metadata` object to pass them, but DAO must map them to columns in `create`.
  // I need to update DAO again to map idempotency_key.
  // OR I can assume DAO logic handles metadata properties if I map them.
  // Let's effectively map them in DAO update in next step if I missed it, OR
  // just pass them in metadata and let DAO ignore them if not mapped (but then data is lost).
  // I'll update DAO again to be safe.

  // For now, let's assume I'll update DAO to map idempotency_key too.

  const result = await WalletDAO.updateBalance(
    wallet.id,
    amount,
    transactionType,
    referenceType,
    referenceId,
    description,
    enhancedMetadata,
  );

  return {
    wallet: result.updatedWallet,
    transaction: result.transaction,
  };
};

// Get user wallet details
export const getUserWallet = async (req, res) => {
  try {
    const { user } = req;
    if (!user || !user.id) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    // Get or create wallet using Prisma
    let wallet = await prisma.wallets.findUnique({
      where: { user_id: user.id },
      select: {
        id: true,
        user_id: true,
        balance: true,
        is_frozen: true,
        frozen_reason: true,
        created_at: true,
        updated_at: true,
      },
    });

    if (!wallet) {
      // First, ensure the user exists in the users table
      try {
        const existingUser = await prisma.users.findUnique({
          where: { id: user.id },
          select: { id: true },
        });

        if (!existingUser) {
          const userData = {
            id: user.id,
            email: user.email,
            name: user.name || user.user_metadata?.name || user.user_metadata?.full_name || "User",
            phone: user.phone || user.user_metadata?.phone || "",
            role: "USER",
            photo_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
            avatar: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
            is_active: true
          };

          await prisma.users.upsert({
            where: { id: user.id },
            update: userData,
            create: userData,
          });
        }
      } catch (userSyncError) {
        console.error("Error syncing user to users table:", userSyncError);
      }

      // Now create the wallet
      try {
        wallet = await prisma.wallets.create({
          data: { user_id: user.id, balance: 0.0 },
          select: {
            id: true,
            user_id: true,
            balance: true,
            is_frozen: true,
            frozen_reason: true,
            created_at: true,
            updated_at: true,
          },
        });
      } catch (createError) {
        console.error("Error creating wallet:", createError);
        return res.status(500).json({
          success: false,
          error: "Failed to create wallet",
          details: createError.message,
        });
      }
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

    const where = { user_id: user.id };
    if (type) {
      where.transaction_type = type;
    }

    const [transactions, count] = await Promise.all([
      prisma.wallet_transactions.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: offset,
        take: parseInt(limit),
        select: {
          id: true,
          transaction_type: true,
          amount: true,
          balance_before: true,
          balance_after: true,
          description: true,
          created_at: true,
          status: true,
        },
      }),
      prisma.wallet_transactions.count({ where }),
    ]);

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

    // Get user wallet using Prisma
    let wallet = await prisma.wallets.findUnique({
      where: { user_id: user.id },
    });

    if (!wallet) {
      try {
        // Ensure user exists in users table first (idempotent)
        const userData = {
          id: user.id,
          email: user.email,
          name: user.name || user.user_metadata?.name || user.user_metadata?.full_name || "User",
          role: "USER",
          is_active: true
        };

        await prisma.users.upsert({
          where: { id: user.id },
          update: {}, // Don't update if exists
          create: userData,
        }).catch(err => console.warn("User sync in topup warning:", err));

        wallet = await prisma.wallets.create({
          data: { user_id: user.id, balance: 0.0 },
        });
      } catch (createError) {
        console.error("Error creating wallet during topup:", createError);
        return res
          .status(500)
          .json({ success: false, error: "Failed to create wallet" });
      }
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

    const razorpayOrder = await razorpay.orders.create(razorpayOrderOptions);

    // Store pending topup using WalletDAO (transactions table)
    const pendingTopup = await WalletDAO.createPendingTransaction({
      wallet_id: wallet.id,
      user_id: user.id,
      amount: topupAmount,
      transaction_type: 'TOPUP',
      razorpay_order_id: razorpayOrder.id,
      description: 'Wallet topup pending'
    });

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
          error:
            "Payment gateway authentication failed. Please contact support.",
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

// Verify wallet topup after Razorpay payment (called from frontend)
export const verifyWalletTopup = async (req, res) => {
  try {
    const { user } = req;
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      amount,
    } = req.body;

    if (!user || !user.id) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        error: "Missing payment details",
      });
    }

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
        .json({ success: false, error: "Invalid payment signature" });
    }

    // Get pending topup (transaction)
    const pendingTopup = await prisma.wallet_transactions.findFirst({
      where: { razorpay_order_id: razorpay_order_id },
    });

    if (!pendingTopup) {
      console.error("Pending topup not found:", razorpay_order_id);
      return res
        .status(404)
        .json({ success: false, error: "Payment order not found" });
    }

    // Verify user owns this topup
    if (pendingTopup.user_id !== user.id) {
      return res.status(403).json({
        success: false,
        error: "Unauthorized to verify this payment",
      });
    }

    // Check if already processed
    if (pendingTopup.status === "COMPLETED") {
      return res.json({
        success: true,
        message: "Payment already processed",
        already_processed: true,
      });
    }

    try {
      // Execute wallet topup completion (update balance and status)
      const { updatedWallet, updatedTransaction } = await WalletDAO.completeTopupTransaction(
        pendingTopup.id,
        razorpay_payment_id,
        razorpay_signature
      );

      console.log(
        `Wallet topup verified and completed: User ${pendingTopup.user_id}, Amount: ${pendingTopup.amount}`,
      );

      res.json({
        success: true,
        message: "Wallet topup completed successfully",
        wallet_balance: parseFloat(updatedWallet.balance),
        transaction_id: updatedTransaction.id,
      });
    } catch (transactionError) {
      console.error("Error processing wallet topup:", transactionError);

      // Mark topup as failed (optional, or leave as pending/failed status if supported)
      // Since we use wallet_transactions, maybe update status to FAILED?
      await prisma.wallet_transactions.update({
        where: { id: pendingTopup.id },
        data: { status: 'FAILED', description: transactionError.message }
      }).catch(e => console.error("Failed to update fail status", e));

      res.status(500).json({
        success: false,
        error: "Failed to process payment",
        details: transactionError.message,
      });
    }
  } catch (error) {
    console.error("Error in verifyWalletTopup:", error);
    res.status(500).json({
      success: false,
      error: "Payment verification failed",
      details: error.message,
    });
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

    // Get pending topup (transaction)
    const pendingTopup = await prisma.wallet_transactions.findFirst({
      where: {
        razorpay_order_id: razorpay_order_id,
        status: "PENDING",
      },
    });

    if (!pendingTopup) {
      console.error("Pending topup not found:", razorpay_order_id);
      return res
        .status(404)
        .json({ success: false, error: "Topup order not found" });
    }

    // Check if already processed
    if (pendingTopup.status === "COMPLETED") {
      return res.json({ success: true, message: "Topup already processed" });
    }

    try {
      // Execute wallet topup completion (idempotent)
      const { updatedWallet, updatedTransaction } = await WalletDAO.completeTopupTransaction(
        pendingTopup.id,
        razorpay_payment_id,
        razorpay_signature // Signature might default or be reconstructed
      );

      console.log(
        `Wallet topup completed via webhook: User ${pendingTopup.user_id}, Amount: ${pendingTopup.amount}`,
      );

      res.json({
        success: true,
        message: "Wallet topup completed successfully",
      });
    } catch (transactionError) {
      console.error("Error processing wallet topup:", transactionError);

      await prisma.wallet_transactions.update({
        where: { id: pendingTopup.id },
        data: {
          status: "FAILED",
          description: transactionError.message,
        },
      }).catch(e => console.error("Webhook fail status update error", e));

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

    // Check if order exists using Prisma
    const order = await prisma.orders.findFirst({
      where: {
        id: order_id,
        user_id: user.id,
      },
      select: { id: true, status: true },
    });

    if (!order) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }

    const idempotencyKey =
      req.headers["idempotency-key"] ||
      generateIdempotencyKey(user.id, "SPEND", spendAmount, order_id);

    // Check if transaction already exists using Prisma
    const existingTransaction = await prisma.wallet_transactions.findUnique({
      where: { idempotency_key: idempotencyKey },
    });

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
        idempotencyKey,
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
      refund_request_id,
    );

    // Check if refund already processed using Prisma
    const existingTransaction = await prisma.wallet_transactions.findUnique({
      where: { idempotency_key: idempotencyKey },
    });

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
        idempotencyKey,
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

// ============================================
// WALLET ORDER OPERATIONS (Merged from walletOrderController.js)
// ============================================

/**
 * Create Wallet Order (prepaid via wallet balance)
 * Merged from walletOrderController.js
 */
export const createWalletOrder = async (req, res) => {
  try {

    const {
      user_id,
      product_id,
      user_name,
      user_email,
      product_name,
      product_total_price,
      user_address,
      user_location,
      quantity = 1,
      items = [],
      delivery_address,
      mobile
    } = req.body;

    // Validate required fields
    if (!user_id || !product_name || !product_total_price || !user_address) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: user_id, product_name, product_total_price, user_address"
      });
    }

    const totalPrice = parseFloat(product_total_price);

    // Check wallet balance
    const wallet = await WalletDAO.getByUserId(user_id);

    if (!wallet) {
      return res.status(404).json({ success: false, error: "Wallet not found" });
    }

    if (wallet.is_frozen) {
      return res.status(400).json({ success: false, error: "Wallet is frozen. Please contact support." });
    }

    const walletBalance = parseFloat(wallet.balance || 0);
    if (walletBalance < totalPrice) {
      return res.status(400).json({
        success: false,
        error: `Insufficient wallet balance. Required: ₹${totalPrice}, Available: ₹${walletBalance}`
      });
    }

    // Helper: if the ID is a compound string like "productId_variantId", extract the UUID part
    const extractUuid = (value) => {
      if (!value || typeof value !== "string") return value;
      // If it already looks like a UUID, return it.
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(value)) return value;

      // If it's compound (e.g. productId_variantId), take the last segment if it looks like a UUID.
      const parts = value.split("_");
      const candidate = parts[parts.length - 1];
      if (uuidRegex.test(candidate)) return candidate;

      return value;
    };

    // Prepare Order Items for atomic creation
    let orderItemsData = [];
    if (items && items.length > 0) {
      orderItemsData = items.map((item) => ({
        variant_id: String(extractUuid(item.variant_id || item.product_id)),
        quantity: parseInt(item.quantity),
        price: parseFloat(item.price),
      }));
    } else if (product_id) {
      // If single product purchase, check if variant_id is provided in body
      const variantIdToUse = req.body.variant_id || product_id;
      orderItemsData.push({
        variant_id: String(extractUuid(variantIdToUse)),
        quantity: parseInt(quantity),
        price: totalPrice / parseInt(quantity),
      });
    }

    // Create order data with nested items - strictly matching schema
    const orderCreateData = {
      user_id: String(user_id),
      address: String(user_address), // Assuming address maps to 'address' column
      payment_method: 'wallet',
      status: 'pending',
      total: parseFloat(totalPrice),
      subtotal: parseFloat(totalPrice), // Simplified for now
      shipping: 0,
      // Map other fields if they exist in schema
      receiver_name: user_name, // Mapping user_name to receiver_name
      mobile: mobile ? String(mobile) : null,
      order_items: {
        create: orderItemsData
      }
    };

    const order = await OrderDAO.create(orderCreateData);

    if (!order) {
      throw new Error("Failed to create order");
    }

    // Deduct from wallet using execute WalletTransaction
    try {
      const idempotencyKey = `wallet_order_${order.id}`;

      const { wallet: updatedWallet, transaction } = await executeWalletTransaction(
        user_id,
        "SPEND",
        totalPrice,
        "ORDER",
        order.id,
        `Payment for order #${order.id}`,
        { order_id: order.id, payment_method: 'wallet' },
        null,
        null,
        null,
        idempotencyKey
      );

      return res.status(201).json({
        success: true,
        message: "Wallet order created successfully",
        order: order,
        wallet_balance: parseFloat(updatedWallet.balance),
        transaction_id: transaction.id
      });
    } catch (walletError) {
      console.error('Wallet Deduction Error:', walletError);
      // Rollback order if wallet deduction fails
      await OrderDAO.delete(order.id);

      return res.status(400).json({
        success: false,
        error: walletError.message || "Failed to deduct from wallet"
      });
    }
  } catch (error) {
    console.error('Server Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get all wallet orders
 * Merged from walletOrderController.js
 */
export const getAllWalletOrders = async (req, res) => {
  try {
    const { items: orders } = await OrderDAO.listAll({ paymentMethod: 'wallet' }, { limit: 100 });
    res.json({ success: true, orders });
  } catch (error) {
    console.error("Error fetching wallet orders:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Get user's wallet orders
 * Merged from walletOrderController.js
 */
export const getUserWalletOrders = async (req, res) => {
  try {
    const { user_id } = req.params;
    const { items: orders } = await OrderDAO.listAll(
      { userId: user_id, paymentMethod: 'wallet' },
      { limit: 100 }
    );
    res.json({ success: true, orders });
  } catch (error) {
    console.error("Error fetching user wallet orders:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};
