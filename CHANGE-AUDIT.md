# Change Audit

## Scope

This audit covers: **Git delta → affected backend dependencies → affected APIs → mobile/web/admin consumers → security + business logic → DEV verification.** It does **not** cover the entire codebase; unrelated legacy issues are listed only under "Remaining Issues / Out of scope".

- Branch `reffralSystem`; base `main` (`HEAD` == `main` == `origin/main`). `origin/develop` exists but the branch does not derive from it.
- The whole delta is **uncommitted** on top of `main` (no commits to review): 33 modified files, `services/checkoutService.js` deleted (no importers), ~25 new untracked files. Nothing was reset, stashed or reverted.
- All live testing used `.env.local` only (Supabase project `nwznoveitnogzgqewhoz`). DEV status was **confirmed by the user** and corroborated by migration `20260915120000` ("Applied to dev…") and the data (29 users, 0 orders). No production access, no `.env`/prod URLs. The local test server ran on `:8011`, Razorpay in TEST mode.

## Changes Reviewed

| Area | Files |
|---|---|
| Affiliate commission engine | `services/affiliateService.js`, `dao/affiliate.dao.js`, `controller/affiliate{Admin,Application,Dashboard,Tracking}Controller.js`, routes |
| Referral | `services/referralService.js`, `controller/{referral,adminReferral}Controller.js`, routes |
| Order lifecycle hooks | `services/orderLifecycleHooks.js` (new) + call sites in `order.dao`, `orderController`, `sellerController`, `riderOrderController`, `returnOrderController`, `orderFulfillmentService` |
| Campaigns / notification templates / crons | `campaignEngine.js`, `campaign.dao.js`, `campaignAdminController.js`, `notificationTemplate*`, `growthCron.js` (all new) |
| Admin catalog | `/admin/products/summary`, `/filter-options`, `/categories/stats` |
| DB | 4 new migrations, Prisma models/schema |

### Changes made by this audit (all passes)

| File | Change |
|---|---|
| `prisma/models/affiliate_orders.prisma`, `affiliate_commissions.prisma` (+ regenerated `schema.prisma`) | `@unique` on `order_id` / `affiliate_order_id` |
| `services/affiliateService.js` | discounted-price commission; reversal fixes; category-rate memo |
| `controller/affiliateAdminController.js` | approve/cancel commission state guards + status codes |
| `controller/affiliateTrackingController.js` | UUID validation on `/convert` |
| `controller/campaignAdminController.js`, `routes/campaignRoutes.js` | input validation, `:id` guard |
| `services/referralService.js` | fraud-log paging clamp |
| `middleware/authenticate.js`, `utils/jwtUtils.js` | **verify JWT signature** (HS256) instead of `jwt.decode` |
| `routes/internalReferralRoutes.js` | `authenticateToken + requireAdmin` on the whole router |
| `routes/adminProductRoutes.js`, `routes/bulkPriceRoutes.js`, `server.js` | auth on every product route (POST/PUT/PUT warehouse-mapping/DELETE, both GETs, 2 new GETs, all 4 bulk-price routes); `bulkPriceRoutes` mounted before `adminProductRoutes` so `/bulk-price-export` is no longer captured by `/products/:productId` |
| `controller/adminProductController.js` | `name` validation on create; Prisma errors mapped to 400/404/409 with no internal text in responses |
| `controller/affiliateDashboardController.js` | `requestPayout` rewritten as one atomic transaction |
| `controller/affiliateAdminController.js` | `updatePayout` transition table + atomic guard (in addition to approve/cancel) |
| `controller/adminReferralController.js` | withdrawal approve/reject/process rewritten (atomic, valid columns); manual-credit validation |
| `services/referralService.js` | atomic apply-code claim, wallet spend, withdrawal request; expiry cron guard |
| `services/affiliateService.js` (additional) | campaign usage slot reserved *before* pricing |
| `admin-deployed` (**separate git repo**): `src/utils/backendApi.js`, `src/Pages/Products/AddProduct.jsx`, `src/Pages/WarehousePages/InventoryManagement.jsx`, `src/Pages/ProductSections/index.jsx` | send `Authorization` on the product calls that had none (create/update/delete + 4 GETs) |
| `services/membershipService.js`, `prisma/models/{membership_plans,user_memberships,membership_referral_credits,membership_status_log}.prisma`, migration `20260920100000_*`, `services/growthCron.js`, `controller/referralController.js` | Free membership Release 1 (see section below) |
| `postman/*`, `CHANGE-AUDIT.md` | new |

