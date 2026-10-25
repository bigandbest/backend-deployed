# Growth bug-fix context — backend

Updated: 25 October 2026. Scope: changes built in this conversation from the cross-platform findings in [bug.md](../bug.md).

## Completed locally

- Enforced affiliate campaign caps across all matching order lines, including fixed rewards. Separate campaigns retain separate caps.
- Made campaign selection deterministic: product, category, store; ties use oldest creation time, then campaign ID. Minimum-value failures and exhausted quotas try the next eligible campaign.
- Enforced the referral lifetime earning allowance for both normal and campaign rewards under a profile row lock. Duplicate processing cannot credit the same referral twice, and zero allowance creates no active zero-value referrer reward.
- Connected `applicable_first_order` to referral order eligibility.
- Moved referral creation hooks out of the order DAO: normal orders invoke the hook after item creation; wallet orders invoke it after the successful wallet debit. Detailed-address orders retain their post-commit hook.
- Added durable affiliate attribution on orders, a minute-by-minute reconciliation job, retry/error tracking, and atomic commission/profile balance writes. Click expiry and campaign schedules use order time.
- Preserved the legacy conversion endpoint as an authenticated, ownership-checked enqueue operation returning HTTP 202. The first saved attribution wins.
- Deferred referral credit while saved affiliate attribution remains unresolved. Unpaid wallet orders wait for a debit; cancelled, failed, returned and refunded orders do not create new commissions in reconciliation. Late delivery processing restores the commission hold window from tracking.
- Returned invitation URLs and conditional reward messages from share-content. Blocked referral profiles cannot activate membership. Existing idempotent membership enrollment remains behind the explicit generate-code action.
- Aligned notification variable rendering and validation with whitespace accepted by previews.

## Follow-up accounting and synchronization fixes

- Added `services/affiliateReturnService.js`: completed returns reduce the original item commission snapshot, clamp returned quantities, preserve discounted bases, update pending/approved balances and TDS, and adjust pending admin payouts atomically. Legacy snapshots use a proportional reduction.
- Repeated callbacks use cumulative completed return records and row locks; they do not double-deduct. New attribution replays earlier returns; a cursor-based recurring job recovers missed return callbacks.
- Full cancellation reverses the remaining commission after any partial returns. Paid or externally processing payouts retain the existing no-clawback policy and record the absorbed amount in the audit log.
- Approval rereads financial values under the order lock. Payout creation/completion detect intervening amount changes. Completed returns cannot be reopened.
- Referral partial-return order amounts also reconcile from durable records. Parallel profile reads use an idempotent upsert. Application lookup failures return a retryable error rather than pretending the user has never applied.

## Main files

- `services/affiliateService.js`, `services/campaignEngine.js`, `services/referralService.js`
- `services/affiliateAttribution.js`, `services/affiliateReturnService.js`, `services/growthCron.js`, `services/notificationTemplateService.js`
- `controller/affiliateTrackingController.js`, `controller/referralController.js`, `controller/affiliateApplicationController.js`
- `controller/affiliateAdminController.js`, `controller/affiliateDashboardController.js`, `controller/returnOrderController.js`
- `controller/orderController.js`, `controller/walletController.js`, `dao/order.dao.js`
- `prisma/models/orders.prisma`, generated `prisma/schema.prisma`
- `prisma/migrations/20261025120000_durable_affiliate_attribution/migration.sql`
- Growth regression tests in `test/growth/`

## Verification performed

- `npm run test:growth`: 68 backend growth tests passed using the installed Node 24 runtime.
- Prisma schema validation, local Prisma client generation, changed backend JavaScript syntax checks, and diff whitespace checks passed.
- Tests use mocked database transactions; real database concurrency, process termination and payment integration remain unverified.

## Database status and user constraint

**The user explicitly instructed: do not run migrations. No migration was run.**

The SQL migration was prepared only. It adds attribution input, processed timestamp, attempts, error, and an index to orders. Local schema validation/client generation do not apply database changes. The new backend requires those columns before deployment; deployment has not been performed by this task. Do not apply the migration without a subsequent user instruction authorizing it.

## Cross-platform synchronization

Website/admin parity fixes are now included: explicit referral activation, retryable code application, live rules, reapplication, server product search, list pagination, complete campaign totals and quota-aware status labels. The app uses account-scoped saved promotion intent, shared concurrent reads and one owning referral dashboard/link generator.

## Remaining boundaries
- Historical orders without saved attribution cannot be recovered automatically. Historical accounting inconsistencies were not backfilled, and historical campaign edits are not reconstructed.
- By explicit user choice, referral rewards remain withdrawal-only and bank/UPI payouts remain admin-recorded external payments. These are the intended scope, not pending integrations.
- Staging checks still need actual payment methods, job execution, real database locking, returns and reconciliation.

## Related context

- [Implementation and rollout notes](docs/growth-mismatch-fixes.md)
- [App context](../bbm-app/GROWTH_FIX_CONTEXT.md)
- [Website context](../frontend-deployed/GROWTH_FIX_CONTEXT.md)
- [Admin context](../admin-deployed/GROWTH_FIX_CONTEXT.md)
