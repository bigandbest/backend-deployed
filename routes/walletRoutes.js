// routes/walletRoutes.js
import express from "express";
import {
  getUserWallet,
  getWalletTransactions,
  createWalletTopupOrder,
  verifyWalletTopup,
  walletTopupWebhook,
  spendFromWallet,
  processRefundToWallet,
} from "../controller/walletController.js";
import { authenticateToken } from "../middleware/authenticate.js";

const router = express.Router();

// User wallet routes
router.get("/", authenticateToken, getUserWallet); // GET /api/wallet
router.get("/transactions", authenticateToken, getWalletTransactions); // GET /api/wallet/transactions
router.post("/topup", authenticateToken, createWalletTopupOrder); // POST /api/wallet/topup
router.post("/topup/verify", authenticateToken, verifyWalletTopup); // POST /api/wallet/topup/verify
router.post("/spend", authenticateToken, spendFromWallet); // POST /api/wallet/spend

// Internal route for refunds (called by refund system)
router.post("/refund", processRefundToWallet); // POST /api/wallet/refund

// Webhook route (no auth required)
router.post("/webhook", walletTopupWebhook); // POST /api/wallet/webhook

export default router;
