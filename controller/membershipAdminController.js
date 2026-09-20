import prisma from "../config/prisma.js";
import { logAdminAction } from "../services/referralService.js";
import { computeLapseAt } from "../services/membershipService.js";

const DAY_MS = 86400000;
const STATUSES = ["TRIAL", "ACTIVE", "ACTIVE_PAID", "LAPSED", "CANCELLED"];
const EXPIRING_SOON_DAYS = 14;

const audit = (req, action, description, entityId, previousValue, newValue) =>
  logAdminAction(req.user.id, req.user.email, req.user.name, action, description, "membership_plan", entityId, previousValue, newValue, req.ip);

const getReturnWindowDays = async () => (await prisma.referral_configs.findFirst({ select: { return_window_days: true } }))?.return_window_days ?? 7;

// GET /api/admin/membership/summary — headline numbers for the Overview tab.
export const getSummary = async (_req, res) => {
  try {
    const now = new Date();
    const soon = new Date(now.getTime() + EXPIRING_SOON_DAYS * DAY_MS);

    const [byStatus, activePlan, endingSoon, ineligible, credited] = await Promise.all([
      prisma.user_memberships.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.membership_plans.findFirst({ where: { is_active: true }, orderBy: { created_at: "desc" } }),
      prisma.user_memberships.findMany({
        where: { status: "TRIAL", trial_ends_at: { gte: now, lte: soon } },
        include: { plan: { select: { trial_referral_target: true } } },
        orderBy: { trial_ends_at: "asc" },
        take: 8,
      }),
      prisma.referral_transactions.count({ where: { membership_eligible: false } }),
      prisma.membership_referral_credits.count(),
    ]);

    const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    byStatus.forEach((r) => { counts[r.status] = r._count._all; });
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    // Only memberships whose trial has concluded say anything about conversion.
    const concluded = counts.ACTIVE + counts.ACTIVE_PAID + counts.LAPSED;
    const endingSoonCount = await prisma.user_memberships.count({ where: { status: "TRIAL", trial_ends_at: { gte: now, lte: soon } } });

    const users = await prisma.users.findMany({ where: { id: { in: endingSoon.map((m) => m.user_id) } }, select: { id: true, name: true, email: true, phone: true } });
    const userById = Object.fromEntries(users.map((u) => [u.id, u]));

    res.json({
      success: true,
      summary: {
        total, counts,
        qualification_rate: concluded > 0 ? Math.round(((counts.ACTIVE + counts.ACTIVE_PAID) / concluded) * 1000) / 10 : null,
        ending_soon: endingSoonCount,
        ending_soon_days: EXPIRING_SOON_DAYS,
        ineligible_referrals: ineligible,
        referrals_credited: credited,
        has_active_plan: !!activePlan,
        active_plan: activePlan ? { id: activePlan.id, code: activePlan.code, name: activePlan.name, trial_duration_days: activePlan.trial_duration_days, trial_referral_target: activePlan.trial_referral_target, grace_period_days: activePlan.grace_period_days, count_basis: activePlan.count_basis } : null,
        ending_soon_members: endingSoon.map((m) => ({
          id: m.id, user: userById[m.user_id] || { id: m.user_id }, trial_ends_at: m.trial_ends_at,
          referrals_counted: m.referrals_counted, referral_target: m.plan.trial_referral_target,
        })),
      },
    });
  } catch (err) {
    console.error("Error in membership getSummary:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// GET /api/admin/membership/plans
export const listPlans = async (_req, res) => {
  try {
    const [plans, counts, returnWindowDays] = await Promise.all([
      prisma.membership_plans.findMany({ orderBy: { created_at: "desc" } }),
      prisma.user_memberships.groupBy({ by: ["plan_id"], _count: { _all: true } }),
      getReturnWindowDays(),
    ]);
    const memberCount = Object.fromEntries(counts.map((c) => [c.plan_id, c._count._all]));
    res.json({ success: true, plans: plans.map((p) => ({ ...p, member_count: memberCount[p.id] || 0 })), return_window_days: returnWindowDays });
  } catch (err) {
    console.error("Error in membership listPlans:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

const int = (v) => (v === "" || v === null || v === undefined ? NaN : Number(v));

// PUT /api/admin/membership/plans/:id — only the fields that drive Release 1 behaviour.
// price / billing_cycle / count_basis are deliberately not editable: paid membership and REGISTRATION counting are not implemented.
export const updatePlan = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.membership_plans.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, error: "Plan not found" });

    const data = {};
    const { name, trial_duration_days, trial_referral_target, grace_period_days, is_active } = req.body;
    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ success: false, error: "Name is required" });
      data.name = String(name).trim();
    }
    if (trial_duration_days !== undefined) {
      const n = int(trial_duration_days);
      if (!Number.isInteger(n) || n < 1 || n > 3650) return res.status(400).json({ success: false, error: "Trial duration must be a whole number of days between 1 and 3650" });
      data.trial_duration_days = n;
    }
    if (trial_referral_target !== undefined) {
      const n = int(trial_referral_target);
      if (!Number.isInteger(n) || n < 1 || n > 100000) return res.status(400).json({ success: false, error: "Referral target must be a whole number of at least 1" });
      data.trial_referral_target = n;
    }
    if (grace_period_days !== undefined) {
      const n = int(grace_period_days);
      if (!Number.isInteger(n) || n < 0 || n > 365) return res.status(400).json({ success: false, error: "Grace period must be a whole number of days between 0 and 365" });
      data.grace_period_days = n;
    }
    if (is_active !== undefined) data.is_active = is_active === true || is_active === "true";

    if (Object.keys(data).length === 0) return res.status(400).json({ success: false, error: "Nothing to update" });

    const plan = await prisma.membership_plans.update({ where: { id }, data });
    const changed = Object.keys(data);
    await audit(req, "MEMBERSHIP_PLAN_UPDATED", `Updated membership plan "${existing.name}" (${changed.join(", ")})`, id,
      Object.fromEntries(changed.map((k) => [k, existing[k]])), Object.fromEntries(changed.map((k) => [k, plan[k]])));
    res.json({ success: true, plan });
  } catch (err) {
    console.error("Error in membership updatePlan:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

const decorate = (m, users, profiles, returnWindowDays) => {
  const now = Date.now();
  return {
    id: m.id, user_id: m.user_id, status: m.status,
    user: users[m.user_id] || { id: m.user_id },
    referral_code: profiles[m.user_id]?.referral_code || null,
    current_tier: profiles[m.user_id]?.current_tier || null,
    plan: { id: m.plan.id, code: m.plan.code, name: m.plan.name },
    trial_started_at: m.trial_started_at, trial_ends_at: m.trial_ends_at,
    lapse_at: computeLapseAt(m, m.plan, returnWindowDays),
    referrals_counted: m.referrals_counted, referral_target: m.plan.trial_referral_target,
    days_remaining: m.status === "TRIAL" ? Math.ceil((m.trial_ends_at.getTime() - now) / DAY_MS) : null,
    qualified_at: m.qualified_at, lapsed_at: m.lapsed_at, created_at: m.created_at,
  };
};

const SORTS = { trial_ends_at: "trial_ends_at", created_at: "created_at", referrals_counted: "referrals_counted" };

// GET /api/admin/membership/members?page&limit&status&search&sort_by&sort_dir
export const listMembers = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const { status, search } = req.query;

    const where = {};
    if (STATUSES.includes(status)) where.status = status;
    if (search && String(search).trim()) {
      const q = String(search).trim();
      const [byUser, byCode] = await Promise.all([
        prisma.users.findMany({ where: { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] }, select: { id: true }, take: 500 }),
        prisma.user_referral_profiles.findMany({ where: { referral_code: { contains: q, mode: "insensitive" } }, select: { user_id: true }, take: 500 }),
      ]);
      where.user_id = { in: [...new Set([...byUser.map((u) => u.id), ...byCode.map((p) => p.user_id)])] };
    }

    const sortField = SORTS[req.query.sort_by] || "created_at";
    const sortDir = req.query.sort_dir === "asc" ? "asc" : "desc";

    const [rows, total, returnWindowDays] = await Promise.all([
      prisma.user_memberships.findMany({ where, include: { plan: true }, orderBy: [{ [sortField]: sortDir }, { id: "asc" }], skip: (page - 1) * limit, take: limit }),
      prisma.user_memberships.count({ where }),
      getReturnWindowDays(),
    ]);

    const ids = rows.map((r) => r.user_id);
    const [users, profiles] = await Promise.all([
      prisma.users.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true, phone: true } }),
      prisma.user_referral_profiles.findMany({ where: { user_id: { in: ids } }, select: { user_id: true, referral_code: true, current_tier: true } }),
    ]);
    const userById = Object.fromEntries(users.map((u) => [u.id, u]));
    const profileById = Object.fromEntries(profiles.map((p) => [p.user_id, p]));

    res.json({
      success: true,
      members: rows.map((m) => decorate(m, userById, profileById, returnWindowDays)),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error("Error in membership listMembers:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// GET /api/admin/membership/members/:id — one membership with its audit trail and counted referrals.
export const getMember = async (req, res) => {
  try {
    const m = await prisma.user_memberships.findUnique({
      where: { id: req.params.id },
      include: { plan: true, membership_status_log: { orderBy: { created_at: "desc" } }, membership_referral_credits: { orderBy: { counted_at: "desc" } } },
    });
    if (!m) return res.status(404).json({ success: false, error: "Membership not found" });

    const refereeIds = m.membership_referral_credits.map((c) => c.referee_id);
    const [returnWindowDays, users, profile, referees] = await Promise.all([
      getReturnWindowDays(),
      prisma.users.findMany({ where: { id: m.user_id }, select: { id: true, name: true, email: true, phone: true } }),
      prisma.user_referral_profiles.findMany({ where: { user_id: m.user_id }, select: { user_id: true, referral_code: true, current_tier: true } }),
      prisma.users.findMany({ where: { id: { in: refereeIds } }, select: { id: true, name: true, email: true } }),
    ]);
    const refereeById = Object.fromEntries(referees.map((u) => [u.id, u]));
    const base = decorate(m, { [m.user_id]: users[0] }, { [m.user_id]: profile[0] }, returnWindowDays);

    res.json({
      success: true,
      member: {
        ...base,
        history: m.membership_status_log,
        credits: m.membership_referral_credits.map((c) => ({ id: c.id, counted_at: c.counted_at, referral_transaction_id: c.referral_transaction_id, referee: refereeById[c.referee_id] || { id: c.referee_id } })),
      },
    });
  } catch (err) {
    console.error("Error in membership getMember:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};
