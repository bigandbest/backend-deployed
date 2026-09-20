// services/membershipService.js
// Free membership (Release 1).
//
//   Membership answers "may this referrer earn?" — it never computes reward amounts (referral tiers / campaigns do).
//   Referral tiers (user_referral_profiles.current_tier) are a separate concept and are untouched here.
//
//   TRIAL  --target reached-->  ACTIVE                       (permanent in v1)
//   TRIAL  --lapse_at passed--> LAPSED                       lapse_at = trial_ends_at + max(grace_period_days, return_window_days)
//   LAPSED --paid membership--> ACTIVE_PAID                  (Release 2 — not implemented)
//   No LAPSED->ACTIVE, no ACTIVE->LAPSED, no re-trial. A later reward reversal never un-qualifies a membership.
import prisma from "../config/prisma.js";

const DAY_MS = 86400000;
const addDays = (date, days) => new Date(new Date(date).getTime() + days * DAY_MS);

const getReturnWindowDays = async () => {
  const cfg = await prisma.referral_configs.findFirst({ select: { return_window_days: true } });
  return cfg?.return_window_days ?? 7;
};

// v1 has one active plan at a time (newest wins if an admin ever leaves two active).
export const getActivePlan = () =>
  prisma.membership_plans.findFirst({ where: { is_active: true }, orderBy: { created_at: "desc" } });

export const computeLapseAt = (membership, plan, returnWindowDays) =>
  addDays(membership.trial_ends_at, Math.max(plan.grace_period_days, returnWindowDays));

/**
 * Idempotent: creates the TRIAL membership on the user's first call and returns the existing row afterwards.
 * Calling it repeatedly never restarts or extends the trial. Returns null when no active plan is configured.
 * Only referrer-side link generation should call this (never apply-code / profile creation / admin credit).
 */
export const ensureMembership = async (userId) => {
  const existing = await prisma.user_memberships.findUnique({ where: { user_id: userId }, include: { plan: true } });
  if (existing) return existing;

  const plan = await getActivePlan();
  if (!plan) return null;

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    // skipDuplicates: a concurrent first call inserts nothing (no error, so the transaction is not aborted).
    const created = await tx.user_memberships.createMany({
      data: [{ user_id: userId, plan_id: plan.id, status: "TRIAL", trial_started_at: now, trial_ends_at: addDays(now, plan.trial_duration_days) }],
      skipDuplicates: true,
    });
    if (created.count === 1) {
      const m = await tx.user_memberships.findUnique({ where: { user_id: userId } });
      await tx.membership_status_log.create({ data: { membership_id: m.id, from_status: null, to_status: "TRIAL", reason: "FIRST_LINK_GENERATION", actor: "USER" } });
    }
  });
  return prisma.user_memberships.findUnique({ where: { user_id: userId }, include: { plan: true } });
};

/**
 * Snapshot evaluated when a referred order is placed. No membership row = legacy/not-yet-enrolled referrer (lazy trial),
 * who is not blocked. TRIAL is eligible only for orders placed on or before trial_ends_at (the period between
 * trial_ends_at and lapse_at exists solely so in-flight referrals can finish their return window).
 */
export const evaluateEarningEligibility = async (referrerId, orderDate = new Date()) => {
  const m = await prisma.user_memberships.findUnique({ where: { user_id: referrerId } });
  if (!m) return true;
  if (m.status === "ACTIVE" || m.status === "ACTIVE_PAID") return true;
  if (m.status === "TRIAL") return new Date(orderDate) <= m.trial_ends_at;
  return false; // LAPSED, CANCELLED
};

/**
 * Called INSIDE the reward-crediting transaction (referralService.processReturnWindowExpiry), so the reward and the
 * qualification are atomic. Replay/multi-rule safe via UNIQUE(membership_id, referee_id).
 */
