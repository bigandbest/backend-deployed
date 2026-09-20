# Complete Backend Analysis — Referral, Affiliate & Membership Growth Program Integration

**Repository:** `backend-deployed` (Express + Prisma, legacy monolith). This is an analysis-only document — no code was modified while producing it.

**Purpose:** Ground truth for planning the integration of a unified Referral, Affiliate & Membership Growth Program into the existing backend. Every claim below is sourced from the actual codebase (exact file paths given); anything not found is explicitly marked `NOT FOUND`.

---

## PART 1 — Project Architecture

| Layer | Technology | Evidence |
|---|---|---|
| Framework | Express 5 | `package.json` (`"express": "^5.1.0"`), `server.js`, `api/index.js` |
| Language | JavaScript (ESM) | `"type": "module"` in `package.json` |
| Package manager | npm | `package-lock.json` |
| Database | PostgreSQL (Supabase-hosted) | `@supabase/supabase-js`, `.env` DB creds |
| ORM | Prisma 5.22 (primary) + raw Supabase client (secondary, legacy) | `prisma/schema.prisma`, `config/prisma.js`; `services/walletService.js` uses `supabase.from(...)` directly — **two data-access styles coexist** |
| Auth | JWT (jsonwebtoken), cookie or Bearer token | `middleware/authenticate.js` — `jwt.verify(token, process.env.JWT_SECRET)` |
| RBAC | Static role table in code | `middleware/authorize.js` — `UserRole` enum: `USER, ADMIN, SELLER, VENDOR, RIDER`; `requireRole()`, `requireAdmin`, `hasPermission()` |
| API architecture | REST, Express Router per resource, mounted in `server.js`/`api/index.js` | e.g. `app.use("/api/internal/referral", internalReferralRoutes)` |
| Background jobs | **RabbitMQ** (amqplib) for geocode + fulfillment routing only; **node-cron** installed but almost entirely commented out | `workers/index.js`; `services/cronJobs.js` (line 68, cron commented out), `services/scheduled-jobs.js` (cron commented out) |
| Event system | **NOT FOUND** — no `EventEmitter`, no domain events. Cross-module effects are done via direct function calls or **internal HTTP endpoints** (see Part 10) |
| Caching | ioredis dependency present, but no cache-layer code found in referral/affiliate/wallet/order paths |
| Storage | Cloudinary (`cloudinary` dep) for media |
| Notifications | Firebase Cloud Messaging only (push); `users.fcm_token`; no email/SMS/WhatsApp sender found | `config/firebase.js`, `controller/fcmTokenController.js`, `services/notificationService.js` |
| Payments | Razorpay | `razorpay` dep, `createRazorpayOrder`/`verifyRazorpayPayment` in `orderController.js` |
| Wallet | Custom-built (`wallets`, `wallet_transactions`, `wallet_audit_logs`) | see Part 7 |
| Deployment | PM2 (`ecosystem.config.cjs`), cluster mode flag | `package.json` scripts (`pm2:*`, `start:cluster`) |

---

## PART 2 — Module Inventory (referral/affiliate-relevant)

| Module | Path(s) | Notes |
|---|---|---|
| **Referral** | `controller/referralController.js`, `controller/adminReferralController.js`, `services/referralService.js`, `routes/referralRoutes.js`, `routes/adminReferralRoutes.js`, `routes/internalReferralRoutes.js` | Full CRUD + lifecycle logic, no dedicated DAO — service talks to Prisma directly |
| **Affiliate** | `controller/affiliateTrackingController.js`, `affiliateDashboardController.js`, `affiliateAdminController.js`, `affiliateApplicationController.js`, `services/affiliateService.js`, `dao/affiliate.dao.js`, `routes/affiliateRoutes.js`, `routes/affiliateAdminRoutes.js` | Has a dedicated DAO layer (`affiliateDAO`), unlike referral |
| **Wallet** | `controller/walletController.js` (1099 lines), `controller/adminWalletController.js`, `services/walletService.js`, `dao/wallet.dao.js`, `dao/wallet-transaction.dao.js`, `routes/walletRoutes.js`, `routes/adminWalletRoutes.js`, `routes/walletOrderRoutes.js` | Generic top-up/spend/refund wallet, **separate system** from referral balance |
| **Coupons** | `controller/couponController.js`, `controller/userCouponController.js`, `services/couponValidator.js`, `dao/coupon.dao.js`, `dao/coupon-usage.dao.js`, `routes/couponRoutes.js` | Mature, has reservation/apply/refund states |
| **Orders** | `controller/orderController.js` (1300+ lines), `services/checkoutService.js`, `services/orderExecutor.js`, `orderDao` | Core order lifecycle |
| **Returns** | `controller/returnOrderController.js`, `prisma/models/return_orders.prisma` | Handles return requests, no reward reversal hook |
| **Delivery/Fulfillment** | `controller/riderOrderController.js`, `services/fulfillmentRouter.js`, `services/fulfillmentService.js` | Sub-order based fulfillment, sets order/sub-order `status` |
| **Users/Auth** | `middleware/authenticate.js`, `middleware/authorize.js`, `prisma/models/user.prisma` | JWT + static RBAC |
| **Membership/Subscription** | — | **NOT FOUND** (see Part 15) |
| **Campaigns** | `referral_campaigns` model + admin routes only | Extremely thin — see Part 4 |
| **Notifications** | `services/notificationService.js`, `config/firebase.js` | Push only; `referral_notifications` is a parallel, referral-specific in-app notification table |
| **Analytics** | No dedicated analytics module; stats are denormalized counters on profile tables | See Part 13 |

---

## PART 3 — Database Analysis (existing models, exact fields)

All models below are **EXISTING IMPLEMENTATION**, read verbatim from `prisma/models/*.prisma`.

### Referral domain (already exists, fully fleshed out)

