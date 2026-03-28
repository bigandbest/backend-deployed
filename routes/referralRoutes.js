// routes/referralRoutes.js
import express from "express";
import {
  getPublicConfig,
  getProfile,
  generateCode,
  getStats,
  getReferralHistory,
  getRewards,
  getWallet,
  getWalletTransactions,
  requestWithdrawal,
  getWithdrawals,
  getWithdrawalById,
  applyCode,
  validateCode,
  getShareContent,
  getNotifications,
  markNotificationRead,
  spendBalance,
} from "../controller/referralController.js";
import { authenticateToken } from "../middleware/authenticate.js";

const router = express.Router();

// Public — no auth required
router.get("/public-config", getPublicConfig);

// All routes below require authentication
router.use(authenticateToken);

// Profile & Stats
router.get("/profile", getProfile);
router.post("/profile/generate-code", generateCode);
router.get("/stats", getStats);

// Referral History
router.get("/history", getReferralHistory);

// Rewards
router.get("/rewards", getRewards);

// Wallet
router.get("/wallet", getWallet);
router.get("/wallet/transactions", getWalletTransactions);
router.post("/wallet/spend", spendBalance);

// Withdrawals
router.post("/withdraw", requestWithdrawal);
router.get("/withdrawals", getWithdrawals);
router.get("/withdrawals/:id", getWithdrawalById);

// Code management
router.post("/apply-code", applyCode);
router.post("/validate-code", validateCode);

// Share content
router.get("/share-content", getShareContent);

// Notifications
router.get("/notifications", getNotifications);
router.put("/notifications/:id/read", markNotificationRead);

export default router;
