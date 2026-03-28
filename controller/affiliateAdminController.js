import affiliateDAO from "../dao/affiliate.dao.js";
import { approveCommission, generatePayoutNumber } from "../services/affiliateService.js";
import { _createProfileFromApplication } from "./affiliateApplicationController.js";
import prisma from "../config/prisma.js";

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
    const config = await affiliateDAO.updateConfig(req.body);
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

    return res.json({ success: true, data: rate });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// DELETE /api/admin/affiliate/commission-rates/:id
export const deleteCommissionRate = async (req, res) => {
  try {
    await affiliateDAO.deleteCategoryCommission(req.params.id);
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

    const updated = await affiliateDAO.updateProfile(req.params.id, data);
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
export const approveOrderCommission = async (req, res) => {
  try {
    const commission = await approveCommission(req.params.id, req.user.id);
    return res.json({ success: true, data: commission });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || "Server error" });
  }
};

// POST /api/admin/affiliate/orders/:id/cancel-commission
export const cancelOrderCommission = async (req, res) => {
  try {
    const { reason } = req.body;
    const affOrder = await prisma.affiliate_orders.findUnique({ where: { id: req.params.id } });
    if (!affOrder) return res.status(404).json({ success: false, error: "Not found" });

    await affiliateDAO.updateAffiliateOrder(req.params.id, {
      commission_status: "CANCELLED",
      processed_at: new Date(),
    });

    // Revert pending balance
    if (affOrder.final_commission) {
      await affiliateDAO.incrementProfileStats(affOrder.affiliate_id, {
        pending_balance: { decrement: Number(affOrder.final_commission) },
        total_commission_earned: { decrement: Number(affOrder.final_commission) },
      });
    }

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
export const updatePayout = async (req, res) => {
  try {
    const { status, transaction_id, payment_proof, failure_reason, admin_notes } = req.body;

    const payout = await affiliateDAO.getPayoutById(req.params.id);
    if (!payout) return res.status(404).json({ success: false, error: "Not found" });

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

      // Finalize: mark commissions as PAID
      await prisma.affiliate_commissions.updateMany({
        where: { payout_id: payout.id },
        data: { status: "PAID", paid_at: new Date() },
      });

      // Update affiliate profile: move processing → paid
      await affiliateDAO.incrementProfileStats(payout.affiliate_id, {
        total_commission_paid: { increment: Number(payout.net_amount) },
        processing_balance: { decrement: Number(payout.gross_amount) },
      });
    }

    if (status === "FAILED" || status === "REJECTED") {
      // Restore balance
      await affiliateDAO.incrementProfileStats(payout.affiliate_id, {
        available_balance: { increment: Number(payout.gross_amount) },
        processing_balance: { decrement: Number(payout.gross_amount) },
      });
      // Revert commission status
      await prisma.affiliate_commissions.updateMany({
        where: { payout_id: payout.id },
        data: { status: "APPROVED", payout_id: null },
      });
    }

    const updated = await affiliateDAO.updatePayout(req.params.id, updateData);
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
