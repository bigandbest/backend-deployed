# Referral + Affiliate V1 — Implementation Phases (1-month release, mobile-first)

**Repository:** `backend-deployed` (deliberate exception to the no-legacy-changes rule — see decisions below). Consumers: `bbm-app` (Expo/React Native) first, `frontend-deployed` (web) after.

**Source documents:** `docs/REFERRAL_AFFILIATE_MEMBERSHIP_BACKEND_ANALYSIS.md` (ground-truth codebase analysis), this file (execution plan derived from a Q1–Q14 decision interview on 2026-09-15).

---

## Locked decisions (Q1–Q14)

| # | Area | Decision |
|---|---|---|
| Q1 | Attribution conflict | Valid affiliate last-click attribution wins **for that order only**; permanent referral relationship (`referred_by_user_id`) is untouched and can apply again on a future order with no competing affiliate attribution |
| Q2 | Reward/commission base | `subtotal − coupon_discount − discount_charge` (excludes shipping, tax, and wallet/reward money used — the latter needs no new tracking since referral is flat-fee and the base is subtotal, not cash collected) |
| Q3 | Qualifying order | PENDING record created at order placement; becomes AVAILABLE only after delivery + `return_window_days` (config, default 7) has passed |
| Q4 | Money ledgers | Keep referral, affiliate, and general wallet ledgers separate — no migration this phase |
| Q5 | Campaign engine | Document unified `Campaign`/`CampaignRules` direction now; do not build it this phase |
| Q6 | Deadline | 1 month, hard constraint |
| Q7 | Codebase | `backend-deployed` — explicit, logged exception to the no-legacy-edits rule (memory updated) |
| Q8 | Mobile scope | Make the *existing* mobile referral UI (`ReferralDashboard.tsx`, `ReferralStep.tsx`, `ReferralContext.tsx`) actually work end-to-end, before anything net-new |
| Q9 | Affiliate mobile | Sequential after referral (Phase 1A → Phase 1B), reusing the same order-lifecycle hooks |
| Q10 | Hook wiring | Direct in-process service calls inside the order-write transaction (no internal HTTP self-calls); DB-level unique constraints for idempotency regardless |
| Q11 | Order status | Narrow `normalizeOrderStatus()` helper used only at hook call sites — no codebase-wide enum migration |
| Q12 | Late reversal (spent reward) | No debt/clawback in v1 — log the event, absorb the loss, move on |
| Q13 | Membership | Zero engineering scope this phase |
| Q14 | Referral deep links | Required in v1 (share link → app opens → code captured → signup); click *analytics* (`referral_clicks` table) explicitly deferred |

---

## Phase 0 — Foundation (idempotency + status + wiring plumbing) — IMPLEMENTED 2026-09-15

No user-visible change. This unblocks every later phase safely.

- [x] `utils/orderStatus.js` — `normalizeOrderStatus()` / `isDeliveredStatus()` / `isCancelledStatus()`.
- [x] `services/rewardCalculation.js` — canonical `calculateEligibleOrderBase()` (Q2 formula), shared by both referral and affiliate instead of each computing it separately.
- [x] DB-level idempotency constraints added to `prisma/schema.prisma` (verified zero violating rows in production, read-only):
  - `affiliate_orders`: `@@unique([order_id])`
  - `affiliate_commissions`: `@@unique([affiliate_order_id])`
  - `referral_rewards`: `@@unique([referral_transaction_id, reward_type])`
  - **Not yet applied to any database** — Claude Code's sandbox blocked running `prisma migrate`/`db push` even against the dev DB (classified as a shared-resource write). SQL is ready at `prisma/migrations_manual/20260915_add_growth_program_idempotency_constraints.sql` — **Amit needs to run it against dev, then prod, himself**, then run `npx prisma generate`.
- [x] Identified every real order-creation/delivery/cancel/return code path (see "Order lifecycle choke points" below) — `checkoutService.js` and the scheduled-order path turned out to be dead/broken, not real paths (see Findings).
- [x] `services/orderLifecycleHooks.js` — central dispatcher (`onOrderCreated`, `onOrderStatusChanged`, `onOrderPartiallyReturned`) calling referral/affiliate services **directly in-process**, replacing the dead `/api/internal/referral/*` HTTP self-calls (routes left in place, now provably redundant — see Findings, not deleted this round).
- [x] `referralService.js`: hardened `onOrderPlaced`/`onOrderDelivered`/`onOrderReturned`/`processReturnWindowExpiry` with atomic `updateMany`-guarded conditional updates (compare-and-swap on status) so concurrent/duplicate calls can't double-credit.
- [x] `affiliateService.js`: added `onOrderDelivered` (starts the return-window clock from the real delivery date instead of order-creation time — a real Q3 compliance fix), `onOrderReturned` (reversal, no-debt-if-already-paid per Q12), `processCommissionAutoApproval` (cron, replaces manual-only admin approval); hardened `processAffiliateOrder`/`approveCommission` against races.
- [x] Fixed a pre-existing Q2 violation: affiliate commission base was `order.total - shipping` (ignored coupon discounts, overpaying on discounted orders); now uses the shared eligible-base formula.
- [x] `services/growthCron.js` — hourly return-window-expiry (referral) + auto-approval (affiliate), daily reward-expiry and expiry-reminders, registered in `server.js`. Guarded against firing once per PM2 cluster instance (production runs `exec_mode: cluster`, `instances: max` — see Findings) via `NODE_APP_INSTANCE`, plus an in-process re-entrancy guard per job.

**Order lifecycle choke points actually wired** (fewer than the original 8+ raw `prisma.orders.*` call sites, because most converge into shared functions):
- Creation: `dao/order.dao.js#create()` (used by `placeOrder`), and directly in `orderController.js#placeOrderWithDetailedAddress`'s transaction.
- Status change: `dao/order.dao.js#update()` (covers generic admin status update, `cancelOrder`, and the immediate cancellation write in `returnOrderController.js`), `orderFulfillmentService.js#updateParentOrderStatusFromSubOrders()` (the real multi-caller choke point for "Delivered" from the sub-order fulfillment flow), `riderOrderController.js` single-shot delivery confirmation, `sellerController.js#updateSellerOrderStatus`.
- Partial return: `returnOrderController.js#updateReturnRequestStatus` when an admin marks a partial item-return "completed" (guarded against re-firing on repeat saves).

**Acceptance criteria — VERIFIED against dev on 2026-09-15.** Migration applied and confirmed live on dev (`nwznoveitnogzgqewhoz`) via `psql` + `prisma migrate resolve`. Ran a full scripted smoke test (created/cleaned up its own throwaway users/orders, restored config afterward) covering: signup → order → delivery → return-window expiry → reward credited (referral) and order → delivery → auto-approval → commission (affiliate), plus duplicate-call idempotency for every hook, plus a forced raw duplicate insert to confirm the DB constraint itself rejects it, plus reversal after approval. **17/17 checks passed.** Still pending: run the same migration against **prod** (see SQL/commands above) — not done yet, prod stays untouched.