## Bugs Found

| # | Sev | Root cause | API | Impact | Fix | Test |
|---|---|---|---|---|---|---|
| 1 | P1 | Prisma models lacked `@unique` matching the migration; `findUnique({where:{order_id}})` threw and was swallowed | `POST /affiliate/convert`, approve, reversal | **No affiliate order could ever be attributed** | `@unique` + regenerate | convert/duplicate/parallel ×4 → exactly 1 row |
| 2 | P0/P1 | `cancel-commission` had no state guard/transaction | `POST /admin/affiliate/orders/:id/cancel-commission` | double-cancel or cancel-after-approve decremented balances again | atomic PENDING-only transaction; 409 otherwise | cancel ×2, cancel approved, approve cancelled |
| 3 | P1 | Commission computed on undiscounted price while stored base was discounted | `/affiliate/convert` | over-paid commission (₹50 vs ₹45), stored rate 5.56% | see "Commission Business Rule" | cases 1–10 |
| 4 | P1 | New product routes unauthenticated | `/admin/products/summary`, `/filter-options` | data exposed | admin guard | 401/403/200 |
| 5 | P2 | approve repeat → 200 `data:null` + duplicate audit; missing → 500; bad id → 500 | approve-commission | misleading, noisy audit | 409 / 404 / 400 | ✓ |
| 6 | P2 | `total_commission_earned` not reversed on return/cancel | lifecycle reversal | inflated lifetime stat | decrement in both branches | ✓ |
| 7 | P2 | Non-UUID `order_id` → Prisma error → 500 | `/convert` | 500 on client error | 400 | ✓ |
| 8 | P2 | NaN page / negative or unbounded limit → 500/odd results | fraud-logs lists | | clamp page≥1, limit 1–100 | ✓ |
| 9 | P2 | Campaign validation gaps (invalid date, NaN, oversize decimal, non-UUID scope, negative limits) → 500 or bad data | `/admin/campaigns` | | validator + `:id` guard | 14 negative cases |
| 10 | **P0** | `updatePayout` had no transition guard/transaction | `PUT /admin/affiliate/payouts/:id` | COMPLETED twice double-counted `total_commission_paid` and drove `processing_balance` negative; FAILED after COMPLETED **re-credited the available balance** (money creation); any status string accepted | transition table (COMPLETED/FAILED/REJECTED terminal), atomic status guard in a transaction, 400 invalid status/id, 409 repeat | t7 |
| 11 | **P1** | `requestPayout` deducted TDS twice (`final_amount` is already post-TDS) and was check-then-write | `POST /affiliate/payouts/request` | payout recorded gross 570 / net 540 for a ₹600 commission (₹30 TDS) instead of 600 / 570; parallel requests → 201 + 500 + 500 | one transaction: atomic claim of APPROVED commissions first, then payout + balance move; gross=Σgross_commission, tds, net=Σfinal_amount; concurrent → 409 | t7 |
| 12 | **P0** | Wallet spend accepted negative amounts and was check-then-write | `POST /referral/wallet/spend` | `amount:-50` **increased** the balance; 3 parallel spends of 50 against 75 all succeeded (balance −25, usage 150) | validate amount; atomic conditional balance claim; relative reward decrements in one transaction | t8 |
| 13 | **P0** | Withdrawal request checked balance outside the transaction | `POST /referral/withdraw` | 3 parallel requests all succeeded → balance −216; NaN amount not rejected | validation + atomic conditional decrement (row-lock serialises; monthly limit counted inside) | t8 |
| 14 | **P0** | `rejectWithdrawal` had no state guard | `PUT /admin/referral/withdrawals/:id/reject` | every repeat (or reject of a COMPLETED withdrawal) re-credited the balance | only PENDING/APPROVED, atomic, credit once | t8 |
| 15 | **P1** | Admin withdrawal approve/process/reject wrote columns that do not exist (`admin_notes`, `processed_by`, `rejected_by`, `rejected_at`, `transaction_id`, `payment_gateway_ref`) in the model **and** DB | withdrawals admin | the whole admin withdrawal workflow always returned 500 (present on `main` too) → locked balances could never be released/completed; process was also non-atomic (double `withdrawn_amount`) | metadata kept in `status_history` JSON, real columns only (`rejection_reason`, `processed_at`); atomic transitions; 409/400/404 | t8 |
| 16 | **P1** | `applyReferralCode` was check-then-create | `POST /referral/apply-code` | 4 parallel calls created **4 referral transactions** for one referee | atomic claim of `was_referred` inside a transaction | t8 |
| 17 | **P1** | `processExpiredRewards` had no status guard | expiry cron | two overlapping runs debited the balance twice (600 for a 300 reward) | atomic status guard + re-read remaining under lock | t8 |
| 18 | **P1** | Campaign `usage_limit` did not cap affiliate commission | `/affiliate/convert` | after the cap, orders still paid the campaign rate (100 instead of 50), just with `campaign_id` null | reserve slot before pricing; exhausted → default/category rate | t8 |
| 19 | P1 | Manual credit accepted negative / NaN / unknown user | `POST /admin/referral/rewards/credit` | negative credit reduced balances; rewards created for non-existent users | validation (amount, validity, UUID, user exists) | t8 |
| 20 | P1 | `/admin/products/bulk-price-*` had no auth; `GET /bulk-price-export` unreachable (captured by `/products/:productId`, "Product not found") | bulk price | anyone could enqueue a mass price update | admin guard on all 4 routes; mount order fixed | t9 |
| 21 | P2 | `createProduct` had no validation; error handlers echoed raw Prisma text | `/admin/products` | empty body → 500 with query/schema details | 400 `name` required; Prisma errors mapped, no internals | t9 |

