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
import { authenticateAdmin } from "../middleware/authenticate.js";

const router = express.Router();

// Admin routes (all require admin authentication)
router.get("/", authenticateAdmin, getAllWallets); // GET /api/admin/wallets
router.get("/transactions", authenticateAdmin, getWalletTransactionsAdmin); // GET /api/admin/wallets/transactions
router.get("/audit-logs", authenticateAdmin, getWalletAuditLogs); // GET /api/admin/wallets/audit-logs

router.get("/:userId", authenticateAdmin, getUserWalletDetails); // GET /api/admin/wallets/:userId
router.post("/:userId/credit", authenticateAdmin, manualCreditWallet); // POST /api/admin/wallets/:userId/credit
router.post("/:userId/debit", authenticateAdmin, manualDebitWallet); // POST /api/admin/wallets/:userId/debit
router.post("/:userId/freeze", authenticateAdmin, freezeWallet); // POST /api/admin/wallets/:userId/freeze
router.post("/:userId/unfreeze", authenticateAdmin, unfreezeWallet); // POST /api/admin/wallets/:userId/unfreeze

export default router;