**Bugs found by that test run (fixed, unrelated to code I wrote but blocking it):**
- `referral_configs.is_enabled` is currently **`false`** on both dev and prod — the referral program is fully switched off at the config level. Nothing referral-related will fire in production until this is turned on. Not flipped by me on prod (config data, not code) — **you need to decide when to enable it** (presumably as part of the Phase 1 launch, not before rewards are verified correct).
- `services/affiliateService.js#approveCommission` and three admin-listing DAO methods (`listAllAffiliateOrders`, `listAllCommissions`, `listAllPayouts` in `dao/affiliate.dao.js`) all referenced a Prisma relation as `affiliate_profile` (singular) when the actual generated relation name is `affiliate_profiles` (plural, matching the model name). This is a **pre-existing bug, not introduced by this work** — it means `approveCommission` (the only way commissions were ever approved before my auto-approval cron existed) has been throwing a `PrismaClientValidationError` on every call, and the three admin "list all affiliate X" endpoints have never been able to return data. Fixed all four call sites.

---

## Phase 1A — Referral, mobile-first

Depends on: Phase 0.

- [x] **Order attribution (Q1):** `affiliateService.processAffiliateOrder` now calls `referralService.supersedeByAffiliateAttribution(orderId)` on every successful new attribution — flips any in-flight referral transaction on that order to `SUPERSEDED_BY_AFFILIATE` (decrements `pending_referrals`, doesn't touch the permanent `referred_by_user_id` relationship or count as a failure). Verified on dev: a referral transaction correctly supersedes and cannot be reactivated by a later delivery/return-window call.
- [x] **Deep links (net-new, built 2026-09-15):**
  - `bbm-app/app.json`: added `"scheme": "bigbestmart"` — enables `bigbestmart://ref/CODE` links via expo-router's built-in Linking integration, no extra native config needed.
  - `bbm-app/app/ref/[code].tsx`: new deep-link landing screen. Stores the code (`AsyncStorage`, key in `constants/ReferralDeepLink.ts`) and redirects to `/login` (unauthenticated) or `/(tabs)` (already signed in — referral only applies at signup, so nothing further to do there).
  - `bbm-app/app/_layout.tsx`: the `AuthGuard` was force-redirecting any unauthenticated route straight to `/login`, which would have raced the deep-link screen's own redirect. Added `segments[0] === "ref"` as a recognized public route so the deep-link screen gets to run first.
  - `bbm-app/hooks/useAuthFlow.ts`: on reaching the `referral` signup step, prefills `referralCode` from the stored value if present; clears it from storage after a successful apply or an explicit skip.
  - `bbm-app/components/profile/ReferralDashboard.tsx`: the "Share" button's message now includes a real working link (`https://bigbestmart.com/ref/CODE`, domain confirmed from `constants/Config.ts`'s existing `api.bigbestmart.com` reference) instead of a dead placeholder URL.
  - `frontend-deployed/src/app/ref/[code]/page.jsx`: new web fallback page. Attempts the `bigbestmart://ref/CODE` scheme first; if the visitor is still on the page, shows the code with a copy button and either an inline "Apply Code" button (reusing the existing but previously-unused `applyReferralCode` API call, if already logged in on web) or a link to log in first.
  - **Known limitation — not built:** true iOS Universal Links / Android App Links (opening `https://bigbestmart.com/ref/CODE` directly into the app with no interstitial) require hosting domain-verification files (`apple-app-site-association`, `assetlinks.json`) and an Apple Developer Team ID — I don't have those and won't fabricate them. What's built is the custom-scheme + web-fallback pattern, which is the standard stand-in until you're ready to set up true universal links (tell me the Team ID and where `frontend-deployed` is actually hosted and I can wire it up).
  - No `referral_clicks` table, no click analytics — code passthrough only, as scoped.
  - **Not verified on-device** — this was built and syntax/type-checked (`tsc --noEmit` clean, zero new errors) but not run in an actual Expo build/simulator, since that's outside what I can do from here. Please test the actual link-opening behavior on a real device or simulator before considering this done.
- [x] **Make existing endpoints real:** audited backend controller against the actual mobile client code (not just assumed). Backend routes/logic were already correct; found and fixed 4 real bugs blocking the dashboard from ever showing real data:
  - `bbm-app/contexts/ReferralContext.tsx`: `ReferralStats`/`ReferralWallet` TS interfaces used camelCase field names (`totalReferrals`, `wallet.balance`, ...) that don't exist on the backend's actual snake_case response — every stat/balance on the dashboard was silently `undefined` regardless of backend correctness. Fixed to match the real response shape (confirmed against `frontend-deployed`'s `ReferralContext.jsx`, which passes the same backend response through unmodified).
  - Same file: `applyReferralCode()` posted `{ code }` instead of `{ referral_code }` — the backend's `applyCode` controller reads `req.body.referral_code`, so this call always failed with "referral_code is required". (The signup-flow equivalent in `hooks/useAuthFlow.ts` already used the correct key — only this standalone context function was wrong.)
  - `bbm-app/components/profile/ReferralDashboard.tsx`: updated to the corrected field names; "Pending" and "Expiring Soon" wallet cards now show real values instead of a client-side guess (`pending * 75`) and a hardcoded `₹0.00`.
  - Backend `referralService.js#getWalletBalance`: `pending` was reading `profile.pending_balance`, a column nothing in the codebase ever writes (always 0). Now derives it from actual in-flight referral transactions × the flat reward amount.
  - Not touched: the dashboard's "History" tab is a static placeholder with no API call at all — that's unbuilt, not broken, and is a separate net-new item if you want it for launch.
- [x] **Withdrawal correctness (built 2026-09-15):** new `bbm-app/app/referral-withdraw.tsx` screen, field-for-field mirroring `frontend-deployed`'s existing `WithdrawModal.jsx` (the reference implementation already matching the backend's exact request shape) — amount presets, UPI vs. bank-transfer toggle, conditional fields, min-amount validation fetched live from `/referral/public-config`. Wired a "Withdraw" button into `ReferralDashboard.tsx`'s wallet card (disabled at zero balance). `tsc --noEmit` clean. **Not verified on-device** — same caveat as deep links.

**Acceptance criteria:** a real user shares their referral link from the app → a fresh install opens via the link → signs up with the code pre-filled/applied → places a qualifying order → sees a PENDING reward in `ReferralDashboard.tsx` → sees it flip to AVAILABLE after the return window → successfully withdraws it — entirely through the mobile app, no manual DB intervention. **Still blocked on:** deep links (not started) and a withdrawal screen (not started, backend ready).

---

## Phase 1B — Affiliate, mobile-first

Depends on: Phase 1A's order-lifecycle hooks (reused, not rebuilt).

- [x] **Order attribution — root cause found and fixed (2026-09-15):** the mobile app never actually triggered `processAffiliateOrder()` at all in real usage. `CartContext.tsx#getCheckoutPayload()` built a correctly-shaped `attribution` field, but had **zero callers anywhere in the app** — dead code. The real order-placement flow (`hooks/useCartScreen.ts` → `services/orderService.ts#placeOrder`) never sent attribution, and never called the conversion endpoint after a successful order either. Fixed by:
  - New `utils/affiliateTracking.ts#recordAffiliateConversion(orderId, token)` — checks for a stored click, calls `POST /affiliate/convert`, clears storage on success.
  - Wired it into all three order-success paths in `useCartScreen.ts` (wallet, COD, Razorpay), right after order placement and before cart clear.
  - **Security bug found and fixed along the way:** `POST /affiliate/convert` had **no authentication at all** — anyone could attribute any `order_id` to any `affiliate_code` by guessing IDs, stealing commission for orders they didn't drive. Added `authenticateToken` middleware and an ownership check (`order.user_id === req.user.id`, 403 otherwise) in `affiliateTrackingController.js#convertOrder`. Verified on dev: a non-owner is rejected and creates no `affiliate_order` row; the real owner succeeds normally.