## Security Findings

| Finding | Status |
|---|---|
| **JWT signature not verified** — `authenticateToken` / `authenticateAdmin` / `authenticateTokenOptional` used `jwt.decode`; any forged token (incl. `role: ADMIN`) was accepted | **Fixed.** All three now use `verifyToken` (`jwt.verify`, `HS256`, expiry enforced); any failure (bad signature, expired, malformed, `alg:none`, missing `JWT_SECRET`) → 401 (fail closed). Verified: valid ADMIN 200, valid USER 403, no token 401, forged 401, `alg:none` 401, expired 401, malformed 401. All clients obtain tokens from backend login endpoints signed with `JWT_SECRET`, so they are compatible. |
| **`/api/internal/referral/*` unauthenticated** (reward/expiry mutations) | **Fixed.** Nothing calls these routes (hooks/crons run in-process via `orderLifecycleHooks`/`growthCron`), so the router now requires an authenticated admin. Verified for 5 routes: none 401, forged 401, USER 403, ADMIN 200 (idempotent no-op on repeat). |
| **`/admin/products` unauthenticated** (mutations **and** reads) | **Fixed.** POST / PUT / PUT warehouse-mapping / DELETE, `GET /products`, `GET /products/:id`, the 2 new GETs and all 4 `bulk-price-*` routes now require admin (none → 401, forged → 401, USER → 403). The 6 admin-app call sites that sent no token were updated. |
| **Raw Prisma error text in product API responses** | **Fixed** (mapped to 400/404/409/500 with generic text). |
| `/convert` ownership (IDOR) | Verified: non-owner 403, no attribution row created. |
| Affiliate self-service IDOR | Handlers derive the profile from the (now verified) token only; non-affiliate → 403/404; tampering with `?affiliate_id=` returned no foreign data. |
| **DB credential exposure** | The DEV DB password was echoed once in this session's terminal output by a failed masking command. Scan of 3,283 files (backend, admin, web, mobile, scratch logs) found it **only** in the two gitignored, untracked env files; not in reports, Postman files, source, or git history. **Rotation is still required** because the session transcript contains it. |

