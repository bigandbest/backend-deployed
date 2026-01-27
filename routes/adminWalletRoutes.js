// routes/adminWalletRoutes.js
import express from "express";
import {
  getAllWallets,
  getUserWalletDetails,
  manualCreditWallet,
  manualDebitWallet,
  freezeWallet,
  unfreezeWallet,
  getWalletTransactionsAdmin,
  getWalletAuditLogs,
} from "../controller/adminWalletController.js";
import { authenticateToken } from "../middleware/authenticate.js";
import { requireAdmin } from "../middleware/authorize.js";

const router = express.Router();

// Admin routes (all require admin authentication)
router.get("/", authenticateToken, requireAdmin, getAllWallets); // GET /api/admin/wallets
router.get("/transactions", authenticateToken, requireAdmin, getWalletTransactionsAdmin); // GET /api/admin/wallets/transactions
router.get("/audit-logs", authenticateToken, requireAdmin, getWalletAuditLogs); // GET /api/admin/wallets/audit-logs

router.get("/:userId", authenticateToken, requireAdmin, getUserWalletDetails); // GET /api/admin/wallets/:userId
router.post("/:userId/credit", authenticateToken, requireAdmin, manualCreditWallet); // POST /api/admin/wallets/:userId/credit
router.post("/:userId/debit", authenticateToken, requireAdmin, manualDebitWallet); // POST /api/admin/wallets/:userId/debit
router.post("/:userId/freeze", authenticateToken, requireAdmin, freezeWallet); // POST /api/admin/wallets/:userId/freeze
router.post("/:userId/unfreeze", authenticateToken, requireAdmin, unfreezeWallet); // POST /api/admin/wallets/:userId/unfreeze

export default router;