- [x] **Make existing endpoints real:** audited `AffiliateDashboard.tsx` against every backend response shape it consumes (`/affiliate/dashboard`, `/affiliate/profile`, `/affiliate/links`, `/affiliate/orders`, `/affiliate/commissions`, `/affiliate/payouts`) — unlike the referral dashboard, this one was built carefully against the real snake_case/field names and required no fixes. The one real bug: `handleApply()` POSTed to `/affiliate/apply` with **no request body at all**, while the backend requires `full_name`, `phone`, `primary_platform`, `promotion_strategy` — meaning the "Apply Now" button could never succeed. There was no application form anywhere in the mobile app. Built `app/affiliate-apply.tsx`, a full multi-field form mirroring `frontend-deployed`'s existing `AffiliateApplicationForm.jsx` (personal info, platform/audience, promotion strategy, payment details, terms), wired the dashboard's Apply/Re-apply buttons to it, and switched the dashboard's data-loading to `useFocusEffect` so it refreshes automatically when returning from the form.
- [x] **Click attribution correctness:** `cookie_duration_hours` (24h) is read from `affiliate_configs` on both the web `trackClick` redirect path and the mobile `recordRefClick` path — consistent. Mobile's `affiliateTracking.ts` client-side expiry defaults to 24h independently if the server doesn't return one, matching the config default (not read from config, but same value — low-risk drift if the config is ever changed without updating this fallback).
- [x] **Commission lifecycle:** already built in Phase 0 (`onOrderDelivered`, `processCommissionAutoApproval`, reversal) — re-verified end-to-end on dev in this phase via the actual `convertOrder` controller (not just the service function), including the ownership-check security fix.
- [x] **Payout correctness:** verified on dev via the real `requestPayout` controller — correctly rejects a request below `minimum_payout_amount`, and correctly succeeds above it: creates the payout row, links the approved commissions (`status: IN_PAYOUT`), and decrements `available_balance` by the gross (pre-TDS) amount. TDS math itself was already covered by Phase 0's `approveCommission` tests.

- [x] **Native link generation on mobile (fixed 2026-09-15):** built `app/affiliate-generate-link.tsx` — destination picker (Homepage/Product/Category/Search) with live product search (`GET /affiliate/products?search=`) and category list (`GET /affiliate/categories`), optional campaign name/sub_id, submits to `POST /affiliate/links/generate`, and shows the resulting `full_url` with copy (`expo-clipboard`, same lazy-import pattern as `ReferralDashboard.tsx`) and native share actions. Replaced the "Generate Links on Web" `Linking.openURL` hand-off in `AffiliateDashboard.tsx`'s Recent Links section with `router.push("/affiliate-generate-link")`; the dashboard's existing `useFocusEffect` refresh picks up newly created links automatically on return.

**Acceptance criteria — backend VERIFIED against dev on 2026-09-15** (9/9 scripted checks: unauthorized-attribution rejection, real-owner attribution, delivery → auto-approval → commission credit, payout request rejection below minimum and success above it, with real balance/status assertions each time; test data fully cleaned up). Full loop: an approved affiliate generates a link → a click is recorded with correct attribution window → a purchase within that window creates a PENDING commission (correctly overriding any referral attribution per Q1) → commission becomes AVAILABLE after the return window → affiliate sees accurate numbers on `AffiliateDashboard.tsx` and can request payout. **Mobile/web UI changes (application form, conversion wiring, native link generation) are type-checked but not run on an actual device or browser** — same caveat as Phase 1A, please test before launch.

---

## Phase 2 — Production hardening

Depends on: 1A + 1B functionally complete.

- [x] **Concurrency test (2026-09-15):** fired `processReturnWindowExpiry` and `approveCommission` twice in parallel each, against real dev-DB rows. In both cases exactly one call won (the atomic `updateMany` status-guard rejected the loser) and exactly one reward/commission row was created — no double-crediting. Test data fully cleaned up and verified absent afterward.
- [x] **Audit logging gap found and fixed (2026-09-15):** the Q12 "commission already paid, no clawback" event in `affiliateService.js#onOrderReturned` was only `console.warn`'d — a real financial-loss event the business had no way to query. There is no affiliate-side audit-log table at all, so this now writes into `referral_admin_logs` (already generic: `action`/`entity_type`/`entity_id`/`previous_value`/`new_value`, already exposed via the existing, unfiltered `GET /admin/referral/activity-logs`) as `AFFILIATE_COMMISSION_LOSS_ABSORBED`. Verified on dev: the event persists and is queryable by `entity_id`/`action`. All other reversal paths (referral full/partial return, affiliate approved-commission reversal) already write their trail onto the entity row itself (`status_history` JSON / `affiliate_commissions.status`), which is queryable through the existing admin/dashboard endpoints — no gap there.
- [x] **Regression pass (2026-09-15):** Phase 1A/1B already verified the happy path end-to-end; this pass targeted the paths only exercised at the individual-service level before, now driven through the actual central `orderLifecycleHooks.js` dispatcher every controller calls. 4/4 checks against real dev-DB rows: `onOrderStatusChanged(id, "Cancelled")` correctly fails a referral transaction and correctly triggers the Q12 loss-absorption path (and logs it) on a PAID affiliate order; `onOrderPartiallyReturned` correctly reduces the referral order amount and increments the affiliate return amount. All hook import/call wiring across `dao/order.dao.js`, `orderController.js`, `riderOrderController.js`, `sellerController.js`, `returnOrderController.js`, and `orderFulfillmentService.js` re-verified intact via grep — no dangling or duplicate wiring. Test data fully cleaned up.
- [x] **Config review (2026-09-15):** current dev values — `return_window_days` 7, `reward_validity_days` 7, `min_order_value` ₹200, `referrer/referee_reward_amount` ₹75/₹75, `min_withdrawal_amount` ₹100 (referral); `commission_hold_days` 7, `default_commission_rate` 5%, `minimum_payout_amount` ₹500, TDS 5%/20% with/without PAN (affiliate). You've reviewed and accepted these as-is.
- [x] **`referral_configs.is_enabled` flipped to `true` on dev (2026-09-15)**, per your explicit instruction, so the referral flow can now be exercised end-to-end in testing. **Prod stays `false`** until you decide to launch — this was not touched on prod.
- [ ] **Apply the Phase 0 idempotency-constraints migration to production** — verified working on dev; you've asked to run this yourself rather than have it applied for you. File: `prisma/migrations/20260915120000_add_growth_program_idempotency_constraints/migration.sql`.

**Acceptance criteria:** the system survives duplicate/concurrent hook invocation without double-paying (verified on dev), every reversal is logged and auditable (verified on dev), and the business has reviewed the live config values. Still open: full regression pass, and applying the dev-verified migration + enabling the program on production (both explicitly deferred to you).

