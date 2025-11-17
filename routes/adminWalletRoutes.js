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
import authenticate from "../middleware/authenticate.js";

const router = express.Router();

// Admin routes (all require admin authentication)
router.get("/", authenticate, getAllWallets); // GET /api/admin/wallets
router.get("/transactions", authenticate, getWalletTransactionsAdmin); // GET /api/admin/wallets/transactions
router.get("/audit-logs", authenticate, getWalletAuditLogs); // GET /api/admin/wallets/audit-logs

router.get("/:userId", authenticate, getUserWalletDetails); // GET /api/admin/wallets/:userId
router.post("/:userId/credit", authenticate, manualCreditWallet); // POST /api/admin/wallets/:userId/credit
router.post("/:userId/debit", authenticate, manualDebitWallet); // POST /api/admin/wallets/:userId/debit
router.post("/:userId/freeze", authenticate, freezeWallet); // POST /api/admin/wallets/:userId/freeze
router.post("/:userId/unfreeze", authenticate, unfreezeWallet); // POST /api/admin/wallets/:userId/unfreeze

export default router;