- **`user_referral_profiles`** — PK `id` (uuid), unique `user_id`, unique `referral_code`. Fields: `referral_code_active`, `is_blocked`, `total_referrals`, `successful_referrals`, `pending_referrals`, `failed_referrals`, `total_earnings`, `available_balance`, `pending_balance`, `withdrawn_amount`, `expired_amount`, `used_for_purchase`, `was_referred`, `referred_by_user_id`, `referred_by_code`, `referred_at`, `referral_bonus_received`, `current_tier`, `status` (default `"ACTIVE"`). Relations: `referral_transactions` (as referrer), `referral_rewards`, `referral_withdrawals`.
- **`referral_transactions`** — the attribution + status-machine table. FK `referrer_profile_id → user_referral_profiles`. Fields include `referee_id`, `referral_code_used`, `status` (string enum-like: `PENDING → SIGNUP_COMPLETED → ORDER_PLACED → RETURN_WINDOW_ACTIVE → COMPLETED`, or `FAILED`), `status_history` (JSON audit trail), `order_id`, `order_amount`, `delivered_at`, `return_window_starts_at/ends_at`, `is_returned`, `return_type` (`FULL`/`PARTIAL`), `referrer_reward_id`, `referee_reward_id`, `ip_address`, `user_agent` (fraud signal fields).
- **`referral_rewards`** — ledger per credited reward. `amount`, `original_amount`, `remaining_amount`, `used_amount`, `reward_type` (`REFERRER_REWARD`/`REFEREE_BONUS`), `status` (`ACTIVE`/`PARTIALLY_USED`/`FULLY_USED`/`EXPIRED`), `expires_at`, `expiry_reminder_sent`, `urgent_reminder_sent`.
- **`referral_reward_usages`** — usage ledger, FK `reward_id → referral_rewards`. `usage_type` (`PURCHASE`/`EXPIRY`), `order_id`, `reward_balance_after`.
- **`referral_withdrawals`** — `requested_amount`, `processed_amount`, `payment_method`, `status`, `status_history`, bank/UPI fields, `rejection_reason`.
- **`referral_configs`** — single-row admin-configurable settings: `referrer_reward_amount`, `referee_reward_amount`, `min_order_value`, `reward_validity_days`, `min_withdrawal_amount`, `max_withdrawals_per_month`, `return_window_days`, `max_earning_per_user`, `tiered_rewards_enabled`/`tiered_rewards_config` (JSON), `enable_ip_tracking`, `max_referrals_per_ip`, `cooldown_hours`, `applicable_first_order`, `enable_device_tracking`.
- **`referral_fraud_logs`** — `fraud_type`, `severity`, `resolved`, `resolution_note`.
- **`referral_admin_logs`** — generic admin audit log (`action`, `entity_type`, `previous_value`/`new_value` JSON).
- **`referral_notifications`** — `type`, `channels` (JSON, default `["in_app"]`), `is_read`.
- **`referral_campaigns`** — **very thin**: `id`, `name`, `description`, `is_active`, `created_by`. No reward rule fields, no link to product/category/brand/store, no dates/limits — see gap analysis.

### Affiliate domain (already exists, fully fleshed out)

- **`affiliate_applications`** — onboarding form: social handles, `primary_platform`, `estimated_audience`, `niche_categories[]`, payment details, `status` (`PENDING`/approved/rejected), `agreed_to_terms`.
- **`affiliate_profiles`** — PK, unique `user_id`, unique `affiliate_code`, `tier_name` (`Bronze/Silver/Gold/Platinum`), `tier_bonus`, `total_clicks/orders/sales`, `total_commission_earned/paid`, `available_balance`, `pending_balance`, `processing_balance`, `status`, `is_blocked`.
- **`affiliate_links`** — `link_code` (unique), `destination_type`, `product_id`/`category_id`/`search_query`/`campaign_name`/`sub_id`. **No `brand_id` or `store_id` field** — brand/store links not modeled.
- **`affiliate_clicks`** — `visitor_id`, `user_id`, `ip_address`, `device_type`, `is_converted`, `converted_at`, `order_id`, `is_suspicious`.
- **`affiliate_orders`** — attribution-to-order table: `click_id`, `order_id`, `commission_status` (`PENDING`/`APPROVED`), `is_returned`, `return_amount`, `return_window_ends_at`, `is_fraud_suspected`.
- **`affiliate_commissions`** — final commission ledger per order: `base_commission_rate`, `tier_bonus`, `effective_rate`, `gross_commission`, `net_commission`, `tds_applicable/rate/amount`, `final_amount`, `status`, `payout_id`.
- **`affiliate_category_commissions`** — per-category commission override (`category_id` unique, `base_commission_rate`). **No product-level or brand-level or campaign-level commission table exists.**
- **`affiliate_configs`** — single-row config: `cookie_duration_hours`, `cookie_name` (`_aff_ref`), `default_commission_rate`, `enable_tier_bonuses`, `minimum_payout_amount`, `payout_frequency`, `commission_hold_days`, `enable_tds`, `tds_threshold`, `block_self_referral`.
- **`affiliate_payouts`** — payout batch record with bank/UPI, `status`, `period_start/end_date`.

### Wallet domain

- **`wallets`** — `balance`, `is_frozen`, `frozen_reason`, `frozen_by`, `version` (optimistic-lock field).
- **`wallet_transactions`** — `transaction_type` (string: `TOPUP`, `SPEND`, `REFUND`, `ADMIN_CREDIT`, `ADMIN_DEBIT` — from `services/walletService.js` usage), `balance_before/after`, `reference_type`, `reference_id`, `idempotency_key` (unique — good practice already present), `metadata` JSON.
- **`wallet_audit_logs`** — admin action trail on wallets.

### Coupon domain

- **`coupons`** — `discount_type`, `discount_value`, `max_discount`, `min_order_value`, `allowed_brands` (JSON array), `new_user_only`, `usage_limit_total`, `usage_limit_per_user`, `valid_from/to` with `timezone`, `status`.
- **`coupon_usage`** — `discount_applied`, `order_value`, `final_amount`, `idempotency_key` (unique), `status` (`APPLIED`/`RESERVED`/`REFUNDED`/`CANCELLED`).

### Orders / Returns

- **`orders`** — `status` is a free-text `String` (**no Prisma enum**; observed values across code: `"Pending"`, `"pending"`, `"cancelled"`, `"Delivered"` — inconsistent casing, confirmed by grep), `coupon_code`, `coupon_discount`, `razorpay_*` fields, `rider_id`, `is_deleted`. Indexed on `status`, `user_id`, `created_at`.
- **`return_orders`** — `return_type`, `refund_amount`, `refund_mode`, `status` (default `"pending"`), bank fields for refund.

### Membership / Subscription

**MEMBERSHIP SYSTEM: NOT FOUND.** No `membership`, `subscription`, `plan`, or `tier_plan` model exists anywhere in `prisma/models/`. Confirmed via full-repo grep for `membership|subscription` across all `.js` files — zero matches outside this analysis. `affiliate_profiles.tier_name`/`tier_bonus` and `user_referral_profiles.current_tier` are the only "tier"-like concepts, and they are **sales/referral-volume tiers, not time-boxed memberships** with a free/paid distinction.

---

## PART 4 — Existing Referral System (classification)

Full read of `services/referralService.js` (843 lines), `controller/referralController.js` (581 lines), `controller/adminReferralController.js` (857 lines).