---

## Phase 3 — Web parity (post mobile, same 1-month window if time allows; otherwise immediately after)

- [x] **Verification (2026-09-15):** as expected, `frontend-deployed` was already correct against the backend — `referralApi.js`, `ReferralContext.jsx`, `ReferralDashboard.jsx`, `ReferralHistorySection.jsx`, `WithdrawModal.jsx`, `ShareReferralModal.jsx`, `affiliateApi.js`, `AffiliateDashboard.jsx`, and `AffiliateApplicationForm.jsx` all use the real snake_case field names and correct request bodies — no fixes needed. These were confirmed to be the actual reference implementations the mobile screens were built against.
- [x] **Real gap found and fixed — web never attributed orders to affiliates (2026-09-15):** same bug class as the mobile app before its Phase 1B fix. `AffiliateTracker.jsx` correctly records clicks (`initAffiliateTracking`), but `getOrderAttribution()` had **zero callers** anywhere in the checkout flow, and `POST /affiliate/convert` was never called after a successful order — meaning every web affiliate sale went unattributed. Fixed by adding `recordAffiliateConversion(orderId)` to `affiliateTracking.js` and calling it from `handlePaymentSuccess` in `src/app/pages/cart/page.jsx`, the single callback all three payment paths (Wallet, Razorpay, COD) already funnel through.
- [x] **Real gap found and fixed — pending referral code from `/ref/:code` was never applied after login (2026-09-15):** the referral landing page stores `pending_referral_code` in `localStorage` when a logged-out visitor lands on it, but nothing in the entire web app ever read that key back — the mobile equivalent (`useAuthFlow` prefill) exists, the web one didn't. Built `PendingReferralApply.jsx` (mounted in `ClientLayout.jsx` next to `AffiliateTracker`, same pattern): watches for `currentUser` becoming set and applies the stored code once via the already-working `applyReferralCode`/`/referral/apply-code` endpoint, then clears it.
- [x] Confirmed the `/ref/:code` web landing route built in Phase 1A serves both purposes correctly: attempts the app's custom scheme first, falls back to a web UI with copy/apply-if-logged-in/login-redirect.

**No backend changes were needed for Phase 3** — both fixes are new frontend consumers of endpoints (`/affiliate/convert`, `/referral/apply-code`) already verified end-to-end against dev in Phase 0/1A/1B, so no additional dev-DB testing was required. **Not run in an actual browser** — same caveat as the mobile UI work; please test the full click → order → conversion loop and the pending-code-then-login loop before launch.

**Acceptance criteria:** web referral/affiliate flows produce identical, correct results to mobile, using the same backend hooks — no separate logic path.

---

## Phase 4 — Marketing Controls (PDF's "Phase 2") — IMPLEMENTED 2026-09-16

Not to be confused with our own Phase 2 above (production hardening) — this is the PDF roadmap's separate "Marketing Controls" phase: granular acquisition/withdrawal toggles so marketing/ops can pause specific activity without an engineering change, without touching in-flight financial obligations.

