import express from "express";
import { authenticateToken, authenticateTokenOptional } from "../middleware/authenticate.js";

import {
  applyForAffiliate,
  getApplicationStatus,
} from "../controller/affiliateApplicationController.js";

import {
  getAffiliateProfile,
  updateAffiliateProfile,
  getAffiliateDashboard,
  getCommissionRates,
  getLinks,
  generateLink,
  deactivateLink,
  getAffiliateOrders,
  getAffiliateCommissions,
  getAffiliatePayouts,
  requestPayout,
  browseProducts,
  browseCategories,
} from "../controller/affiliateDashboardController.js";

import {
  trackClick,
  recordRefClick,
  convertOrder,
} from "../controller/affiliateTrackingController.js";

const router = express.Router();

// ─── PUBLIC / SEMI-PUBLIC ──────────────────────────────────────────────────
router.get("/track/:linkCode", authenticateTokenOptional, trackClick);

// ─── AUTHENTICATED (any user can apply) ───────────────────────────────────
router.post("/apply", authenticateToken, applyForAffiliate);
router.get("/application-status", authenticateToken, getApplicationStatus);

// Internal – called by order placement flow
router.post("/record-click", authenticateTokenOptional, recordRefClick);
router.post("/convert", convertOrder); // called internally, no user auth needed

// ─── AFFILIATE DASHBOARD (approved affiliates only) ──────────────────────
router.get("/profile", authenticateToken, getAffiliateProfile);
router.put("/profile", authenticateToken, updateAffiliateProfile);
router.get("/dashboard", authenticateToken, getAffiliateDashboard);
router.get("/commission-rates", authenticateToken, getCommissionRates);

// Links
router.get("/links", authenticateToken, getLinks);
router.post("/links/generate", authenticateToken, generateLink);
router.delete("/links/:id", authenticateToken, deactivateLink);

// Orders & commissions
router.get("/orders", authenticateToken, getAffiliateOrders);
router.get("/commissions", authenticateToken, getAffiliateCommissions);

// Payouts
router.get("/payouts", authenticateToken, getAffiliatePayouts);
router.post("/payouts/request", authenticateToken, requestPayout);

// Product catalog browser
router.get("/products", authenticateToken, browseProducts);
router.get("/categories", authenticateToken, browseCategories);

export default router;