| Capability | Status | Evidence |
|---|---|---|
| Referral code generation | **IMPLEMENTED** | `generateReferralCode()` — phone/name-derived + 4 random digits, collision-checked |
| Referral link (shareable URL) | **NOT FOUND** as a stored/trackable link entity — only a `referral_code` string exists; no `referral_links` table, no click tracking, no cookie, unlike the affiliate side | `getShareContent` endpoint presumably builds a URL client-side, but no server-side click/attribution record for referral links (contrast with `affiliate_clicks`) |
| Self-referral prevention | **IMPLEMENTED** | `applyReferralCode()` checks `validation.referrerId === refereeId`, logs `SELF_REFERRAL` fraud |
| One-time code usage per user | **IMPLEMENTED** | checks `existingProfile?.was_referred` |
| IP-based fraud throttling | **IMPLEMENTED** | `config.enable_ip_tracking`, `max_referrals_per_ip`, `cooldown_hours` |
| Device-based fraud detection | **PARTIALLY IMPLEMENTED** — config flag `enable_device_tracking` exists in `referral_configs`, but no device-fingerprint field is written or checked anywhere in `referralService.js` |
| Referral attribution (permanent) | **IMPLEMENTED** | `user_referral_profiles.referred_by_user_id`/`referred_by_code`/`referred_at` set once, never overwritten |
| Referral status tracking (click→signup→purchase) | **PARTIALLY IMPLEMENTED** — signup→order→delivery→return-window→completed is modeled via `referral_transactions.status`, but there is **no "click" stage** at all (no link, no click event) |
| Reward pending → available lifecycle | **IMPLEMENTED** | `onOrderPlaced` → `onOrderDelivered` → `processReturnWindowExpiry` (after `return_window_days`) credits `referral_rewards` |
| Reward reversal on cancel/return | **PARTIALLY IMPLEMENTED** — `onOrderReturned()` exists and handles `FULL` (marks transaction `FAILED`, decrements pending, increments failed) and `PARTIAL` (reduces `order_amount`), but **only acts on transactions still in `ORDER_PLACED`/`RETURN_WINDOW_ACTIVE`** — if the reward was already credited (`COMPLETED`) before a late return, there is no reward-clawback logic (no debit of `referral_rewards`/wallet on a post-credit reversal) |
| Reward expiry (time-boxed rewards) | **IMPLEMENTED** | `processExpiredRewards()`, `sendExpiryReminders()` (48h/24h) |
| Withdrawal (bank/UPI) | **IMPLEMENTED** | `requestWithdrawal()` + admin approve/reject/process endpoints in `adminReferralController.js` |
| Spend reward at checkout | **IMPLEMENTED** | `spendReferralBalance()` — FIFO by soonest-expiring reward |
| Tiered rewards | **PARTIALLY IMPLEMENTED** | `calculateRewardAmounts()` reads `config.tiered_rewards_config.tiers` (JSON), but tiers are keyed only on `successful_referrals` count — no revenue-based or campaign-based tiering |
| Admin dashboard/config/campaigns/fraud UI backend | **IMPLEMENTED** | `adminReferralController.js` — dashboard, analytics, config CRUD, user block/unblock, transactions, rewards manual credit/extend/cancel, withdrawals approve/reject/process, fraud-log review, campaigns CRUD |
| **Wiring into real order lifecycle** | **NOT IMPLEMENTED (critical gap)** — see Part 6/23 |

---

## PART 5 — Existing Affiliate System (classification)

Full read of `services/affiliateService.js` (239 lines), `controller/affiliateTrackingController.js`, `affiliateAdminController.js`, `affiliateApplicationController.js`, `dao/affiliate.dao.js`.

| Capability | Status | Evidence |
|---|---|---|
| Affiliate application/onboarding | **IMPLEMENTED** | `affiliate_applications` model + `affiliateApplicationController.js`, admin approve/reject in `affiliateAdminRoutes.js` |
| Affiliate code | **IMPLEMENTED** | `generateAffiliateCode()` |
| Affiliate links: product/category/search | **PARTIALLY IMPLEMENTED** | `affiliate_links.product_id`, `category_id`, `search_query`, `campaign_name`, `sub_id` all exist. **Brand links and store links are NOT modeled** (no `brand_id`/`store_id` column) |
| Click tracking with cookie | **IMPLEMENTED** | `trackClick()` sets `_aff_ref` + `_aff_click_id` cookies, `cookie_duration_hours` configurable |
| Last-click attribution | **IMPLEMENTED (by design, cookie-based)** | Cookie overwritten on each click (standard "last click wins" cookie semantics); `affiliate_clicks.is_converted`/`converted_at`/`order_id` track conversion |
| Commission calculation | **IMPLEMENTED** | `calculateCommission()` — per order-item, category-rate override, + affiliate tier bonus |
| Category-based commission | **IMPLEMENTED** | `affiliate_category_commissions` |
| Product-based commission | **NOT FOUND** — no `affiliate_product_commissions` table; only category-level overrides exist |
| Campaign-based commission | **NOT FOUND** — `affiliate_links.campaign_name` is a free-text label only, with no linked rule/rate |
| Sales-volume tier bonus | **IMPLEMENTED** | `calculateTier()` — Bronze/Silver/Gold/Platinum by `monthlySales`, **but this function is never called from `processAffiliateOrder` or anywhere else** (verified by grep — zero callers outside its own definition) — dead code |
| TDS handling | **IMPLEMENTED** | `approveCommission()` — PAN-based TDS rate selection |
| Order attribution → commission | **IMPLEMENTED (logic)**, **PARTIALLY wired** | `processAffiliateOrder()` fully implemented, but only reachable via `POST /api/affiliate/convert`, which per its own code comment is "called internally, no user auth needed" — **no caller was found anywhere in the codebase** (checked `orderController.js`, `checkoutService.js`) — it depends on the **frontend** calling it after checkout |
| Return/cancellation reversal of commission | **NOT FOUND** — `affiliate_orders.is_returned`/`return_amount` fields exist but no code writes to them; `returnOrderController.js` does not call any affiliate function |
| Payout | **IMPLEMENTED** | `affiliate_payouts`, admin `updatePayout`, `requestPayout` |
| Affiliate dashboard | **IMPLEMENTED** | `affiliateDashboardController.js` (356 lines) |
| Store links | **NOT FOUND** |

---

## PART 6 — Order Lifecycle (traced from actual code)

**Order creation:** `controller/orderController.js:placeOrder` (line 326) and `placeOrderWithDetailedAddress` (line 628); underlying insert via `orderDao`/`checkoutService.js` (initial `status: "Pending"`, `services/checkoutService.js:62`).

**Payment:** `createRazorpayOrder` (1280), `verifyRazorpayPayment` (1311), `verifyRazorpaySignature` (1326) — Razorpay webhook/verify flow.

**Status update (generic):** `updateOrderStatus` (`orderController.js:112`) — **only sets `status` field, no side effects, no hooks called** (verified: reads order, calls `orderDao.update(id, {status})`, returns — notification code is commented out).

**Delivery:** `controller/riderOrderController.js` — `markSubOrderDelivered` (line 906) sets sub-order `fulfillment_status = 'delivered'` and, when all sub-orders delivered, sets parent order `status: 'Delivered'` (line 405). **No call to `referralService.onOrderDelivered` or any affiliate function** at this point — confirmed by grep.

**Cancellation:** `cancelOrder` (`orderController.js:1011`) — sets `status: "cancelled"`, then **auto-refunds to the generic wallet** (`walletDao.updateBalance(..., 'REFUND', 'order_cancellation', ...)`) for prepaid/Razorpay orders. **Does not call `referralService.onOrderReturned` or reverse any affiliate commission.**

