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

// ... (keeping all existing functions - executeWalletTransaction, getUserWallet, etc.)

// NEW: Verify wallet topup payment and credit wallet
export const verifyWalletTopup = async (req, res) => {
  try {
    const { user } = req;
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    if (!user || !user.id) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
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

    // Get pending topup
    const { data: pendingTopup, error: topupError } = await supabase
      .from("wallet_topups_pending")
      .select("*")
      .eq("razorpay_order_id", razorpay_order_id)
      .eq("user_id", user.id)
      .single();

    if (topupError || !pendingTopup) {
      console.error("Pending topup not found:", razorpay_order_id);
      return res
        .status(404)
        .json({ success: false, error: "Topup order not found" });
    }

    // Check if already processed
    if (pendingTopup.status === "COMPLETED") {
      return res.json({ 
        success: true, 
        message: "Topup already processed",
        already_processed: true 
      });
    }

    // Generate idempotency key
    const idempotencyKey = generateIdempotencyKey(
      user.id,
      "TOPUP",
      pendingTopup.amount,
      razorpay_order_id
    );

    try {
      // Execute wallet topup transaction
      const { wallet, transaction } = await executeWalletTransaction(
        user.id,
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
        user.id,
        "Wallet Recharged Successfully",
        `Your wallet has been recharged with ₹${pendingTopup.amount}. Current balance: ₹${wallet.balance}`,
        "wallet_topup",
        transaction.id,
        "user"
      );

      console.log(
        `Wallet topup completed: User ${user.id}, Amount: ${pendingTopup.amount}, New Balance: ${wallet.balance}`
      );

      res.json({
        success: true,
        message: "Wallet topup completed successfully",
        wallet: {
          balance: wallet.balance,
          amount_added: pendingTopup.amount,
        },
        transaction: {
          id: transaction.id,
          amount: transaction.amount,
          balance_after: transaction.balance_after,
        },
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
    console.error("Error in verifyWalletTopup:", error);
    res
      .status(500)
      .json({ success: false, error: "Payment verification failed" });
  }
};