**Deployment prerequisite:** `JWT_SECRET` must be set in every deployed environment (neither `.env` nor `.env.local` defines it). Without it every authenticated request now returns 401 — that is intentional fail-closed behaviour. Any client still sending a non-backend-issued token (e.g. a raw Supabase session token) will now be rejected; none was found in web, admin or mobile.

## Commission Business Rule

**Confirmed rule: commission = discounted item price × commission rate.**

Original ₹1,000, discount ₹100 → commissionable ₹900, rate 5% → **₹45** (previously ₹50).

Pricing model found: `order_items.price` is already the item's selling price (variant/bulk discounts resolved server-side at order creation). Order-level `coupon_discount` and `discount_charge` are stored on `orders` but **no code allocates them to items**, so there was no "existing allocation" to reuse. Implementation (`calculateCommission`): commissionable value per item = `price × qty × min(1, eligibleBase / Σ(price × qty))`, where `eligibleBase = subtotal − coupon_discount − discount_charge` (existing `rewardCalculation.calculateEligibleOrderBase`). i.e. the order-level discount is spread **pro-rata by line value**; rounded to 2 dp per item; campaign FIXED/PERCENT rules and `min_order_value` also use the discounted values. This is the only place commission is calculated; dashboards/stats aggregate the stored `final_order_value`/`final_commission`, so they stay consistent.

> **Assumption to confirm:** pro-rata allocation of `coupon_discount` + `discount_charge`. If `discount_charge` is meant to be a charge rather than a discount, remove it from `calculateEligibleOrderBase` (shared with referral rewards).

## API Verification

Tested against the DEV database through a local server (`:8011`), with database side-effects verified after each mutation. Test tokens were signed with a **throwaway random `JWT_SECRET`** injected into the test server only.

| Area | Result |
|---|---|
| JWT matrix (valid/forged/`none`/expired/malformed/missing, admin & user) | PASS |
| Internal referral routes (5 routes × none/forged/USER + ADMIN) | PASS |
| Admin product mutations (401/403/pass-through for ADMIN) | PASS |
| Commission cases 1–5b, 9, 10 (below) | PASS |
| Repeat convert + 4 parallel converts → 1 row | PASS |
| Cancel pending ×2 (200 → 409), approve cancelled (409), approve ×2 / ×5 parallel (1 commission), cancel approved (409) | PASS |
| Delivered ×2, Cancelled ×2, approved→cancelled reversal (balances → 0, earned → 0) | PASS |
| Campaign CRUD + 14 validation cases | PASS |
| Admin list/pagination/filter endpoints | PASS |

Commission expectations (5% default unless stated; all matched):

| Case | Setup | Expected | Got |
|---|---|---|---|
| 1 | ₹1,000, no discount | 50 | 50 |
| 2a | item price ₹900 | 45 | 45 |
| 2b | ₹1,000, coupon ₹100 | 45 | 45 |
| 3 | ₹900 + ₹450 | 67.50 | 67.50 |
| 4 | ₹1,000 + ₹500, coupon ₹150 | 67.50 | 67.50 |
| 4b | 2 × ₹750, coupon ₹100 + discount_charge ₹50 | 67.50 | 67.50 |
| 5 | cat A 10% × ₹900 + cat B 2% × ₹450 | 99 | 99 |
| 5b | same rates, ₹1,500 subtotal, coupon ₹150 | 99 | 99 |
| 9 / 10 | coupon = / > subtotal | 0 (never negative) | 0 |

Category-rate memo (one lookup per distinct category) verified correct by cases 5/5b (different rates per category, repeated categories).

## Regression Results

Scripted HTTP + DB assertions (Node `fetch` + Prisma), final code:

| Suite | Passed | Failed |
|---|---|---|
| Auth matrix, convert validation, pagination (t1) | 43 | 0 |
| Financial flow: convert/approve/parallel/cancel (t2) | 17 | 0 |
| Lifecycle reversal (t4) | 7 | 0 |
| Campaign CRUD/validation (t5) | 23 | 0 |
| Security + commission cases + IDOR (t6) | 42 | 0 |
| Payouts: request/parallel/amounts, admin transitions, failure restore, cron auto-approval, PARTIAL return (t7) | 36 | 0 |
| Referral: validate/apply (+parallel), signup pause, lifecycle→reward, wallet spend, manual credit, withdrawals (+parallel, approve/process/reject), expiry cron, cancellation, campaign matching in real conversions (t8) | 79 | 0 |
| Product surface: GET/POST/PUT/DELETE guards, validation, no error leaks, bulk-price (t9) | 22 | 0 |
| **Total** | **269** | **0** |

- **Skipped:** Jest suite (`wallet`, `orderTransaction`, `stockReservation`) — unrelated to this scope and writes to the live DEV DB. No lint script exists. `npm run build` (schema compile + `prisma generate`) passes.
- **Postman:** `postman/affected-api-collection.json` (37 requests, incl. a "Security (negative cases)" folder) and `postman/dev-environment.json` (placeholders only) are structurally valid, but the **collection itself was not executed in Postman/newman**; the scripted runs above are the equivalent.
- The server log showed only expected errors (invalid-token logs and the legacy product-create error below).
- Now exercised live (previously listed as not covered): referral apply-code, reward crediting, wallet, withdrawals, payouts, campaign matching in real conversions (test campaigns created and removed), the return-window / expiry / commission-auto-approval jobs (invoked directly, incl. overlapping runs), and the PARTIAL return path.
- Still not exercised: notification-template rendering through the admin editor, the hourly/daily cron *scheduling* itself (the job functions were run directly), and Razorpay/payment flows.

## DEV Verification

- Testing used `.env.local` / DEV only; no production or `.env` values. No secret is present in this report, the Postman files, or scratch logs (scanned).
- Test rows (orders, items, affiliate orders, commissions, category rates, campaigns, fraud logs) were created for the tests and removed. Final baseline verified: **0 orders, 0 campaigns, 0 affiliate orders, 0 commissions, 0 category commissions, both affiliate profiles at 0 balances/stats**.

## Free Membership — Release 1 (added after the audit passes)

Implemented per the locked design; **paid membership (payments, Razorpay, webhooks, refunds, GST, `ACTIVE_PAID` transition) is deliberately not built.** Membership only decides *whether* a referrer may earn; referral tiers (`current_tier`) and campaigns still decide *how much* — the tier system is untouched.

| Rule | Implementation |
|---|---|
| Schema | `membership_plans`, `user_memberships` (one per user), `membership_referral_credits` (`UNIQUE(membership_id, referee_id)`), `membership_status_log` (append-only); `referral_transactions.membership_eligible` (snapshot) and `UNIQUE(referee_id)`. Migration `20260920100000_add_free_membership_foundation` (applied to DEV; seeds `FREE_DEFAULT`: 120 days, target 10, `FIRST_ORDER`). |
| Trial start | Only the first successful `POST /referral/profile/generate-code`, via idempotent `ensureMembership`, called **before** the early return (a profile/code created by apply-code still starts the trial on first explicit generate). apply-code, profile view, share-content, admin credit never start it; blocked users never start it. Existing users: lazy (no row until their first generate-code; no row = not blocked). |
| Qualification anchor | `referral_transactions.order_date` within `[trial_started_at, trial_ends_at]` (not signup, not reward-credit time). |
| Earning gate | Snapshotted in `onOrderPlaced` (`membership_eligible`): TRIAL → eligible only if order placed ≤ `trial_ends_at`; ACTIVE/ACTIVE_PAID/no membership → eligible; LAPSED/CANCELLED → not. An ineligible referral pays the **referee** bonus but no referrer reward, no `successful_referrals`, no credit. |
| Counting | Inside the existing guarded reward transaction (`processReturnWindowExpiry`): credit insert (`skipDuplicates`) → relative increment → guarded `TRIAL → ACTIVE` + log. Replay/retry/parallel-safe. Reward reversal never decrements or un-qualifies. |
| Delayed lapse | Hourly job `processMembershipLapses`: `trial_ends_at + max(grace_period_days, return_window_days) <= now`. The UPDATE is the guard (`status='TRIAL'`), so it cannot overwrite a qualification. No `LAPSED→ACTIVE`, no `ACTIVE→LAPSED`, no re-trial. |
| API | `POST /referral/profile/generate-code` and `GET /referral/profile` gain an additive `membership` object (status, dates, `lapse_at`, counted/target/remaining). |