**Locked decisions (Q1–Q10, grilled with the user):**
- Q1/Q2: campaigns stay administrative/inert this phase — no reward-calculation effect, no separate affiliate campaign table; a unified `Campaign → CampaignRules → {Referral, Affiliate}` model is deferred to the next phase (PDF's "Campaign + Reward Rules Engine").
- Q3: toggles are acquisition/withdrawal-level only — never core financial lifecycle processing (delivery/return/expiry stay system-controlled, un-switchable).
- Q4: affiliate admin actions must be audited — previously had zero audit trail.
- Q5: `program_enabled` (existing `is_enabled` column, both configs) is a **hard override** on every sub-toggle below it.
- Q6/Q7: existing users/affiliates keep full dashboard/balance/history/withdrawal access when the program is OFF — only new acquisition is blocked. Nothing was hidden that wasn't already hidden before (dashboards never gated on `is_enabled` to begin with).
- Q8: `new_links_enabled` OFF blocks `generateLink` only — existing links keep tracking clicks and earning commission normally.
- Q9: fix referral's dead `withdrawal_enabled` enforcement (field existed, `requestWithdrawal()` never checked it) and add the same field + enforcement to affiliate's `requestPayout()`.
- Q10: `new_referral_signups_enabled` gates `POST /referral/apply-code` only — not `generate-code`, not `validateReferralCode`.

**Schema (migration `20260915190000_add_growth_program_marketing_toggles`, applied to dev, verified working):**
- `referral_configs.new_referral_signups_enabled` (new)
- `affiliate_configs.new_applications_enabled`, `new_links_enabled`, `withdrawal_enabled` (all new — affiliate had no withdrawal-pause capability at all before this)

**Enforcement added:**
- `referralService.js#applyReferralCode` — checks `is_enabled` + `new_referral_signups_enabled` (Q5 hard-override, Q10 scope)
- `referralService.js#requestWithdrawal` — now actually checks `withdrawal_enabled` (real bug fix: the field existed and the web dashboard already read it to hide the button, but the API itself never enforced it — direct calls could withdraw regardless)
- `affiliateApplicationController.js#applyForAffiliate` — checks `is_enabled` + `new_applications_enabled`
- `affiliateDashboardController.js#generateLink` — checks `is_enabled` + `new_links_enabled`
- `affiliateDashboardController.js#requestPayout` — checks `withdrawal_enabled`

**Audit logging (Q4/Q9) added to `affiliateAdminController.js`** via the existing generic `referral_admin_logs` table (same one already used for the Q12 loss-absorption event) — `updateConfig`, `upsertCommissionRate`, `deleteCommissionRate`, `approveApplication`, `rejectApplication`, `updateAffiliate`, `approveOrderCommission`, `cancelOrderCommission`, `updatePayout` all now write who/when/what-changed. Referral's admin actions were already audited (`logAdminAction` pre-existing in `adminReferralController.js`) — no gap there.

**Effective-state exposed to clients** (so mobile/web can react without duplicating the override logic): `GET /referral/stats` now returns `new_signups_enabled`; `GET /affiliate/dashboard` now returns `program_enabled`/`new_links_enabled`/`withdrawal_enabled`; `GET /affiliate/application-status` returns `new_applications_enabled` when there's no existing application. All three already fold in the Q5 hard-override so the frontend never has to re-derive it.

**Admin panel (`admin-deployed`) updated** — `Pages/Referral/Config` and `Pages/Affiliate/Config` now expose all the new toggles with in-UI explanations of the override/existing-users-unaffected behavior. Full `vite build` passes.

**Verified on dev (7/7 scripted checks):** apply-code blocked/unblocked by the signups toggle while generate-code and validate-code stay unaffected (Q10); referral withdrawal blocked by the withdrawal toggle; affiliate config reflects the new-applications toggle; an affiliate admin action persists to and is queryable from `referral_admin_logs`. All config values restored to their originals afterward, no orphaned test data.

**Not done, tracked in [`docs/GROWTH_PROGRAM_DEFERRED_FOLLOWUPS.md`](./GROWTH_PROGRAM_DEFERRED_FOLLOWUPS.md):** mobile/web pre-emptive "paused" banners (currently shows the raw, already-correct API error instead) and a campaign admin UI (campaigns stay inert this phase per Q1, so there's nothing to manage yet — **built in Phase 5 below**). Both are explicitly deferred until their blocking backend work lands — see that file for what unblocks each one.

---

## Phase 5 — Campaign + Reward Rules Engine (PDF's "Phase 3") — IMPLEMENTED 2026-09-16

Grilled across three rounds (Q1–Q8 architecture, Q9–Q15 order-lifecycle model, Q16–Q17 concrete schema), all locked with the user's explicit "proceed with implementation" confirmation. Full Q&A preserved in the session transcript; summary of locked decisions:

**Architecture (Q1–Q8):** one unified `Campaign → CampaignRules → {Referral, Affiliate}` model, not separate per-channel systems. v1 rule dimensions: category/product scope, date range, reward type (%/fixed), max cap, min order value, total usage limit, active flag — brand/store scoping, new-customer/first-order/payment-method eligibility, and per-user usage limits explicitly deferred. A matching campaign fully **replaces** the default reward/commission for that order/item — never stacks. Specificity resolves conflicts (product > category > store-wide), not an admin-facing priority field. `affiliate_category_commissions` stays as the permanent no-campaign-active baseline, untouched. The dead `referral_campaigns` stub (table + CRUD + routes, zero callers, unreachable from the admin panel) was removed rather than kept alongside the new engine. Campaign admin UI shipped this phase (unblocking the Phase 4 deferred item). Backend + admin only — no customer-facing campaign banners yet (tracked as a new deferred item).

**Order-lifecycle model (Q9–Q15):** referral matches at the **order level** (one campaign decision per order, most-specific match across items wins); affiliate matches **per line item** (unchanged summation architecture, each item independently resolves campaign → category → default). Both persist an immutable snapshot alongside a `campaign_id` FK — the snapshot, not the live campaign row, is authoritative for money, since a campaign can be edited/deactivated after the order that used it. Usage limit is a count of qualifying orders, not a rupee budget; reversal/return never frees a consumed usage slot. `min_order_value` is always checked against the whole order's eligible base, even for affiliate's per-item matching. Campaign evaluation happens inside the existing `onOrderPlaced` (referral) / `calculateCommission` (affiliate) flow — same moment reward/commission is already first computed — and never touches attribution, which is resolved earlier and untouched.

**Concrete schema (Q16–Q17):** `campaign_rules.campaign_id` is `@unique` — one campaign, one rule in v1 (relaxing to many rules per campaign later is just dropping that constraint, no reshape). `campaigns.channel` is a single enum (`REFERRAL`/`AFFILIATE`), no `BOTH` in v1. Because affiliate matches per item, a single order can touch multiple distinct campaigns — `affiliate_orders`/`affiliate_commissions` carry both a `campaign_id` convenience field (set only when exactly one campaign contributed) and an authoritative `campaign_breakdown` JSON array (one entry per item, campaign-sourced or baseline). `referral_transactions` carries `campaign_id` + `campaign_name` + `applied_reward_type` + `applied_reward_value`, where `applied_reward_value` is the final, already-capped rupee amount computed at match time — not a rule reference to re-derive later.

**One judgment call made during implementation, not separately grilled:** a campaign's `reward_value` configures the **referrer's** reward only; the referee's flat signup bonus (`referee_reward_amount`) always comes from the config default regardless of any matching campaign. Reasoning: campaigns are a referrer-incentive marketing tool ("earn more this week"), not a referee-signup one, and this avoids adding a second reward_value axis to the schema. Flagged here for visibility — revisit if the business wants campaigns to also vary the referee's welcome bonus.

**Schema added:**
- `campaigns` (name, channel, starts_at/ends_at, usage_limit, used_count, is_active, created_by)
- `campaign_rules` (campaign_id UNIQUE, scope_type/scope_id, reward_type/reward_value, max_reward_cap, min_order_value)
- `campaign_usage` (campaign_id, order_id, channel; UNIQUE(campaign_id, order_id) — the idempotency guard)
- `referral_transactions.campaign_id/campaign_name/applied_reward_type/applied_reward_value`
- `affiliate_orders.campaign_id/campaign_name/campaign_breakdown`, `affiliate_commissions.campaign_id/campaign_name/campaign_breakdown`
- Dropped: `referral_campaigns`

**New shared module:** `services/campaignEngine.js` (rules.md 19.13 centralization) — `getActiveCampaignRules`, `matchRuleForItem` (specificity), `computeRuleAmount` (cap-aware), `reserveCampaignUsage` (atomic compare-and-swap + idempotency-guarded usage row), `matchReferralCampaign` (order-level, referral-specific).

**Enforcement wired:**
- `referralService.js#onOrderPlaced` — matches/reserves a campaign after the concurrency guard wins (avoids wasting a usage slot on the losing side of a race), snapshots it onto the transaction
- `referralService.js#processReturnWindowExpiry` — uses the snapshot verbatim when present, falls back to `calculateRewardAmounts` (flat/tiered config) otherwise
- `affiliateService.js#calculateCommission` — now takes `eligibleBase`/`orderId`, matches campaigns per item before falling to category/default rate, reserves one usage slot per distinct contributing campaign
- `affiliateService.js#approveCommission` — copies the campaign snapshot from `affiliate_orders` onto the new `affiliate_commissions` row

**Admin panel:** new `Pages/Marketing/Campaigns` (list/create/edit/toggle/delete, product/category picker, usage display), wired into the sidebar as a top-level "Campaigns" item and `admin/campaignController.js` + `routes/campaignRoutes.js` (`/api/admin/campaigns`, plus `/lookup/products` and `/lookup/categories` for the picker). `vite build` passes clean.

**Verified on dev (16/16 + 5/5 scripted checks, two separate scripts, both cleaned up after):** product-beats-category specificity with correct amounts; multi-campaign-per-order breakdown recorded correctly; usage idempotency (retry doesn't double-count); usage-limit enforcement under a simulated race (3rd order correctly denied a slot while the already-computed campaign rate stands, as documented); `min_order_value` gate; date-range boundary exclusion; referral order-level matching and its "no scope overlap → no match" case; and the full `onOrderPlaced` → `processReturnWindowExpiry` path crediting the exact campaign-snapshotted amount to the referrer's real wallet balance, with dev state reverted after.

**Not done, tracked in [`docs/GROWTH_PROGRAM_DEFERRED_FOLLOWUPS.md`](./GROWTH_PROGRAM_DEFERRED_FOLLOWUPS.md):** multi-rule campaigns, dual-channel (`BOTH`) campaigns, brand/store scoping, new-customer/first-order/payment-method eligibility flags, per-user usage limits, customer-facing campaign banners. Migration for this phase also pending on prod (same standing preference — user applies it themselves).

---

## Phase 6 — Membership (PDF's "Phase 4") — IMPLEMENTED 2026-09-16

Grilled across two rounds (Q1–Q2 purpose/scope, Q3–Q7 mechanics), locked with explicit "proceed with implementation" confirmation, plus one implementation-round constraint the user added afterward (monotonicity must survive config edits).

**Purpose (Q1) locked as retention/recognition tiers, not the PDF's literal free-trial/inactive/paid-plan gate:** referral-performance tiers (Bronze/Silver/Gold/...) that are purely additive — nothing a user already has can be taken away. The PDF's monetization-flavored reading (earning gate, paid reactivation) and a separate paid-subscription product were explicitly rejected as bigger, separate business decisions, not hidden inside this implementation.

**Scope (Q2) locked as referral-only.** Affiliate keeps its own independent, already-working `tier_name`/`tier_bonus` mechanism untouched — no unified cross-program "growth tier" abstraction was introduced.

**Mechanics (Q3–Q7):**
- Qualifying referral = `COMPLETED` status, the same point `successful_referrals` already increments (inside `processReturnWindowExpiry`) — no second referral-counting mechanism.
- Tiers are lifetime-cumulative and monotonic — no time window, no tier expiry, no scheduled recalculation.
- Storage is a JSON field on `referral_configs`, not a new table — a dedicated table would over-build a short, rarely-edited ordered list.
- **Single shared tier ladder**: `tiered_rewards_config.tiers` gained a `name` field and is now read by two independent consumers — membership derives *status* (`current_tier`) from it, the pre-existing reward calculation independently derives the *bonus amount* from it. One source of truth prevents the two from drifting apart (e.g. "Silver" meaning different thresholds in two places). Membership itself never touches reward calculation — the two paths remain logically separate even though the config is shared.
- v1 ships status/display only: `current_tier`, next tier, and referrals-remaining, computed at read time. No new tier-driven reward/multiplier/gate — any future "tier unlocks X" mechanic is a deliberately separate decision.

**Monotonicity-under-config-change constraint (added after the mechanics round, before implementation):** if an admin raises a tier's threshold after a user has already achieved it, the system must not revoke that user's tier. Implemented by only ever writing `current_tier` forward — `processReturnWindowExpiry` computes the freshly-derived tier from the current ladder and compares its rank against the currently *persisted* tier; it writes only if the new rank is higher, never lower. A threshold increase that would otherwise "unqualify" an existing tier simply never overwrites the stored (higher) value.

**Schema:** none — both fields already existed (`referral_configs.tiered_rewards_config` Json, `user_referral_profiles.current_tier` String?, previously scaffolded but never written by any code path). This phase is a zero-migration phase.

**Code added:**
- `referralService.js` — `deriveTierName(successfulReferrals, tiers)` (pure), `tierRank(tierName, tiers)` (monotonicity comparator), `getMembershipStatus(profile, config)` (read-time progress computation)
- `processReturnWindowExpiry` — after `successful_referrals` increments, derives and conditionally persists `current_tier` using the rank guard above
- `referralController.js#getStats` — now returns `next_tier`, `next_tier_threshold`, `referrals_to_next_tier` alongside the existing `current_tier`

**Admin panel:** `Pages/Referral/Config` gained a "Membership Tiers" card — an editable tier-ladder table (name/min-referrals/reward per row, add/remove), plus the `tiered_rewards_enabled` toggle with an explicit note that the tier *badge* always shows regardless of that toggle (only the reward-amount bump is gated by it). `vite build` passes clean.

**Mobile (`bbm-app`):** `ReferralContext.tsx`'s `ReferralStats` interface gained the four new optional fields; `ReferralDashboard.tsx` shows a tier badge + "N more to {next tier}" card between the referral-code card and the wallet card, rendered only when a tier or next-tier exists (no empty section when no ladder is configured). `tsc --noEmit` shows zero new errors (three pre-existing, unrelated errors remain in other files).

**Web (`frontend-deployed`):** not done this phase — consistent with the standing "mobile APIs first" priority. Tracked as a new deferred item in `GROWTH_PROGRAM_DEFERRED_FOLLOWUPS.md`; the API already returns everything needed.

**Verified on dev (9/9 scripted checks):** `deriveTierName` pure-function correctness at and around thresholds and with an empty ladder; a real `processReturnWindowExpiry` run crossing the Silver threshold correctly derives and persists the tier; and the monotonicity constraint specifically — raising Silver's threshold after a user already achieved it does not revoke their persisted tier. Config and profile state restored to originals afterward.

---

## Phase 7 — Analytics (PDF's "Phase 5") — IMPLEMENTED 2026-09-16

Grilled in a single round (Q1–Q4), locked with explicit "proceed with implementation" confirmation and no second round needed — the scope was well-bounded by what already existed to extend/fix.

**Scope (Q1) locked as per-program, not a new unified cross-program page.** Each program's existing dashboard (Referral, Affiliate) or admin page (Campaigns, Membership's home on the Referral dashboard) got its analytics extended in place. A combined executive "Growth Analytics" view was explicitly deferred as a separate IA decision.

**A real, pre-existing bug was found and fixed as part of this phase, not introduced by it:** `adminReferralController.js#getAnalytics`'s `daily_signups` used `groupBy(by: ["created_at"])` on a precise `timestamptz` column — grouping by exact millisecond, not by calendar day. The frontend fetched this field but never actually rendered it (silently dead), so the bug had zero visible impact until this phase built a real chart against it. Fixed with a raw SQL query bucketing by `(created_at AT TIME ZONE 'Asia/Kolkata')::date` — the app's business timezone (matches the `en-IN` date formatting already used throughout the admin panel) — verified directly against a UTC-late-night timestamp that crosses into the next IST calendar day, confirming the boundary is handled correctly, not just that the query runs.

**Locked implementation constraints, all honored:**
- Aggregate in Postgres, never in Node — every new query is a `groupBy` or raw SQL `GROUP BY`, nothing fetches raw rows to bucket/sum in JS.
- No new analytics tables — every number comes from existing tables (`referral_transactions`, `user_referral_profiles`, `affiliate_clicks`, `affiliate_orders`, `affiliate_commissions`) via live queries.
- No caching/pre-aggregation layer — deferred until a specific query is proven slow at scale.
- Campaign attribution uses the **persisted snapshot/association**, not a reconstruction of historical matches: referral (order-level matching, Q9) sums the scalar `referral_transactions.campaign_id` + `referrer_reward_amount` for `COMPLETED` rows; affiliate (per-item matching, Q9, so a single order can touch several campaigns, Q16) instead scans `affiliate_commissions.campaign_breakdown` via `jsonb_array_elements` — the scalar `campaign_id` convenience field on that table is incomplete for multi-campaign orders, so attribution deliberately does not use it. Both paths batched across the whole page (one query per channel, not per campaign row) — verified with a synthetic multi-campaign-breakdown row that the sum correctly picks out only the matching entry (30 of a 40 total), not the whole order.
- Top-performer lists (`top_referrers`, already existed; `top_affiliates`, new) stay bounded (`take: 10`) and the new affiliate one does one batched profile lookup for display info, not a query per row.

**Endpoints:**
- `adminReferralController.js#getAnalytics` — added real day-bucketed `daily_signups`, added `tier_distribution` (membership, `groupBy` on `current_tier`); `status_breakdown`/`top_referrers` unchanged
- `affiliateAdminController.js#getAnalytics` (new) — `GET /api/admin/affiliate/analytics` — day-bucketed clicks (`affiliate_clicks`) merged with day-bucketed orders (`affiliate_orders`) into one trend series (affiliate is the one program with real click tracking, so this is a genuine click→order funnel), `commission_status` breakdown, `top_affiliates` by approved commission
- `dao/campaign.dao.js#getAttributedAmounts` (new) + wired into `campaignAdminController.js#listCampaigns` — batched attribution per campaign, added as `attributed_amount` on each list row

**Admin panel:** `Pages/Referral/Dashboard` gained a real `recharts` line chart for the signup trend and a tier-distribution card; `Pages/Affiliate/Dashboard` gained a two-line clicks/orders chart, a commission-status card, and a top-affiliates card (previously had zero analytics, only bare counts); `Pages/Marketing/Campaigns` gained an "Attributed" column. `recharts` was already an installed dependency, unused until now. `vite build` passes clean.

**Verified on dev (3/3 scripted checks + one standalone SQL boundary check):** the day-bucketing query executes and returns correctly-typed rows (JS `Date`/`number`, not raw SQL types); a real `COMPLETED` referral transaction's attribution sums correctly via the scalar path; a synthetic affiliate commission with a mixed campaign/non-campaign `campaign_breakdown` correctly attributes only the campaign-sourced portion; and a literal UTC timestamp one before-midnight-IST edge case confirmed the timezone conversion buckets to the correct IST calendar day. Test script and all created rows cleaned up after.

**Not done, tracked in [`docs/GROWTH_PROGRAM_DEFERRED_FOLLOWUPS.md`](./GROWTH_PROGRAM_DEFERRED_FOLLOWUPS.md):** referral click tracking (blocks a referral funnel equivalent to affiliate's), cohort/retention analysis, revenue attribution beyond what's listed, exportable analytics reports, a unified executive Growth Analytics page, any customer-facing analytics.

---

## Phase 8 — Complete Mobile Growth Experience (PDF's "Phase 6") — IMPLEMENTED 2026-09-16

Grilled in a single round (Q1–Q4), locked with explicit "proceed with implementation" confirmation, plus the user's own follow-up component-boundary/QR-contract/fallback-handling refinements — no second grilling round needed.

**Scope locked tight, deliberately:** dedicated WhatsApp + SMS buttons on top of the existing generic native share, QR generation only (no scanner), referral + affiliate both supported via one shared component. Explicitly deferred: contacts permission/picker/bulk-invite, QR scanner, Universal Links/Android App Links, per-social-network integrations, any new backend referral/share tracking.

**Pre-existing infrastructure this phase deliberately built on rather than duplicated:** both `ReferralDashboard.tsx` and `affiliate-generate-link.tsx` already had ad hoc copy/native-share code before this phase; the custom-scheme deep link (`bigbestmart://ref/CODE`) and — critically — the web fallback (`frontend-deployed`'s `/ref/[code]` page, wired to `PendingReferralApply.jsx` since Phase 3) already existed. Confirmed **no Universal Links / Android App Links are configured** (`app.json` has no `associatedDomains`/`intentFilters`), so a QR/link opens the browser today rather than the app directly — harmless for attribution since the web fallback already captures the code, but explicitly named as the reason QR-scanning app-to-app isn't in scope yet.

**New shared component:** `components/growth/SharedGrowthSharing.tsx` — takes `shareUrl` + `shareMessage` + `accentColor`, renders Copy / WhatsApp / SMS / native Share / QR-toggle. Consumed identically by `ReferralDashboard.tsx` and `affiliate-generate-link.tsx`'s result screen; their old, independently-written copy/share handlers were deleted (dead code) rather than left alongside the new component.

**Channel behavior:**
- WhatsApp uses `https://wa.me/?text=...` (a universal https link WhatsApp itself registers on both platforms) rather than the `whatsapp://send` custom scheme — avoids needing an `LSApplicationQueriesSchemes` declaration in `app.json` (a native-config change explicitly out of scope this phase).
- SMS uses `sms:&body=...` on iOS / `sms:?body=...` on Android — the standard cross-platform quirk for a body-only compose intent with no recipient number (there's no recipient because contact-picking is deferred, Q1).
- Every channel opener wraps `Linking.openURL` in a try/catch that falls back to the native share sheet on failure — handles "app not installed" without needing `canOpenURL`/scheme declarations for channels this phase doesn't own the native config for.
- QR encodes the plain **existing HTTPS URL** (`https://bigbestmart.com/ref/CODE` for referral, `result.full_url` for affiliate) — not a new/custom payload format — so enabling Universal Links later changes only what that URL resolves to, not the QR contract itself.

**New dependencies:** `react-native-svg` + `react-native-qrcode-svg` (installed via `expo install` for SDK-compatible versions) — no other libraries added, no native config/plugin changes.

**Verified:** `tsc --noEmit` shows zero new errors introduced (the same three pre-existing, unrelated errors remain elsewhere in the app). No backend changes this phase, so no dev-DB verification script was needed.

**Not done, tracked in [`docs/GROWTH_PROGRAM_DEFERRED_FOLLOWUPS.md`](./GROWTH_PROGRAM_DEFERRED_FOLLOWUPS.md):** contacts permission/picker/bulk-invite, in-app QR scanner, Universal Links/Android App Links configuration, per-social-network deep links beyond WhatsApp/SMS.

---

## Phase 9 — Marketing Control Center (PDF's final phase) — IMPLEMENTED 2026-09-16

Grilled in a single round (Q1–Q3), locked with explicit "proceed with implementation" confirmation plus the user's own migration-shape clarification (non-null `program` default, unique-per-type templates) — no second round needed.

**A real, live bug was discovered and fixed while implementing Q2, not introduced by it:** `adminReferralController.js#reviewFraudLog` (and the `FraudLogs` admin page that calls it) already read/wrote `status`, `reviewed_by`, `reviewed_at`, `review_notes`, `action_taken`, `action_taken_by`, `action_taken_at` on `referral_fraud_logs` — none of which existed on that model (only `resolved`/`resolved_at`/`resolved_by`/`resolution_note` did). Every fraud-log review attempt was throwing a Prisma "unknown argument" error; the feature has apparently never worked. Discovered because adding `program`-scoped filtering meant touching this exact code path. Fixed by adding the missing columns to match what the code and admin UI already expected — verified with a real write exercising every one of those fields.

**Q1 — Notification templates, in-app only:** new `notification_templates` table (`notification_type` unique, `title_template`, `message_template`, `is_active`), consumed by a new shared `services/notificationTemplateService.js`. `createNotification` now renders through one path regardless of source: an active DB template's `{{variable}}`s are interpolated if configured, otherwise a hardcoded `DEFAULT_TEMPLATES` entry (the exact copy that used to be inline at each call site) goes through the same interpolation. All 9 `createNotification` call sites across `referralService.js` were changed to pass a `variables` object instead of pre-built strings. A `NOTIFICATION_VARIABLE_REGISTRY` (type → allowed variable names, grounded in what each call site actually has available) backs `validateTemplateVariables`, which rejects an admin-authored template referencing an unsupported `{{variable}}` at save time rather than letting it silently render empty.

**Q2 — Affiliate fraud parity via the shared table:** `referral_fraud_logs` gained a `program` discriminator (`REFERRAL` | `AFFILIATE`, non-null, defaults existing rows to `REFERRAL`) rather than a parallel `affiliate_fraud_logs` table. `logFraud` was exported from `referralService.js` (previously private) and now accepts a `program` param. `affiliateService.js#processAffiliateOrder`'s self-referral block — which already existed but silently returned `null` with no record — now also logs the attempt before blocking. `adminReferralController.js#listFraudLogs` was scoped to `program: "REFERRAL"` (it's specifically the Referral section's page); a mirrored pair (`listFraudLogs`/`reviewFraudLog`, scoped to `program: "AFFILIATE"`) was added to `affiliateAdminController.js` for a new `Pages/Affiliate/FraudLogs` admin page — no new detection heuristics beyond the self-referral logging.

**Q3 — Membership visibility on the existing Users page, no manual override:** `adminReferralController.js#listUsers` gained a `tier` query filter; `Pages/Referral/Users` shows a new Tier column and a tier filter dropdown, populated dynamically from the admin-configured ladder (not hardcoded) via the same `tiered_rewards_config` Phase 6 built. No new page, no admin-facing tier mutation — `current_tier` remains exclusively derived by `processReturnWindowExpiry`, per Phase 6's monotonicity invariant.

**Schema added:** `notification_templates` (new table); `referral_fraud_logs` gained `program`, `status`, `reviewed_by`, `reviewed_at`, `review_notes`, `action_taken`, `action_taken_by`, `action_taken_at` (the last seven being the bug fix, not new scope).

**Admin panel:** new `Pages/Marketing/Templates` (edit/reset per notification type, shows supported variables inline), new `Pages/Affiliate/FraudLogs` (mirrors the existing Referral one), `Pages/Referral/Users` extended with tier column/filter. New sidebar entries: top-level "Notification Templates," "Fraud Logs" added to the Affiliate submenu. Also removed dead `listCampaigns`/`createCampaign`/`updateCampaign`/`deleteCampaign` exports from `adminReferralApi.js` — leftover from Phase 5's route removal, confirmed unused by any page. `vite build` passes clean.

**Verified on dev (10/10 scripted checks):** template-variable validation correctly rejects an unregistered variable and accepts registered ones; default rendering interpolates correctly with no template configured; an active DB template correctly overrides the default; `createNotification` end-to-end produces a notification using the custom template text; both `REFERRAL` and `AFFILIATE` fraud logs write with the correct program and default to `PENDING_REVIEW`; and — directly proving the bug fix — a full review write exercising every one of the previously-nonexistent columns now succeeds against the real schema. All test rows cleaned up after.

**Not done, tracked in [`docs/GROWTH_PROGRAM_DEFERRED_FOLLOWUPS.md`](./GROWTH_PROGRAM_DEFERRED_FOLLOWUPS.md):** SMS/WhatsApp/Email sending infrastructure, delivery tracking, fraud detection beyond self-referral logging (device fingerprinting, velocity analysis, behavioral scoring), manual membership tier overrides, a dedicated Membership admin page.

This closes the PDF's full roadmap (Phases 1–7 mapped to this engagement's internal Phases 1–9, accounting for the naming split noted back in Phase 4).

---

## Explicitly out of scope for this release

Membership (Q13), full Campaign/Rules engine (Q5 — architecture documented only), referral click analytics/QR tracking (Q14), unified Growth Earnings wallet (Q4), points/gamification, advanced fraud detection beyond existing fraud logging, multi-channel notification CMS (SMS/WhatsApp/email templates).

---

## Open items carried forward (not blocking this release)

- Unified `Campaign` + `CampaignRules` model (Q5) — design direction locked, implementation targeted for the phase after this one, once referral/affiliate lifecycle correctness is proven in production.
- Membership (Q13) — depends on qualifying referral transactions being reliable; earliest sensible start is after Phase 2 hardening ships.
- Whether reward-base formula (Q2) needs a wallet-usage-per-order field — currently judged unnecessary since rewards key off `subtotal`, not cash collected; revisit only if percentage-based referral rewards are introduced later.
- **Migration not yet applied to any database** — run `prisma/migrations_manual/20260915_add_growth_program_idempotency_constraints.sql` against dev then prod, then `npx prisma migrate resolve --applied ...` and `npx prisma generate`.
- Partial-return reversal (`onOrderReturned("PARTIAL", ...)`) has no DB-level idempotency guard, only a controller-level "previous status wasn't completed" check — acceptable for now since it's admin-triggered, not automatically retried, but worth hardening in Phase 2 if it proves fragile.
- `orderFulfillmentService.js`'s aggregation has a pre-existing logic quirk unrelated to this work: an order where every sub-order is `cancelled` (none delivered) is still classified `newParentStatus = 'Delivered'` (the `allFinalStatus` check treats delivered+cancelled as equivalent). This means a fully-cancelled multi-seller order could fire the referral/affiliate delivered hook. Not fixed here (out of the Q1–Q14 scope, a pre-existing business-logic bug, not a Q11 casing issue) — flagging for a decision.

---

## Dead / redundant code found during implementation

Audited using the grep-based method (real cross-file grep, not a knowledge-graph tool) — every function below was independently verified to have zero callers.

**Removed (unambiguous, zero callers anywhere, not even internally):**
- `referralService.js` — `getReferralProfile()`: fully superseded by `getOrCreateReferralProfile()`, which is the one actually used everywhere. Classic partial-refactor leftover.
- `affiliateService.js` — `calculateTier()`: a tier-bonus calculator that was never wired to anything; `profile.tier_bonus` is read everywhere but nothing ever computed/stored it via this function.

**Left in place, flagged for your decision (not unambiguous — could be intentional/in-progress):**
- **`services/checkoutService.js` (270 lines, entire file)** — `createEnhancedOrder()` and `enhanceOrderController()` have zero external importers; nothing routes wallet-mixed checkout through this file. It also doesn't use a real DB transaction (manual `delete()` calls to "rollback" on failure) and duplicates order-creation logic that exists elsewhere. Looks like an abandoned wallet-checkout experiment. Recommend deleting, but it's a whole subsystem — your call, not done automatically.
- **`services/orderExecutor.js` / `services/scheduledOrderCron.js`** — `scheduledOrderCron.js` is itself dead (never imported anywhere, so its cron never registers). But `orderExecutor.js#createOrder` is still reachable via a live admin endpoint (`scheduledOrderController.js:523`, manual trigger), and it inserts into `orders` using field names (`total_amount`, `order_status`, `items`, `metadata`) that don't exist on the current Prisma `orders` model (which has `subtotal`/`shipping`/`total`/`status`, no `items`/`metadata` columns). This will error if that admin endpoint is ever actually used — a live latent bug, not just dead code. Out of scope to fix here (unrelated to referral/affiliate), flagging for visibility.
- `dao/affiliate.dao.js#getCommissionByOrderId()` — zero callers today. Left in place since it's a plausible admin-dashboard lookup that just hasn't been wired to a route yet, not obviously abandoned. Note: it only became call-safe once the `@@unique([affiliate_order_id])` constraint (added this round) is actually applied to the database — before that, calling it would throw a Prisma validation error.
- The dead `/api/internal/referral/order-placed|delivered|returned` HTTP routes (`routes/internalReferralRoutes.js`) — now provably redundant (direct in-process hooks replace them), but left in place this round to avoid touching routing/mounting for a cleanup that carries no functional benefit yet. Safe to delete once you've confirmed nothing external (e.g. a stale mobile build) still calls them.
