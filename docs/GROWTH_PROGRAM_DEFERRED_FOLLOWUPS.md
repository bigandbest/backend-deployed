# Growth Program — Deferred Follow-Ups

Polish/UI items intentionally deferred because the backend they depend on isn't ready yet. Each entry says what's missing, why it's deferred, and what unblocks it. Update this file (don't let it go stale) whenever a phase closes and a "not done, by design" item comes up — check here first before starting a new phase, since some of these become in-scope once their blocking backend work lands.

---

## Campaign admin UI

**Status:** DONE (Phase 5, 2026-09-16). `admin-deployed/src/Pages/Marketing/Campaigns` — list/create/edit/toggle/delete, product/category picker, usage display, wired into the sidebar and backed by `/api/admin/campaigns`.

---

## Multi-rule campaigns, dual-channel campaigns, and wider scoping (Phase 5 v1 boundaries)

**Status:** Not built, by explicit v1 scoping (Q2/Q17). Current campaign model: one campaign → exactly one rule (`campaign_rules.campaign_id` is `@unique`), one channel (`REFERRAL` or `AFFILIATE`, no `BOTH`), scope is category/product/store-wide only (no brand/store).

**Why deferred:** building a rule-list-builder admin UI and dual-channel reward resolution wasn't asked for; an admin wanting the same promo on both channels just creates two campaigns for now.

**Unblocked by:** nothing blocking — pure v1 scoping choice. Relaxing to multi-rule is just dropping the `@unique` constraint on `campaign_rules.campaign_id`, no reshape. Brand/store scoping needs those to exist as first-class scopable entities first (confirm on `products`).

---

## Campaign eligibility flags: new-customer-only, first-order-only, payment-method, per-user usage limit

**Status:** Not built. `campaign_rules` has no columns for these (Q2 v1 scope excluded them).

**Why deferred:** not asked for in the initial grilling round; the v1 field list (category/product scope, dates, %/fixed reward, cap, min order, total usage) covered the highest-leverage marketing asks.

**Unblocked by:** nothing blocking — add columns to `campaign_rules` and a corresponding check in `campaignEngine.js#matchRuleForItem`/`matchReferralCampaign` whenever these are actually requested.

---

## Web membership tier display

**Status:** Not built. `bbm-app` (mobile) shows the tier badge + progress on the referral dashboard; `frontend-deployed` (web) does not.

**Why deferred:** standing "mobile APIs first, then webapp" priority — the API (`GET /referral/stats` → `current_tier`/`next_tier`/`next_tier_threshold`/`referrals_to_next_tier`) already returns everything needed.

**Unblocked by:** nothing blocking — pure frontend work whenever web parity is picked up.

---

## Referral click tracking, cohort/retention analysis, exportable analytics reports, unified Growth Analytics page

**Status:** Not built. Referral has no click/link tracking (unlike affiliate), so no referral funnel chart is possible until that lands. Cohort/retention analysis, revenue attribution beyond Phase 7's list, exportable analytics reports (separate from the existing raw-data CSV export), and a single combined cross-program executive dashboard were all explicitly scoped out of Phase 7 (Analytics) v1.

**Why deferred:** each is a real, separate feature (referral click tracking is itself a phase-sized data-model addition; a unified dashboard is an IA decision, not a data question) rather than an extension of what Phase 7 was scoped to fix/build.

**Unblocked by:** referral click tracking needs its own `referral_links`/`referral_clicks` tables (mirroring affiliate's) before a funnel is possible. The rest are pure follow-on work whenever prioritized — Phase 7's per-program analytics don't need to change for any of them to be picked up.

---

## SMS/WhatsApp/Email sending, advanced fraud detection, manual membership overrides, dedicated Membership admin page

**Status:** Not built. Phase 9 (Marketing Control Center) shipped admin-editable templates for the existing in-app notification channel only, self-referral fraud logging for affiliate (reusing referral's existing infrastructure), and membership tier visibility/filtering on the existing Referral Users page.

**Why deferred:** SMS/WhatsApp/Email sending is a real third-party integration project (provider selection, API keys, delivery tracking) — there's zero sending infrastructure anywhere in this codebase to extend. Advanced fraud detection (device fingerprinting, velocity analysis, behavioral scoring) is its own detection-engine project, not a natural extension of the one gap (unlogged self-referral) this phase closed. Manual tier overrides would reopen the "what happens when it conflicts with the derived value" question Phase 6 deliberately avoided by locking tier as strictly derived and monotonic.

**Unblocked by:** nothing blocking — each is independent follow-on work. The template system (`notification_templates` + `NOTIFICATION_VARIABLE_REGISTRY`) is designed so a future SMS/WhatsApp/Email channel would extend the same pattern rather than replace it.

---

## Contacts picker, QR scanner, Universal Links / Android App Links

**Status:** Not built. Phase 8 (Complete Mobile Growth Experience) shipped dedicated WhatsApp/SMS share buttons + QR generation only (`components/growth/SharedGrowthSharing.tsx`), all explicitly scoped to exclude these three.

**Why deferred:** each is a real, separate feature — contacts needs runtime permission + a picker UI + its own privacy/spam considerations; a QR scanner is pointless to build before Universal/App Links exist (scanning today falls back to a browser anyway, which already works via the existing web fallback); Universal/App Links is its own native iOS+Android configuration project, not a code change within this app's JS layer.

**Unblocked by:** nothing blocking — pick up independently whenever prioritized. The QR contract (plain HTTPS URL) was deliberately designed so that adding Universal/App Links later changes nothing about what the QR encodes, only what happens when it's opened.

---

## Customer-facing campaign banners

**Status:** Not built. Campaigns affect pricing/rewards silently — mobile/web show no "10% off Electronics this week" banner; the customer only sees the resulting reward/commission after the fact.

**Why deferred:** Phase 5 was explicitly scoped backend + admin only (Q8) — banner copy/design/placement is a separate UX project.

**Unblocked by:** nothing blocking — `GET /api/admin/campaigns` (or a new public read-only endpoint) already has everything needed to render one; just needs the frontend work.

---

## Mobile/web "paused" banners for blocked acquisition actions

**Status:** Not built. When a toggle blocks an action (new referral signups, new affiliate applications, new affiliate links), the screen just shows the raw API error text (e.g. "New referral signups are temporarily paused") via the existing generic error-display pattern already in every affected screen.

**Why deferred:** functionally correct today — the user gets a clear, accurate message either way. A pre-emptive banner (showing the paused state before the user even tries the action) is a UX polish, not a correctness fix, and wasn't asked for as part of Phase 4.

**Unblocked by:** nothing blocking — this can be picked up any time. The backend already exposes the effective state needed to build it: `GET /referral/stats` → `new_signups_enabled`, `GET /affiliate/dashboard` → `new_links_enabled`, `GET /affiliate/application-status` → `new_applications_enabled` (all three already fold in the `program_enabled` hard-override, so the frontend never has to re-derive it).

---

## Prod migrations pending

**Status:** Three migrations verified on dev, not yet applied to production — left to the user to run:
- `prisma/migrations/20260915120000_add_growth_program_idempotency_constraints/`
- `prisma/migrations/20260915190000_add_growth_program_marketing_toggles/`
- `prisma/migrations/20260916150000_add_campaign_reward_rules_engine/`

**Why deferred:** user's explicit call each time ("Not yet — I'll do it myself" for the first; same standing preference applies to the second).

**Unblocked by:** the user running them. No code dependency.