**Return:** `controller/returnOrderController.js` — `createReturnRequest` (117), `updateReturnRequestStatus` (260). Sets `return_orders.status = "pending"` and, on request creation, sets the parent order to `status: "cancelled"` (line 219). **No referral/affiliate hook calls found anywhere in this file.**

**Order completion:** No explicit "completed" terminal status found in `orderController.js`; delivery via rider flow (`'Delivered'`) appears to be the practical terminal happy-path status.

### Actual status vocabulary observed (inconsistent, no enum)

`"Pending"` / `"pending"`, `"cancelled"`, `"Delivered"` (orders), plus separate `fulfillment_status` on sub-orders (`'pending'`, `'confirmed'`, `'delivered'`, `'cancelled'`, `'rerouted'`, `'rider_pending'`). Orders `status` column is `String?` in Prisma — **no enum constraint exists in the schema**, and casing is inconsistent across call sites (a pre-existing data-quality risk, not something to inherit into the new feature).

### Where reward processing should integrate (recommendation, not existing)

Three call sites are the natural integration points, since they are the only places order state legitimately transitions today:

1. `orderController.js:placeOrder` / `placeOrderWithDetailedAddress` — after successful order creation → fire referral "order placed" + affiliate conversion.
2. `riderOrderController.js:markSubOrderDelivered` (the branch that sets order `status: 'Delivered'`) → fire "order delivered" (starts return-window clocks).
3. `orderController.js:cancelOrder` and `returnOrderController.js:createReturnRequest`/`updateReturnRequestStatus` → fire reward/commission reversal.

Today, **none of these three call sites invoke `referralService` or `affiliateService`.** The service-layer functions (`onOrderPlaced`, `onOrderDelivered`, `onOrderReturned`, `processAffiliateOrder`) are fully written but only reachable through standalone HTTP endpoints (`/api/internal/referral/*`, `/api/affiliate/convert`) that nothing in this backend calls — they are dead endpoints unless an external caller (frontend, or an as-yet-unbuilt caller) hits them.

---

## PART 7 — Payment / Wallet / Money Flow

Three **separate** money-like ledgers exist today:

1. **Generic wallet** (`wallets`/`wallet_transactions`/`wallet_audit_logs`) — used for: Razorpay top-ups (`createWalletTopupOrder`/`verifyWalletTopup`), spend-at-checkout (`spendFromWallet`), refunds on order cancellation (`processRefundToWallet`, and inline in `cancelOrder`), admin credit/debit/freeze (`adminWalletController.js`). Transaction types seen: `TOPUP`, `SPEND`, `REFUND`, `ADMIN_CREDIT`, `ADMIN_DEBIT`. Has `idempotency_key` (unique) — good for safe retries. Uses raw `supabase.from()` calls in `walletService.js` (mixed with Prisma elsewhere) — **architecturally inconsistent data-access layer**.
2. **Referral balance** (`user_referral_profiles.available_balance/pending_balance` + `referral_rewards` + `referral_reward_usages`) — a fully independent ledger, **not backed by the `wallets` table at all**. Withdrawal (`referral_withdrawals`) is its own bank/UPI request flow, separate from the generic wallet's mechanisms.
3. **Affiliate balance** (`affiliate_profiles.available_balance/pending_balance/processing_balance` + `affiliate_commissions` + `affiliate_payouts`) — a **third**, independent ledger.

**Can the generic wallet be reused for referral rewards?** Technically yes, but doing so would require migrating `available_balance`/`pending_balance` semantics into `wallets.balance` and reconciling three withdrawal flows into one. **This is a business/architecture decision, not something the code decides for you** (see Part 22).

---

## PART 8 — Coupon / Discount System

`coupons` already supports: `discount_type`/`discount_value`, `max_discount`, `min_order_value`, `allowed_brands` (JSON list — brand restriction already modeled here, unlike affiliate links), `new_user_only`, `usage_limit_total`, `usage_limit_per_user`, `valid_from/to` with `timezone`. `coupon_usage` tracks `APPLIED`/`RESERVED`/`REFUNDED`/`CANCELLED` states with idempotency keys and a reserve→apply→refund state machine (`services/couponValidator.js`).

**Reusable for referral/affiliate campaigns:** the coupon engine's rule shape (min order value, brand allow-list, new-user-only, per-user limits, validity window) is structurally very close to what "Reward Rules" in the spec ask for. The `couponValidator.js` reservation pattern (`RESERVED` → `APPLIED` → `REFUNDED`) is also a good template for how referral/affiliate reward "holds" during checkout should behave, since referral currently has no reservation concept (`spendReferralBalance` debits immediately, no hold/rollback path if the order later fails).

---

## PART 9 — Attribution Analysis

| Signal | Referral | Affiliate |
|---|---|---|
| Referral/affiliate code | ✅ `referral_code` on profile | ✅ `affiliate_code` on profile |
| Link entity | ❌ NOT FOUND | ✅ `affiliate_links` |
| Click tracking | ❌ NOT FOUND | ✅ `affiliate_clicks` |
| Cookie-based session attribution | ❌ NOT FOUND | ✅ `_aff_ref`/`_aff_click_id` cookies |
| UTM parameters | ❌ NOT FOUND anywhere in the codebase |
| User-level permanent attribution | ✅ `user_referral_profiles.referred_by_user_id` (set once, immutable) |
| Order-level attribution | ✅ `referral_transactions.order_id` / ✅ `affiliate_orders.order_id` |
| Last-click attribution | ❌ NOT FOUND for referral (no click concept) / ✅ for affiliate (cookie overwrite = last click wins, by construction) |

**Conclusion:** The backend has the *referral* attribution model (A: permanent) and *affiliate* attribution model (B: last-click) exactly as split in the spec — but they are two disconnected systems with no shared click/attribution table and no rule for what happens when **both** a referral relationship and an affiliate click exist on the same order (unresolved — see Part 22).

---

## PART 10 — Event / Async Architecture

- **EventEmitter:** NOT FOUND anywhere in the repo.
- **Message queue:** RabbitMQ via `amqplib`, but only two queues exist (`geocode_order`, `fulfillment_routing`) — `workers/index.js`. Not used for referral/affiliate/wallet.
- **BullMQ / ioredis:** listed as dependencies (`bullmq`, `ioredis`) but **no BullMQ queue/worker code found** anywhere referencing referral, affiliate, wallet, or orders.
- **Cron (node-cron):** installed, but every cron registration found (`services/cronJobs.js`, `services/scheduled-jobs.js`, `services/autoCheckoutCron.js`, `services/scheduledOrderCron.js`) is **commented out** for the relevant jobs. Critically: `referralService.processReturnWindowExpirations`, `processExpiredRewards`, `sendExpiryReminders` are **not scheduled anywhere** — they are exposed only as admin-triggered HTTP endpoints (`adminReferralController.js`), meaning today these must be manually invoked or hit by an external scheduler outside this repo.
- **Webhooks:** Razorpay webhook exists for wallet top-up (`POST /api/wallet/webhook`).
- **Database triggers/events:** NOT FOUND.

**Best existing mechanism for the required triggers, given what exists today:**

