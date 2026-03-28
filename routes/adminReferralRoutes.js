// routes/adminReferralRoutes.js
import express from "express";
import {
  getDashboard,
  getConfig,
  updateConfig,
  getAnalytics,
  listUsers,
  getUserDetail,
  blockUser,
  unblockUser,
  deactivateCode,
  reactivateCode,
  listTransactions,
  getTransactionDetail,
  listRewards,
  manualCreditReward,
  extendRewardExpiry,
  cancelReward,
  listWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
  processWithdrawal,
  listFraudLogs,
  reviewFraudLog,
  listActivityLogs,
  exportReport,
  listCampaigns,
  createCampaign,
  updateCampaign,
  deleteCampaign,
} from "../controller/adminReferralController.js";
import { authenticateToken } from "../middleware/authenticate.js";
import { requireAdmin } from "../middleware/authorize.js";

const router = express.Router();

// All admin routes require authentication + admin role
router.use(authenticateToken, requireAdmin);

// Dashboard & Analytics
router.get("/dashboard", getDashboard);
router.get("/analytics", getAnalytics);

// Configuration
router.get("/config", getConfig);
router.put("/config", updateConfig);

// User Management
router.get("/users", listUsers);
router.get("/users/:id", getUserDetail);
router.put("/users/:id/block", blockUser);
router.put("/users/:id/unblock", unblockUser);
router.put("/users/:id/deactivate-code", deactivateCode);
router.put("/users/:id/reactivate-code", reactivateCode);

// Transactions
router.get("/transactions", listTransactions);
router.get("/transactions/:id", getTransactionDetail);

// Rewards
router.get("/rewards", listRewards);
router.post("/rewards/credit", manualCreditReward);
router.put("/rewards/:id/extend", extendRewardExpiry);
router.put("/rewards/:id/cancel", cancelReward);

// Withdrawals
router.get("/withdrawals", listWithdrawals);
router.put("/withdrawals/:id/approve", approveWithdrawal);
router.put("/withdrawals/:id/reject", rejectWithdrawal);
router.put("/withdrawals/:id/process", processWithdrawal);

// Fraud Logs
router.get("/fraud-logs", listFraudLogs);
router.put("/fraud-logs/:id/review", reviewFraudLog);

// Activity Logs
router.get("/activity-logs", listActivityLogs);

// Reports
router.get("/reports/export", exportReport);

// Campaigns
router.get("/campaigns", listCampaigns);
router.post("/campaigns", createCampaign);
router.put("/campaigns/:id", updateCampaign);
router.delete("/campaigns/:id", deleteCampaign);

export default router;
