import affiliateDAO from "../dao/affiliate.dao.js";
import { approveCommission, generatePayoutNumber } from "../services/affiliateService.js";
import { _createProfileFromApplication } from "./affiliateApplicationController.js";
import * as referralService from "../services/referralService.js";
import prisma from "../config/prisma.js";

// Q4/Q9: affiliate admin actions had no audit trail — reuses the same generic
// referral_admin_logs table the Q12 loss-absorption event already writes to.
const audit = (req, action, description, entityType, entityId, previousValue, newValue) =>
  referralService.logAdminAction(req.user.id, req.user.email, req.user.name, action, description, entityType, entityId, previousValue, newValue, req.ip);

// ─── CONFIG ──────────────────────────────────────────────────────────────────

// GET /api/admin/affiliate/config
export const getConfig = async (req, res) => {
  try {
    const config = await affiliateDAO.getConfig();
    return res.json({ success: true, data: config });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// PUT /api/admin/affiliate/config
export const updateConfig = async (req, res) => {
  try {
    const previous = await affiliateDAO.getConfig();
    const config = await affiliateDAO.updateConfig(req.body);
    await audit(req, "AFFILIATE_CONFIG_UPDATED", "Affiliate program configuration changed", "affiliate_configs", config.id, previous, req.body);
    return res.json({ success: true, data: config });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// ─── CATEGORY COMMISSIONS ────────────────────────────────────────────────────

// GET /api/admin/affiliate/commission-rates
export const getCommissionRates = async (req, res) => {
  try {
    const [rates, categories] = await Promise.all([
      affiliateDAO.getCategoryCommissions(),
      prisma.categories.findMany({
        where: { active: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);

    // Map commission rates to categories
    const ratesMap = {};
    for (const r of rates) ratesMap[r.category_id] = r;

    const result = categories.map((cat) => ({
      ...cat,
      commission: ratesMap[cat.id] || null,
    }));

    return res.json({ success: true, data: result });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// POST /api/admin/affiliate/commission-rates
export const upsertCommissionRate = async (req, res) => {
  try {
    const { category_id, category_name, category_level, base_commission_rate, is_active } = req.body;
    if (!category_id || base_commission_rate === undefined) {
      return res.status(400).json({ success: false, error: "category_id and base_commission_rate required" });
    }

    const rate = await affiliateDAO.upsertCategoryCommission(category_id, {
      category_name,
      category_level,
      base_commission_rate: parseFloat(base_commission_rate),
      is_active: is_active !== false,
      updated_by: req.user.id,
    });

    await audit(req, "AFFILIATE_COMMISSION_RATE_UPSERTED", `Commission rate set for category ${category_name || category_id}`, "affiliate_category_commissions", rate.id, null, rate);

    return res.json({ success: true, data: rate });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// DELETE /api/admin/affiliate/commission-rates/:id
export const deleteCommissionRate = async (req, res) => {
  try {
    await affiliateDAO.deleteCategoryCommission(req.params.id);
    await audit(req, "AFFILIATE_COMMISSION_RATE_DELETED", "Category commission rate removed", "affiliate_category_commissions", req.params.id, null, null);
    return res.json({ success: true, message: "Commission rate removed" });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// ─── APPLICATIONS ────────────────────────────────────────────────────────────

// GET /api/admin/affiliate/applications
export const listApplications = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const result = await affiliateDAO.listApplications({
      status,
      page: parseInt(page),
      limit: parseInt(limit),
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// GET /api/admin/affiliate/applications/:id
export const getApplication = async (req, res) => {
  try {
    const application = await affiliateDAO.getApplicationById(req.params.id);
    if (!application) return res.status(404).json({ success: false, error: "Not found" });
    return res.json({ success: true, data: application });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// POST /api/admin/affiliate/applications/:id/approve
export const approveApplication = async (req, res) => {
  try {
    const application = await affiliateDAO.getApplicationById(req.params.id);
    if (!application) return res.status(404).json({ success: false, error: "Not found" });
    if (application.status !== "PENDING" && application.status !== "UNDER_REVIEW") {
      return res.status(400).json({ success: false, error: "Application already processed" });
    }

    // Check no existing profile
    const existingProfile = await affiliateDAO.getProfileByUserId(application.user_id);
    if (existingProfile) {
      return res.status(400).json({ success: false, error: "Affiliate profile already exists" });
    }

    await affiliateDAO.updateApplicationStatus(application.id, {
      status: "APPROVED",
      reviewed_by: req.user.id,
      reviewed_at: new Date(),
      review_notes: req.body.review_notes || null,
    });

    const profile = await _createProfileFromApplication(application, application.full_name);

    await audit(req, "AFFILIATE_APPLICATION_APPROVED", `Approved affiliate application for ${application.full_name}`, "affiliate_applications", application.id, { status: application.status }, { status: "APPROVED" });

    return res.json({
      success: true,
      message: "Application approved",
      data: { affiliateCode: profile.affiliate_code, profileId: profile.id },
    });
  } catch (err) {
    console.error("approveApplication error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// POST /api/admin/affiliate/applications/:id/reject
export const rejectApplication = async (req, res) => {
  try {
    const { rejection_reason, review_notes } = req.body;
    if (!rejection_reason) {
      return res.status(400).json({ success: false, error: "rejection_reason is required" });
    }

    const application = await affiliateDAO.getApplicationById(req.params.id);
    if (!application) return res.status(404).json({ success: false, error: "Not found" });

    await affiliateDAO.updateApplicationStatus(application.id, {
      status: "REJECTED",
      reviewed_by: req.user.id,
      reviewed_at: new Date(),
      review_notes,
      rejection_reason,
    });

    await audit(req, "AFFILIATE_APPLICATION_REJECTED", `Rejected affiliate application: ${rejection_reason}`, "affiliate_applications", application.id, { status: application.status }, { status: "REJECTED", rejection_reason });

    return res.json({ success: true, message: "Application rejected" });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// ─── AFFILIATE PROFILES ───────────────────────────────────────────────────────

// GET /api/admin/affiliate/affiliates
export const listAffiliates = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const result = await affiliateDAO.listProfiles({
      status,
      page: parseInt(page),
      limit: parseInt(limit),
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// GET /api/admin/affiliate/affiliates/:id
export const getAffiliate = async (req, res) => {
  try {
    const profile = await affiliateDAO.getProfileById(req.params.id);
    if (!profile) return res.status(404).json({ success: false, error: "Not found" });
    return res.json({ success: true, data: profile });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// PUT /api/admin/affiliate/affiliates/:id
export const updateAffiliate = async (req, res) => {
  try {
    const allowed = ["status", "tier_name", "tier_bonus", "is_blocked", "block_reason"];
    const data = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) data[key] = req.body[key];
    }

    const previous = await affiliateDAO.getProfileById(req.params.id);
    const updated = await affiliateDAO.updateProfile(req.params.id, data);
    await audit(req, "AFFILIATE_PROFILE_UPDATED", `Affiliate profile ${req.params.id} updated`, "affiliate_profiles", req.params.id,
      Object.fromEntries(Object.keys(data).map((k) => [k, previous?.[k]])), data);
    return res.json({ success: true, data: updated });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// ─── ORDERS ──────────────────────────────────────────────────────────────────

// GET /api/admin/affiliate/orders
export const listOrders = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const result = await affiliateDAO.listAllAffiliateOrders({
      status,
      page: parseInt(page),
      limit: parseInt(limit),
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// POST /api/admin/affiliate/orders/:id/approve-commission
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const approveOrderCommission = async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(400).json({ success: false, error: "Invalid id" });
    const commission = await approveCommission(req.params.id, req.user.id);
    // null = the atomic PENDING guard rejected it: already approved/reversed. No financial effect occurred.
    if (!commission) return res.status(409).json({ success: false, error: "Commission is not pending (already approved or reversed)" });
    await audit(req, "AFFILIATE_COMMISSION_APPROVED", `Manually approved commission for affiliate_order ${req.params.id}`, "affiliate_orders", req.params.id, null, { commission_id: commission.id });
    return res.json({ success: true, data: commission });
  } catch (err) {
    if (err.message === "Affiliate order not found") return res.status(404).json({ success: false, error: err.message });
    return res.status(500).json({ success: false, error: err.message || "Server error" });
  }
};

// POST /api/admin/affiliate/orders/:id/cancel-commission
// Only a PENDING commission can be cancelled here (its amount still sits in pending_balance).
// Approved commissions have already moved to available_balance and go through the return/reversal path.
export const cancelOrderCommission = async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(400).json({ success: false, error: "Invalid id" });
    const { reason } = req.body;
    const affOrder = await prisma.affiliate_orders.findUnique({ where: { id: req.params.id } });
    if (!affOrder) return res.status(404).json({ success: false, error: "Not found" });

    const cancelled = await prisma.$transaction(async (tx) => {
      // Atomic guard: a repeat/concurrent cancel or an already-approved commission must not touch balances again.
      const guard = await tx.affiliate_orders.updateMany({
        where: { id: affOrder.id, commission_status: "PENDING" },
        data: { commission_status: "CANCELLED", processed_at: new Date() },
      });
      if (guard.count === 0) return false;
      if (affOrder.final_commission) {
        await tx.affiliate_profiles.update({
          where: { id: affOrder.affiliate_id },
          data: {
            pending_balance: { decrement: Number(affOrder.final_commission) },
            total_commission_earned: { decrement: Number(affOrder.final_commission) },
          },
        });
      }
      return true;
    });
    if (!cancelled) return res.status(409).json({ success: false, error: "Only a PENDING commission can be cancelled" });

    await audit(req, "AFFILIATE_COMMISSION_CANCELLED", `Cancelled commission for affiliate_order ${req.params.id}: ${reason || "no reason given"}`, "affiliate_orders", req.params.id, { commission_status: affOrder.commission_status }, { commission_status: "CANCELLED", reason });

    return res.json({ success: true, message: "Commission cancelled" });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// ─── COMMISSIONS ─────────────────────────────────────────────────────────────

// GET /api/admin/affiliate/commissions
export const listCommissions = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const result = await affiliateDAO.listAllCommissions({
      status,
      page: parseInt(page),
      limit: parseInt(limit),
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// ─── PAYOUTS ─────────────────────────────────────────────────────────────────

// GET /api/admin/affiliate/payouts
export const listPayouts = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const result = await affiliateDAO.listAllPayouts({
      status,
      page: parseInt(page),
      limit: parseInt(limit),
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// PUT /api/admin/affiliate/payouts/:id
// Allowed payout status transitions. COMPLETED / FAILED / REJECTED are terminal: they move money exactly once.
const PAYOUT_TRANSITIONS = {
  PENDING: ["APPROVED", "PROCESSING", "COMPLETED", "FAILED", "REJECTED"],
  APPROVED: ["PROCESSING", "COMPLETED", "FAILED", "REJECTED"],
  PROCESSING: ["COMPLETED", "FAILED"],
};

export const updatePayout = async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(400).json({ success: false, error: "Invalid id" });
    const { status, transaction_id, payment_proof, failure_reason, admin_notes } = req.body;
    if (status !== undefined && ![...Object.keys(PAYOUT_TRANSITIONS), "COMPLETED", "FAILED", "REJECTED"].includes(status)) {
      return res.status(400).json({ success: false, error: "Invalid payout status" });
    }

    const payout = await affiliateDAO.getPayoutById(req.params.id);
    if (!payout) return res.status(404).json({ success: false, error: "Not found" });

    if (status && !(PAYOUT_TRANSITIONS[payout.status] || []).includes(status)) {
      return res.status(409).json({ success: false, error: `Cannot change payout from ${payout.status} to ${status}` });
    }

    const updateData = {};
    if (status) updateData.status = status;
    if (transaction_id) updateData.transaction_id = transaction_id;
    if (payment_proof) updateData.payment_proof = payment_proof;
    if (failure_reason) updateData.failure_reason = failure_reason;
    if (admin_notes) updateData.admin_notes = admin_notes;
    if (status === "COMPLETED") {
      updateData.processed_by = req.user.id;
      updateData.processed_at = new Date();
      updateData.completed_at = new Date();
    }

    // Balance/commission effects and the status change are one transaction, guarded by the status we read:
    // a repeated or concurrent update matches 0 rows and changes nothing.
    // Balance moves use net_amount — the same amount requestPayout moved from available to processing.
    const net = Number(payout.net_amount);
    const updated = await prisma.$transaction(async (tx) => {
      const guard = await tx.affiliate_payouts.updateMany({ where: { id: payout.id, status: payout.status }, data: updateData });
      if (guard.count === 0) return null;

      if (status === "COMPLETED") {
        await tx.affiliate_commissions.updateMany({ where: { payout_id: payout.id }, data: { status: "PAID", paid_at: new Date() } });
        await tx.affiliate_profiles.update({
          where: { id: payout.affiliate_id },
          data: { total_commission_paid: { increment: net }, processing_balance: { decrement: net } },
        });
      } else if (status === "FAILED" || status === "REJECTED") {
        await tx.affiliate_profiles.update({
          where: { id: payout.affiliate_id },
          data: { available_balance: { increment: net }, processing_balance: { decrement: net } },
        });
        await tx.affiliate_commissions.updateMany({ where: { payout_id: payout.id }, data: { status: "APPROVED", payout_id: null } });
      }
      return tx.affiliate_payouts.findUnique({ where: { id: payout.id } });
    });
    if (!updated) return res.status(409).json({ success: false, error: "Payout was changed by another request" });

    await audit(req, "AFFILIATE_PAYOUT_UPDATED", `Payout ${req.params.id} status changed to ${status || payout.status}`, "affiliate_payouts", req.params.id, { status: payout.status }, updateData);
    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error("updatePayout error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// ─── DASHBOARD ───────────────────────────────────────────────────────────────

// GET /api/admin/affiliate/dashboard
export const getAdminDashboard = async (req, res) => {
  try {
    const stats = await affiliateDAO.getAdminDashboardStats();
    return res.json({ success: true, data: stats });
  } catch (err) {
    console.error("getAdminDashboard error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/admin/affiliate/analytics — Analytics v1: daily clicks/orders trend (the one program
// with real click tracking, so this is a genuine click→order funnel), commission-status
// breakdown, top affiliates by approved commission. Aggregated in Postgres, no N+1.
export const getAnalytics = async (req, res) => {
  try {
    const { period = "30" } = req.query;
    const days = parseInt(period);
    const since = new Date(Date.now() - days * 24 * 3600000);

    const [statusBreakdown, dailyClicks, dailyOrders, topAffiliatesRaw] = await Promise.all([
      prisma.affiliate_orders.groupBy({
        by: ["commission_status"],
        _count: { id: true },
        where: { created_at: { gte: since } },
      }),
      prisma.$queryRaw`
        SELECT (clicked_at AT TIME ZONE 'Asia/Kolkata')::date AS day, COUNT(*)::int AS count
        FROM affiliate_clicks
        WHERE clicked_at >= ${since}
        GROUP BY day
        ORDER BY day ASC
      `,
      prisma.$queryRaw`
        SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date AS day, COUNT(*)::int AS count
        FROM affiliate_orders
        WHERE created_at >= ${since}
        GROUP BY day
        ORDER BY day ASC
      `,
      prisma.affiliate_commissions.groupBy({
        by: ["affiliate_id"],
        _sum: { final_amount: true },
        // Matches campaign.dao.js's getAttributedAmounts: only APPROVED/IN_PAYOUT/PAID count as
        // earned, and scoped to the same period as every other series in this response — a
        // CANCELLED commission or one outside the window must not inflate the leaderboard.
        where: { created_at: { gte: since }, status: { in: ["APPROVED", "IN_PAYOUT", "PAID"] } },
        orderBy: { _sum: { final_amount: "desc" } },
        take: 10,
      }),
    ]);

    // One batch lookup for the top-10 affiliates' display info — not a query per row (rules.md 19.3).
    const profiles = await prisma.affiliate_profiles.findMany({
      where: { id: { in: topAffiliatesRaw.map((a) => a.affiliate_id) } },
      select: { id: true, affiliate_code: true, display_name: true },
    });
    const profileById = new Map(profiles.map((p) => [p.id, p]));
    const topAffiliates = topAffiliatesRaw.map((a) => ({
      affiliate_id: a.affiliate_id,
      affiliate_code: profileById.get(a.affiliate_id)?.affiliate_code || null,
      display_name: profileById.get(a.affiliate_id)?.display_name || null,
      total_commission: Number(a._sum.final_amount || 0),
    }));

    // Merge the two independent day-bucketed trends into one series for a combined chart.
    const dayKey = (d) => new Date(d.day).toISOString().slice(0, 10);
    const merged = new Map();
    for (const row of dailyClicks) merged.set(dayKey(row), { date: dayKey(row), clicks: row.count, orders: 0 });
    for (const row of dailyOrders) {
      const key = dayKey(row);
      const existing = merged.get(key) || { date: key, clicks: 0, orders: 0 };
      existing.orders = row.count;
      merged.set(key, existing);
    }
    const dailyTrend = [...merged.values()].sort((a, b) => a.date.localeCompare(b.date));

    return res.json({
      success: true,
      analytics: {
        status_breakdown: statusBreakdown,
        daily_trend: dailyTrend,
        top_affiliates: topAffiliates,
      },
    });
  } catch (err) {
    console.error("getAnalytics error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// ─── FRAUD LOGS (Q2, Marketing Control Center) ──────────────────────────────
// Reuses referral's fraud-log table/review shape (referral_fraud_logs) rather than a parallel
// affiliate_fraud_logs table — scoped to program="AFFILIATE", mirroring adminReferralController's
// listFraudLogs/reviewFraudLog exactly except for that one filter.

// GET /api/admin/affiliate/fraud-logs
export const listFraudLogs = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, severity } = req.query;
    const result = await referralService.listFraudLogsByProgram("AFFILIATE", { page, limit, status, severity });
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error("listFraudLogs (affiliate) error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// PUT /api/admin/affiliate/fraud-logs/:id/review
export const reviewFraudLog = async (req, res) => {
  try {
    const { user } = req;
    const { id } = req.params;
    const { status, notes, action } = req.body;

    await referralService.reviewFraudLogEntry(id, { status, notes, action, reviewerId: user.id });

    return res.json({ success: true, message: "Fraud log reviewed" });
  } catch (err) {
    console.error("reviewFraudLog (affiliate) error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};