- Order delivered/cancelled/returned → nothing currently; the cleanest minimal-diff option is direct function calls from `orderController.js`/`riderOrderController.js`/`returnOrderController.js` into `referralService`/`affiliateService` (mirroring how `cancelOrder` already calls `walletDao` inline) — not a new event bus, since none exists.
- Return-window expiry / reward expiry / reminders → genuinely time-based, needing an actual **cron scheduler wired up and running** (node-cron is present but disabled).

---

## PART 11 — Admin Architecture

Admin endpoints follow a flat pattern: Express router + `authenticateToken` + `requireAdmin`/`requireRole` middleware, controller functions doing Prisma queries directly (no admin-specific service layer, no generic CRUD abstraction, no audit-log middleware — each module logs manually, e.g. `referralService.logAdminAction` writing to `referral_admin_logs`).

- **Campaign Manager** → fits naturally alongside `adminReferralRoutes.js`'s existing `/campaigns` CRUD (already scaffolded, but the underlying `referral_campaigns` model needs real fields — see Part 18).
- **Reward Rules** → no existing "rules engine" model; closest analog is `referral_configs` (global, single-row) and `coupons` (per-coupon rules) — a per-campaign rules table would be new.
- **Fraud Management** → `referral_fraud_logs` + `adminReferralController.js`'s `/fraud-logs` endpoints already exist for referral; **affiliate has no equivalent fraud log table or admin endpoint** — `affiliate_orders.is_fraud_suspected` is a boolean flag with no backing detection logic found.
- **Membership Management** → nothing to extend; wholly new.
- **Analytics** → nothing to extend; wholly new (see Part 13).

---

## PART 12 — Notification Architecture

- **Push (Firebase):** `config/firebase.js`, `fcmTokenController.js`, `services/notificationService.js` — real, working push infrastructure tied to `users.fcm_token`.
- **Email:** NOT FOUND.
- **SMS:** NOT FOUND.
- **WhatsApp:** NOT FOUND.
- **In-app notifications:** Two parallel tables — generic `user_notifications` and referral-specific `referral_notifications` (with a `channels` JSON field defaulting to `["in_app"]`, suggesting the schema anticipated multi-channel but only in-app is implemented).
- **Templates:** NOT FOUND — all notification titles/messages are hardcoded strings inline in `referralService.js`, not configurable by admin.

**Reusable:** the FCM push pipeline and the `user_notifications`/`referral_notifications` table pattern are reusable; email/SMS/WhatsApp channels for the new program would need to be built from scratch.

---

## PART 13 — Analytics

No dedicated analytics/reporting module or event-log table exists. What's currently stored, usable as raw material for analytics:

- Clicks: `affiliate_clicks` (affiliate only — no referral click data)
- Signups/conversion: `referral_transactions.status` history, `affiliate_orders.is_converted`
- Orders/revenue: `affiliate_orders.gross/net/final_order_value`, `referral_transactions.order_amount`
- Rewards/commission cost: `referral_rewards`, `affiliate_commissions`
- Aggregates: pre-computed rollups on `affiliate_profiles`/`affiliate_links` (`total_clicks`, `total_orders`, `total_sales`, `total_commission_earned`) and `user_referral_profiles` (`total_referrals`, `total_earnings`, etc.) — denormalized counters updated inline during writes, not a queryable time-series/analytics table.

To answer the spec's marketing questions ("which campaign gets most clicks", "strongest referrers", "campaign revenue over time") would require **new** aggregation — either scheduled rollup jobs or an analytics/event-log table, since none of the existing counters are time-bucketed or campaign-attributed (referral has no campaign linkage at all today; `referral_transactions` has no `campaign_id` field).

---

## PART 14 — Security & Fraud

Existing, reusable:

- IP tracking + per-IP referral rate limiting: `referral_configs.enable_ip_tracking`/`max_referrals_per_ip`/`cooldown_hours`, enforced in `applyReferralCode`.
- Self-referral block: referral (`applyReferralCode`) and affiliate (`affiliate_configs.block_self_referral`, checked in `processAffiliateOrder`).
- Fraud log + resolution workflow: `referral_fraud_logs` + admin `/fraud-logs/:id/review`.
- Account block: `user_referral_profiles.is_blocked` / `affiliate_profiles.is_blocked` + `block_reason`.
- Admin audit trail: `referral_admin_logs`, `wallet_audit_logs`.

Missing:

- Device fingerprinting: config flag exists (`enable_device_tracking`) but **no implementation** — no device-id field captured or checked.
- Multi-account-same-device detection: NOT FOUND.
- General rate limiting middleware (express-rate-limit or similar): NOT FOUND in `middleware/`.
- Affiliate-side fraud log table: NOT FOUND (only the boolean `is_fraud_suspected` flag, unpopulated by any detection code found).

---

## PART 15 — Membership / Subscription

**MEMBERSHIP SYSTEM: NOT FOUND.**

No model, no controller, no route, no config table. Confirmed by exhaustive grep across every `.js` file in the repo for `membership` and `subscription` — zero hits outside this document. The closest existing concepts (`affiliate_profiles.tier_name`, `user_referral_profiles.current_tier`) are volume-based reward tiers, not time-boxed eligibility windows with a free/paid distinction, target-based renewal, or lapse/reactivation logic as described in the spec. This entire requirement area is a clean-slate build.

---

## PART 16 — API Inventory (existing, relevant)

