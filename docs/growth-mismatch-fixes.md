# App and backend growth fixes — 25 October 2026

Scope: mobile app and shared backend findings in the workspace `bug.md`. The follow-up also aligns the affected website/admin screens. Referral rewards remain withdrawal-only and payouts are admin-recorded, as explicitly selected by the user.

## Behavior

- Affiliate campaign caps are per campaign per order, shared across matching lines. Fixed rewards retain per-line calculation within this shared cap. Independent campaigns retain independent budgets.
- Campaign priority is product, category, store; equal specificity chooses the oldest campaign, then campaign ID. Ineligible minimums and exhausted quotas fall through to the next candidate. Database errors propagate for retry instead of silently paying a default rate.
- Referral campaign and normal rewards share a lifetime allowance checked under a profile row lock. Replaying the same referral cannot credit twice; no active zero-value referrer reward is created. Return reconciliation now uses completed return records and the original conversion snapshot, as described below.
- `applicable_first_order` now excludes customers with a prior non-cancelled/non-failed order when enabled. Referral order hooks run after items exist and, for wallet orders, after the debit succeeds.
- Membership activation remains the idempotent `POST /referral/profile/generate-code`. Reading a profile does not enroll. Mobile requires activation before exposing copy/share actions, displays actual membership status, trial end, grace deadline and qualifying counts, and labels performance tiers separately.
- The share-content response includes `invitation_url` and conditional reward copy. The app uses the returned URL and avoids appending it twice.
- Affiliate dashboard lists expose Load more using backend totals. Referral checkout-spending claims and unsupported payout timing promises have been removed from app rules. Referral rewards remain separate from the main wallet; redemption is not implemented by this patch.

## Durable attribution

Mobile sends `{ attribution: { affiliate_code, click_id } }` with COD, verified Razorpay and wallet order creation. The input is stored on the order itself; no conversion HTTP request blocks checkout. Existing `/affiliate/convert` callers remain supported: authenticated order ownership is required, and the endpoint durably queues the first attribution and responds with HTTP 202 `{ success: true, queued: true }`. This acknowledges receipt, not commission approval.

The existing growth cron reconciles up to 100 pending orders every minute, oldest/least-attempted first. Temporary failures retain their input, attempt count and error for retry. Commission creation and affiliate profile accounting commit together; the unique affiliate order ID prevents duplicate earnings. Replays finish referral precedence and click statistics. Click expiry is evaluated at order creation, and campaign schedules are matched to order time. Current campaign rules and active flags still apply; historical rule edits are not reconstructed. Invalid attribution is completed without a commission. Unpaid wallet orders wait for their completed debit. Cancelled, failed, returned and refunded orders are skipped, and late delivered orders recover their hold window from tracking. Referral reward credit waits while a saved affiliate attribution is pending.

Monitor `orders.affiliate_attribution_attempts`, `affiliate_attribution_error`, and null `affiliate_attribution_processed_at` for non-null attribution, plus `[affiliate-attribution]` and growth-cron logs. Existing orders with no saved attribution cannot be recovered automatically unless a legacy client submits `/convert` or another trusted source supplies their original attribution. Existing historical accounting inconsistencies are not backfilled.

## Return accounting follow-up

`affiliateReturnService` reconciles cumulative completed returns under an affiliate-order row lock. New conversions retain order-item IDs and original per-line commission allocations; returned quantities reverse their share of that snapshot. Discounted order bases remain proportional to returned product value, and quantities are capped at the original purchase. Legacy conversions without item snapshots use proportional commission reduction. Replays and concurrent callbacks do not double-deduct.

Pending commissions reduce pending earnings. Approved commissions update commission/TDS values and available earnings. Pending admin payouts and processing balances adjust together. Full cancellation reverses only the remaining commission and removes the affected commission from a pending payout. Amount guards prevent stale payout creation/completion, and approval rereads financial values under its lock. Payments already paid or marked externally processing are retained without clawback, with an audit entry for the absorbed return. Completed returns cannot be reopened.

Attribution reconciliation replays returns completed before conversion. The recurring return job scans existing return records in batches with a cycling cursor, retrying missed callbacks without schema changes. Referral partial-return bases are likewise recomputed from completed records.

## Customer and admin parity follow-up

Website checkout sends attribution at order creation for COD, Razorpay and wallet orders. Pending referral invitations use explicit apply/retry and survive failed requests. Web referral views require activation, display actual membership and use current reward/withdrawal rules. Rejected affiliates can reapply, product search uses the server, lists expose pagination, and browser click tracking deduplicates concurrent/repeated URL capture.

Admin campaign queries load every page before calculating totals/charts; the campaign table paginates the complete filtered result and distinguishes exhausted quotas from live eligibility. The mobile app audit removes repeated reapply/approval steps, isolates saved selections by account, shares simultaneous status requests, refreshes selected lists, and displays retryable history/reward errors. See the app flow audit for navigation details.

## Deployment and rollback

1. Apply the additive migration `20261025120000_durable_affiliate_attribution` using the repository's normal `npm run db:deploy` workflow. Do this before deploying code that reads the new fields. This patch does not apply migrations to a live database.
2. Run `npm run db:generate` during the backend build, deploy the backend, and ensure the existing growth cron is running on instance 0. Check queued attribution, retry logs and eventual completion on staging.
3. Release the app after the backend. Older clients can continue submitting `/convert` to the new backend.
4. For rollback, roll back the app first, then backend code if needed. Retain all additive columns and queued records; resume reconciliation when redeploying. Do not drop the columns or mark pending records complete as part of rollback. No destructive down migration is needed.

Unit regressions use mocked Prisma transactions. Real database lock contention/rollback, process termination, device app links, and actual payment methods still need staging/device validation. No external bank/UPI transfer is initiated by these interfaces.

## Local verification

- Node 24: 68 backend growth tests, 30 mobile referral/service tests and five website tracking tests pass.
- App-wide TypeScript and focused growth lint pass. The broader cart-hook check retains five existing dependency warnings.
- Admin production build and focused campaign lint pass. Website production build passes with network access for its configured Google font; restricted-network attempts fail to fetch the font.
- Prisma schema validation/local client generation passed earlier; the schema has not changed during the return/UI follow-up. No migration was run.
- Financial regressions use mocked transactions. Actual database contention, real payment processing, physical-device navigation/app links and process termination still require staging/device verification.