export const creditQualifyingReferral = async (tx, referralTx) => {
  if (referralTx.membership_eligible === false) return { counted: false, reason: "not_eligible" };

  const m = await tx.user_memberships.findUnique({ where: { user_id: referralTx.referrer_id }, include: { plan: true } });
  if (!m || m.status !== "TRIAL") return { counted: false, reason: "not_in_trial" };
  if (m.plan.count_basis !== "FIRST_ORDER") return { counted: false, reason: "count_basis_not_supported" }; // REGISTRATION: later release

  // Qualifying anchor is the referred order, not the reward-credit time.
  const orderDate = referralTx.order_date;
  if (!orderDate || orderDate < m.trial_started_at || orderDate > m.trial_ends_at) return { counted: false, reason: "outside_trial" };

  const credit = await tx.membership_referral_credits.createMany({
    data: [{ membership_id: m.id, referee_id: referralTx.referee_id, referral_transaction_id: referralTx.id }],
    skipDuplicates: true,
  });
  if (credit.count === 0) return { counted: false, reason: "already_counted" };

  // Relative increment on the locked row; the returned value is consistent even with concurrent credits.
  const updated = await tx.user_memberships.update({ where: { id: m.id }, data: { referrals_counted: { increment: 1 } } });

  if (updated.referrals_counted >= m.plan.trial_referral_target) {
    const guard = await tx.user_memberships.updateMany({ where: { id: m.id, status: "TRIAL" }, data: { status: "ACTIVE", qualified_at: new Date() } });
    if (guard.count === 1) {
      await tx.membership_status_log.create({ data: { membership_id: m.id, from_status: "TRIAL", to_status: "ACTIVE", reason: "TARGET_REACHED", actor: "SYSTEM" } });
      return { counted: true, activated: true };
    }
  }
  return { counted: true, activated: false };
};

/**
 * Hourly job. The UPDATE itself is the guard (status = 'TRIAL' re-checked after any row-lock wait), so an overlapping run or
 * a qualification committing at the boundary can never be overwritten; each lapse is logged in the same transaction.
 */
export const processMembershipLapses = async () => {
  const returnWindowDays = await getReturnWindowDays();
  const lapsed = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`
      UPDATE user_memberships m
         SET status = 'LAPSED', lapsed_at = now(), updated_at = now()
        FROM membership_plans p
       WHERE m.plan_id = p.id
         AND m.status = 'TRIAL'
         AND m.trial_ends_at + make_interval(days => GREATEST(p.grace_period_days, ${returnWindowDays}::int)) <= now()
   RETURNING m.id`;
    if (rows.length) {
      await tx.membership_status_log.createMany({
        data: rows.map((r) => ({ membership_id: r.id, from_status: "TRIAL", to_status: "LAPSED", reason: "TRIAL_EXPIRED", actor: "SYSTEM" })),
      });
    }
    return rows.length;
  });
  return { lapsed };
};

/** Read-only summary for API responses (never starts a trial). */
export const getMembershipSummary = async (userId) => {
  const m = await prisma.user_memberships.findUnique({ where: { user_id: userId }, include: { plan: true } });
  if (!m) return null;
  const returnWindowDays = await getReturnWindowDays();
  const now = Date.now();
  return {
    status: m.status,
    plan: { code: m.plan.code, name: m.plan.name },
    trial_started_at: m.trial_started_at,
    trial_ends_at: m.trial_ends_at,
    lapse_at: computeLapseAt(m, m.plan, returnWindowDays),
    referrals_counted: m.referrals_counted,
    referral_target: m.plan.trial_referral_target,
    referrals_remaining: Math.max(0, m.plan.trial_referral_target - m.referrals_counted),
    days_remaining: m.status === "TRIAL" ? Math.max(0, Math.ceil((m.trial_ends_at.getTime() - now) / DAY_MS)) : null,
    qualified_at: m.qualified_at,
    lapsed_at: m.lapsed_at,
  };
};
