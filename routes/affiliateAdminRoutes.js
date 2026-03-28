import express from "express";
import { authenticateToken } from "../middleware/authenticate.js";
import { requireAdmin } from "../middleware/authorize.js";

import {
  getConfig,
  updateConfig,
  getCommissionRates,
  upsertCommissionRate,
  deleteCommissionRate,
  listApplications,
  getApplication,
  approveApplication,
  rejectApplication,
  listAffiliates,
  getAffiliate,
  updateAffiliate,
  listOrders,
  approveOrderCommission,
  cancelOrderCommission,
  listCommissions,
  listPayouts,
  updatePayout,
  getAdminDashboard,
} from "../controller/affiliateAdminController.js";

const router = express.Router();
router.use(authenticateToken, requireAdmin);

// Dashboard
router.get("/dashboard", getAdminDashboard);

// Config
router.get("/config", getConfig);
router.put("/config", updateConfig);

// Commission rates
router.get("/commission-rates", getCommissionRates);
router.post("/commission-rates", upsertCommissionRate);
router.delete("/commission-rates/:id", deleteCommissionRate);

// Applications
router.get("/applications", listApplications);
router.get("/applications/:id", getApplication);
router.post("/applications/:id/approve", approveApplication);
router.post("/applications/:id/reject", rejectApplication);

// Affiliate profiles
router.get("/affiliates", listAffiliates);
router.get("/affiliates/:id", getAffiliate);
router.put("/affiliates/:id", updateAffiliate);

// Orders
router.get("/orders", listOrders);
router.post("/orders/:id/approve-commission", approveOrderCommission);
router.post("/orders/:id/cancel-commission", cancelOrderCommission);

// Commissions
router.get("/commissions", listCommissions);

// Payouts
router.get("/payouts", listPayouts);
router.put("/payouts/:id", updatePayout);

export default router;