| METHOD | ENDPOINT | CONTROLLER | PURPOSE | STATUS |
|---|---|---|---|---|
| GET | /api/referral/public-config | referralController.getPublicConfig | Public program config | IMPLEMENTED |
| GET | /api/referral/profile | referralController.getProfile | Get/create referral profile | IMPLEMENTED |
| POST | /api/referral/profile/generate-code | referralController.generateCode | Regenerate code | IMPLEMENTED |
| GET | /api/referral/stats | referralController.getStats | Referral counters | IMPLEMENTED |
| GET | /api/referral/history | referralController.getReferralHistory | List referral transactions | IMPLEMENTED |
| GET | /api/referral/rewards | referralController.getRewards | List rewards | IMPLEMENTED |
| GET | /api/referral/wallet | referralController.getWallet | Balance breakdown | IMPLEMENTED |
| POST | /api/referral/wallet/spend | referralController.spendBalance | Spend at checkout | IMPLEMENTED |
| POST | /api/referral/withdraw | referralController.requestWithdrawal | Request payout | IMPLEMENTED |
| POST | /api/referral/apply-code | referralController.applyCode | Apply code post-signup (frontend-driven) | IMPLEMENTED |
| GET | /api/referral/share-content | referralController.getShareContent | Shareable text/code | IMPLEMENTED |
| POST | /api/internal/referral/order-placed | referralController.onOrderPlaced | Order-placed hook | IMPLEMENTED but UNWIRED (no caller found) |
| POST | /api/internal/referral/order-delivered | referralController.onOrderDelivered | Delivery hook | IMPLEMENTED but UNWIRED |
| POST | /api/internal/referral/order-returned | referralController.onOrderReturned | Return/cancel hook | IMPLEMENTED but UNWIRED |
| GET/PUT | /api/admin/referral/* (12+ endpoints) | adminReferralController | Dashboard, config, users, transactions, rewards, withdrawals, fraud-logs, campaigns | IMPLEMENTED |
| GET | /api/affiliate/track/:linkCode | affiliateTrackingController.trackClick | Click + cookie + redirect | IMPLEMENTED |
| POST | /api/affiliate/convert | affiliateTrackingController.convertOrder | Order attribution → commission | IMPLEMENTED but UNWIRED (no internal caller found) |
| POST | /api/affiliate/apply | affiliateApplicationController | Apply to become affiliate | IMPLEMENTED |
| GET/POST | /api/affiliate/links* | — | Generate/list/deactivate links | IMPLEMENTED |
| GET | /api/affiliate/dashboard | affiliateDashboardController | Affiliate's own stats | IMPLEMENTED |
| GET/PUT | /api/affiliate-admin/* (18+ endpoints) | affiliateAdminController | Config, commission rates, applications, affiliates, orders, commissions, payouts | IMPLEMENTED |
| GET/POST | /api/wallet/* | walletController | Top-up, spend, transactions, refund, webhook | IMPLEMENTED |
| GET/POST | /api/admin/wallets/* | adminWalletController | Credit/debit/freeze/audit | IMPLEMENTED |
| POST/GET | /api/coupons/* | couponController | Validate/apply/remove, admin CRUD | IMPLEMENTED |
| Membership endpoints | — | — | NOT FOUND |
| Analytics endpoints (marketing-facing) | — | — | NOT FOUND |

---

## PART 17 — Requirement Gap Analysis

| Requirement | Existing Implementation | Status | Reusable? | Missing Work |
|---|---|---|---|---|
| Personal referral link | Only a code, no link/click record | PARTIAL | Partially | Build referral link + click table (mirror `affiliate_links`/`affiliate_clicks`) |
| Referral codes | `user_referral_profiles.referral_code` | IMPLEMENTED | Yes | — |
| Invite friends/contacts | Not found | NOT FOUND | No | Build contact-invite flow |
| Referral attribution (permanent) | `referred_by_user_id` | IMPLEMENTED | Yes | — |
| Referral tracking click→signup→purchase | Signup→order→delivery tracked; no click stage | PARTIAL | Partially | Add click stage |
| Referral dashboard | `referralController` endpoints | IMPLEMENTED | Yes | Frontend + minor gap-filling |
| Product/category/brand/store affiliate links | Product+category only | PARTIAL | Partially | Add brand_id/store_id to `affiliate_links` |
| Percentage commission | `affiliate_configs.default_commission_rate`, category override | IMPLEMENTED | Yes | Add product/campaign-level overrides |
| Campaign-based commission | Not found (campaign_name is a label only) | NOT FOUND | No | New rules table |
| Sales-volume tier reward | `calculateTier()` exists but uncalled | PARTIAL (dead code) | Yes, needs wiring | Wire into `processAffiliateOrder` |
| Last-click campaign attribution | Cookie-based, affiliate only | IMPLEMENTED (affiliate) | Yes | Extend concept to referral-linked campaigns if needed |
| Permanent + last-click coexistence rule | Not resolved anywhere in code | NOT FOUND | — | Business decision needed (Part 22) |
| Reward lifecycle (pending→delivered→return-window→available) | Fully modeled in `referral_transactions`/`referral_rewards` | IMPLEMENTED | Yes | Wire into real order events |
| Reward reversal on cancel/return | Partial (pre-credit only) | PARTIAL | Yes | Add post-credit clawback |
| Cashback/wallet/points/coupons/gifts reward types | Only cashback-style balance (referral) exists; no points/coupon-conversion | PARTIAL | Partially | Build points & coupon-conversion types |
| Customer dashboard (referrals/earnings/campaigns/analytics) | Referrals+earnings endpoints exist; campaigns/analytics do not | PARTIAL | Yes for referrals/earnings | Campaigns + analytics views |
| Membership (free/paid, target-based eligibility) | Not found | NOT FOUND | No | Entirely new module |
| Admin campaign manager | Scaffolded routes, thin model | PARTIAL | Yes (routes), No (model) | Enrich `referral_campaigns` schema |
| Admin reward rules (min order, max reward, eligible products, etc.) | `referral_configs` is global-only; `coupons` has per-rule fields | PARTIAL | Yes (coupon pattern) | New per-campaign rules table |
| QR sharing | Not found | NOT FOUND | No | New (the `qrcode` npm package is already installed!) |
| Contact invitations | Not found | NOT FOUND | No | New |
| Bank/UPI withdrawal | Implemented (referral + affiliate, separately) | IMPLEMENTED | Yes | Unify if desired |
| Coupon conversion of rewards | Not found | NOT FOUND | No | New |
| Points system | Not found | NOT FOUND | No | New |
| Communication templates | Not found (hardcoded strings) | NOT FOUND | No | New |
| Marketing analytics (clicks/signups/revenue/rewards by campaign) | Raw data exists, no aggregation | PARTIAL | Yes (data), No (rollups) | New analytics layer |
| Fraud protection (self-referral, IP, device) | IP done; device/multi-account not | PARTIAL | Yes | Device fingerprinting |
| Gamification (levels/badges/streaks) | Not found | NOT FOUND | No (but nothing blocks adding it) | Future |

---

## PART 18 — Database Change Requirements (analysis only, no migration code)

**A. Existing models that can be extended:**

- `referral_campaigns` — needs reward-rule fields (min order value, max reward, eligible products/categories, expiry, usage limits) to become a real campaign entity instead of a name/description shell.
- `affiliate_links` — needs `brand_id`, `store_id` columns to support the spec's brand/store link types.
- `orders` — a `status` enum would remove the existing casing inconsistency risk before new lifecycle hooks depend on exact string matches.

**B. New models likely required:** referral link/click tracking table (mirroring `affiliate_links`/`affiliate_clicks` but for referral); a unified or campaign-scoped reward-rules table (mirroring `coupons`' rule shape); membership/plan model; membership-eligibility-tracking model (target progress, e.g. "referrals in last 120 days"); product-level and campaign-level affiliate commission tables; a communication-templates table; an analytics rollup/event table; points ledger (if points reward type is adopted); coupon-conversion record (if reward→coupon conversion is adopted).

**C. New enums/statuses:** a real `OrderStatus` enum (currently free-text); explicit enum for `referral_transactions.status`/`referral_rewards.status` (currently free-text strings, functionally an enum but not DB-enforced); a membership status enum (e.g. `ACTIVE_EARNING`/`INACTIVE`/`LAPSED`).

**D. New relationships:** `referral_transactions` → `referral_campaigns` (currently no FK — referral has no campaign concept at all); `affiliate_links`/`affiliate_orders` → a new campaign-rules table; membership model → `users`.

**E. New indexes:** campaign lookups by `is_active`/date range; any new click/attribution table needs the same `@@index` pattern already used on `affiliate_clicks` (by `affiliate_id`, `is_converted`).

**F. New unique constraints:** membership eligibility should likely be unique per user (mirroring the `user_referral_profiles.user_id @unique` pattern already used throughout this schema).

---

## PART 19 — Service / Module Change Requirements (analysis only)

**Existing services to modify:**

- `services/referralService.js` — add campaign-awareness to `onOrderPlaced`/`processReturnWindowExpiry`; add post-credit reward clawback to `onOrderReturned`.
- `services/affiliateService.js` — wire the already-written but unused `calculateTier()` into `processAffiliateOrder`; add product/campaign-level commission lookup alongside the existing category lookup.
- `dao/affiliate.dao.js` — extend for brand/store link types.

**Existing controllers to extend:**

- `controller/orderController.js` (`placeOrder`, `cancelOrder`) — add calls into referral/affiliate services at the points identified in Part 6.
- `controller/riderOrderController.js` (`markSubOrderDelivered`) — add delivery hook call.
- `controller/returnOrderController.js` — add reversal hook calls.

**New services likely required:** membership service (eligibility tracking, target evaluation, lapse/reactivation); campaign-rules evaluation service (shared by referral+affiliate, mirroring `couponValidator.js`'s rule-checking pattern); analytics rollup service; communication-template service.

**New controllers likely required:** membership controller (customer + admin), analytics controller (marketing-facing), campaign-rules admin controller (if kept separate from the existing `referral_campaigns`/`affiliateAdminController` CRUD).

**Existing event handlers to extend:** none exist to extend (Part 10) — the "event handlers" here are really just the three controller call-sites in Part 6, which need direct function calls added since there's no event bus.

**New event handlers/cron required:** a working, *enabled* cron scheduler for `processReturnWindowExpirations`/`processExpiredRewards`/`sendExpiryReminders` (currently unscheduled) and, if adopted, a membership-target-evaluation cron.

---

## PART 20 — Recommended Integration Architecture

Given the existing architecture is direct-call (no event bus, no queue for this domain), the lowest-risk integration extends the existing modules in place rather than introducing new infrastructure:

```
placeOrder / placeOrderWithDetailedAddress (orderController.js)
        │
        ├──► referralService.onOrderPlaced()        [EXISTS — just needs to be called]
        └──► affiliateService.processAffiliateOrder() [EXISTS — just needs to be called,
                                                         using the _aff_ref/_aff_click_id cookie]

markSubOrderDelivered (riderOrderController.js, "all delivered" branch)
        └──► referralService.onOrderDelivered()      [EXISTS — needs call]

cancelOrder (orderController.js) / updateReturnRequestStatus (returnOrderController.js)
        ├──► referralService.onOrderReturned()        [EXISTS — needs call + post-credit clawback]
        └──► affiliateService.reverseCommission()     [NEW — mirrors approveCommission()]

node-cron (currently disabled)
        ├──► referralService.processReturnWindowExpirations()  [EXISTS — needs scheduling]
        ├──► referralService.processExpiredRewards()            [EXISTS — needs scheduling]
        ├──► referralService.sendExpiryReminders()               [EXISTS — needs scheduling]
        └──► membershipService.evaluateTargets()      [NEW]

New: membershipService  ──uses──► referral_transactions (qualifying-purchase events)
New: campaignRulesService ──used by──► referralService + affiliateService
                            (mirrors couponValidator.js's rule-check pattern)
New: analyticsService  ──reads──► referral_transactions, affiliate_orders, affiliate_clicks,
                                    referral_rewards, affiliate_commissions
                         ──writes──► new rollup table(s)

wallets/wallet_transactions  ◄── DECISION POINT: reuse for referral+affiliate payouts,
                                   or keep 3 separate ledgers (current state)
```

No new message queue or event system is proposed — the existing RabbitMQ setup is scoped to geocode/fulfillment and doesn't need to absorb this domain; a plain enabled cron plus direct in-process calls matches how the rest of this codebase already does cross-module work (e.g., `cancelOrder` calling `walletDao` inline).

---

## PART 21 — End-to-End Flow (recommended, based on existing pieces)

- **A. Referral signup** — user enters code at signup → frontend calls `POST /api/referral/apply-code` (exists) → `applyReferralCode()` (exists) creates `referral_transactions` in `SIGNUP_COMPLETED`.
- **B. Referral link click** — **new**: needs a referral-link/click table; today only affiliate has this.
- **C. Referred purchase** — `placeOrder` → **add call to** `referralService.onOrderPlaced()` (exists, unwired) and `affiliateService.processAffiliateOrder()` (exists, unwired, reads `_aff_ref` cookie).
- **D. Reward pending** — automatic once C fires; `referral_transactions.status = ORDER_PLACED`.
- **E. Order delivered** — **add call to** `referralService.onOrderDelivered()` in `markSubOrderDelivered`; sets `return_window_ends_at`.
- **F. Return period completed** — cron (needs enabling) calls `processReturnWindowExpirations()` (exists).
- **G. Reward approved/credited** — happens inside F automatically (`processReturnWindowExpiry`, exists).
- **H. Order cancelled** — `cancelOrder` → **add call to** `referralService.onOrderReturned('FULL', ...)` and a new affiliate-commission cancellation function.
- **I. Order returned** — `returnOrderController` → same as H, plus handle `PARTIAL` (exists) for partial returns.
- **J. Reward reversal** — exists for pre-credit states (H/I above); **new** clawback logic needed if the reward was already credited before the return request landed (a real race the current code doesn't cover).
- **K. Reward withdrawal** — `requestWithdrawal()` (exists) → admin `approve/process` (exists).
- **L. Membership qualification** — **entirely new**; would hook off the same "qualifying purchase" event as C, per the spec's explicit recommendation that a referral counts toward membership target on purchase, not signup.
- **M. Campaign attribution** — **new** for referral (no campaign FK today); already partially present for affiliate via `affiliate_links.campaign_name` (label only, no rule engine behind it).
- **N. Affiliate commission** — `processAffiliateOrder()` (exists, unwired) → admin `approveCommission()` (exists) → payout (exists).

---

## PART 22 — Critical Questions / Ambiguities (business decisions, not made here)

- What counts as a **qualifying order** for referral reward, membership progress, and affiliate commission — same definition for all three, or different per program?
- Is commission/reward computed on product price, discounted price, or final paid amount (post-coupon, post-wallet-spend)? (`affiliateService.processAffiliateOrder` currently uses `order.total - shipping`, ignoring coupon discount in the commission base despite recording `discount_amount` — worth resolving.)
- How is the **return period** determined — fixed days (as currently hardcoded via `return_window_days`/`config.commission_hold_days`), or category/product-specific?
- **Who bears the cost** of referral rewards and affiliate commissions — margin, marketing budget, a P&L line? (Not a code question, but affects whether `max_earning_per_user`/payout caps need to be enforced more strictly.)
- Can **one order carry both a referral reward and an affiliate commission** simultaneously? Nothing in the code today prevents or coordinates this — `onOrderPlaced` and `processAffiliateOrder` are entirely independent and would both fire on the same order.
- **Permanent referral vs. last-click affiliate — which wins** when both exist on the same order? Unresolved in code.
- Can users self-refer via a different account (multi-account fraud)? Self-referral is blocked only for the *same* user ID — no cross-account signal exists.
- Can rewards **stack** (referral + affiliate + coupon on one order)?
- Can **multiple campaigns** apply to one order (referral has no campaign concept yet to even ask this of; affiliate has one `campaign_name` label, singular)?
- **Partial returns**: referral has explicit partial-return handling (`onOrderReturned`, `PARTIAL` branch); affiliate's `affiliate_orders.return_amount` field exists but is never written to by any code — what should happen to a partially-returned affiliate commission?
- Membership: what exactly counts toward the "target" (e.g., 10 referrals in 120 days) — signup, or the spec's own recommendation of qualifying purchase? The spec states qualifying-purchase, but nothing in the current schema tracks a per-user rolling window today.

---

## PART 23 — Risk Analysis

| Risk | Rank | Basis |
|---|---|---|
| Double reward/commission generation if hooks are added to multiple call sites (e.g. both `placeOrder` variants) without idempotency | HIGH | `onOrderPlaced`/`processAffiliateOrder` have no idempotency guard beyond `processAffiliateOrder`'s own "already processed" check (`getAffiliateOrderByOrderId`); `onOrderPlaced` has none — calling it twice for the same order would create duplicate notifications and could double-count `pending_referrals` |
| Reward clawback gap on late cancellation/return (post-credit) | HIGH | Confirmed in Part 4/6 — `onOrderReturned` only handles pre-`COMPLETED` states |
| Order status inconsistency (`"Pending"` vs `"pending"`, `"Delivered"` vs `"delivered"`) breaking exact-string hook conditions | HIGH | Confirmed via grep across `orderController.js`/`checkoutService.js`/`riderOrderController.js` |
| Three disconnected money ledgers (wallet, referral balance, affiliate balance) causing reconciliation/audit difficulty | MEDIUM | Confirmed in Part 7 |
| Race condition: reward credited in `processReturnWindowExpiry` at the same moment a return request is created | MEDIUM | Both paths read/write `referral_transactions` without any locking beyond Prisma's implicit row semantics; no optimistic lock field on `referral_transactions` (contrast with `wallets.version`, which *does* have one) |
| Unscheduled cron jobs silently never running in production (rewards never expire, return windows never close) if no external scheduler is wired to the admin-only endpoints | HIGH | Confirmed in Part 10 — no cron currently enabled |
| Fraud: no device-fingerprint enforcement despite a config flag suggesting it should exist | MEDIUM | Confirmed in Part 4/14 |
| Affiliate commission base excludes coupon/wallet discounts from calculation, potentially over/under-crediting relative to actual company revenue | MEDIUM | `processAffiliateOrder` uses `order.total - shipping`, not net-of-discount revenue |
| `calculateTier()` dead code silently not applying volume bonuses if someone assumes it's active | LOW | Confirmed no callers |
| Data migration risk if `referral_campaigns`/`affiliate_links` schemas are extended with required fields on existing rows | LOW | Both tables are currently near-empty in practice (thin schema, likely low row count) but should be checked before adding NOT NULL columns |
| Mixed Prisma/Supabase-client data access (`walletService.js`) causing transaction-boundary gaps (Prisma `$transaction` vs separate Supabase calls) | MEDIUM | Confirmed in Part 1/7 |

---

## PART 24 — Final Executive Summary

1. **What already exists:** A remarkably complete referral system (codes, permanent attribution, order-linked reward lifecycle including return-window and expiry, FIFO spend, withdrawal, extensive admin console, fraud logging) and a remarkably complete affiliate system (application/approval, codes, cookie-based click tracking and last-click attribution, category commissions, tiers, TDS, payouts, admin console) — both largely production-shaped in schema and service logic.
2. **What can be reused:** The referral and affiliate service/controller/route layers almost entirely; the generic wallet for money movement (pending a ledger-unification decision); the coupon engine's rule/reservation pattern as a template for reward rules; the FCM push + notification-table pattern; RBAC middleware; admin-log audit pattern.
3. **What needs modification:** Three specific call sites (`placeOrder`, delivery-marking, cancel/return) need direct calls added into the already-written service functions; `onOrderReturned` needs post-credit clawback logic; `processAffiliateOrder`'s commission base and `calculateTier()` wiring need revisiting; `referral_campaigns`/`affiliate_links` schemas need enrichment; order `status` should become an enum before new hooks depend on it.
4. **What needs to be newly created:** Membership/subscription module (entirely absent); referral link/click tracking (affiliate has it, referral doesn't); campaign-based and product-based commission rules; points/coupon-conversion reward types; communication templates; marketing analytics/rollups; device-fingerprint fraud signal; an actually-running cron scheduler.
5. **Biggest technical risk:** The order-lifecycle hooks are fully written but completely disconnected from the real order flow, combined with no idempotency guard on the referral side — wiring them in naively risks duplicate reward/commission generation.
6. **Biggest business ambiguity:** Whether referral (permanent) and affiliate (last-click) attribution can coexist on one order, and if so which one wins or whether both pay out — nothing in the code resolves this today.
7. **Recommended implementation order:** (1) enable cron + fix order-status enum, (2) wire the three existing lifecycle hooks into `orderController`/`riderOrderController`/`returnOrderController` with idempotency guards, (3) add post-credit reward/commission reversal, (4) enrich campaign/rules schema, (5) build membership module on top of the qualifying-purchase event now flowing through the wired hooks, (6) build analytics rollups, (7) address fraud/device gaps, (8) unify or bridge the three money ledgers if the business wants one wallet.

---

## Backend Readiness Score

- Referral readiness: **7/10** (logic essentially complete; disconnected from real order flow, no click stage)
- Affiliate readiness: **7/10** (logic essentially complete; commission wiring gaps, no brand/store links, no reversal on return)
- Reward readiness: **6/10** (full lifecycle modeled; missing clawback-after-credit and points/coupon reward types)
- Order lifecycle readiness: **4/10** (no enum, no hooks wired, generic `updateOrderStatus` is a no-op beyond the DB write)
- Wallet/payout readiness: **6/10** (solid generic wallet + two separate referral/affiliate payout rails; no unification)
- Campaign readiness: **3/10** (admin routes scaffolded; underlying model has almost no rule fields)
- Membership readiness: **0/10** (not found at all)
- Analytics readiness: **2/10** (raw data exists; no rollups, no marketing-facing endpoints)
- Fraud readiness: **5/10** (IP + self-referral + block/unblock done; device fingerprinting and affiliate-side fraud logging absent)

**OVERALL INTEGRATION READINESS: 5/10** — the hardest data-model and business-logic work for referral and affiliate is already done to a surprising depth; the primary remaining engineering effort is *wiring* (connecting existing services to real order events with idempotency), *enrichment* (campaign rules, brand/store links), and one genuinely new module (membership) plus analytics.