Verified on DEV (`t10`, 32 checks, 0 failed): trial start/non-start paths incl. 5 parallel calls → 1 row and 1 log; two concurrent qualifying referrals → exactly one `TRIAL→ACTIVE`, `referrals_counted` = credit rows; replayed credit is a no-op; reversal doesn't un-qualify; trial ended 3 days ago is **not** lapsed and its in-flight referral still counts; order after `trial_ends_at` → ineligible (referee bonus only); lapse after `trial_ends_at` + 7 days, parallel runs lapse once, re-run is a no-op; a reward for an order placed while eligible still pays after the lapse; no-active-plan and blocked-user paths; DB rejects duplicate `referee_id`, bad status, duplicate credit, second membership row. Test data removed; DEV back to 0 memberships and the plan unchanged.

Deployment notes: run the duplicate pre-check in the migration header before creating the `referee_id` unique index on production; the reward transaction now sets an explicit 30s interactive-transaction timeout (Prisma's 5s default was too tight over a remote pooler). Not built yet: admin endpoints to edit plans (plans are currently changed in the DB), `REGISTRATION` count basis (modelled, not implemented), `membership_payments`.

## Remaining Issues

**Required before release**
1. **Rotate the DEV DB password** (exposed once in the session transcript; not present in any repo/report file).
2. **Set `JWT_SECRET` in every deployed environment** (neither `.env` nor `.env.local` defines it). Without it every authenticated request returns 401 (fail closed).
3. **Confirm the pro-rata allocation of `coupon_discount` + `discount_charge`** (see Commission Business Rule).
4. **Apply the five new migrations to production** first (the `20260915120000` and `20260920100000` headers say they still have to run on prod; run the duplicate `referee_id` pre-check first).
5. **Check production `affiliate_payouts` / `referral_withdrawals` before deploying.** `requestPayout` now records `gross_amount` = pre-TDS commission and moves balances by `net_amount`; any *existing* payout row created by the old code stored the post-TDS amount as `gross_amount` and would be reversed/completed by a different amount. The affiliate flow could not attribute orders on `main` (finding #1), so there should be none — verify with a count.
6. **Withdrawal admin metadata lives in `status_history` JSON**, not columns (`transaction_id`, `payment_gateway_ref`, admin notes/user). If those need to be queryable, add the columns via a proper migration + Prisma model (schema change deliberately not made here).

**Not fixed / out of scope**
- Reserved campaign usage is not released if `createAffiliateOrder` fails after the reservation (slot leak, low impact).
- Mobile `recordAffiliateConversion` clears stored attribution even on a 401/403 (`fetch` does not throw on 4xx) — P3; recommend checking `res.ok`.
- `referral_rewards (referral_transaction_id, reward_type)` unique exists in SQL but not in the Prisma model (harmless today).
- `priceInfoCheck` in `adminProductController.js` is now unused (left in place to avoid unrelated churn).
- Other unauthenticated legacy routes were not audited (scope is the delta and its dependency chain).

**Not exercised:** notification-template rendering via the admin editor, cron *scheduling* (job functions were invoked directly), Razorpay/payment flows, the Jest suite (writes to the live DEV database; unrelated to this scope).
