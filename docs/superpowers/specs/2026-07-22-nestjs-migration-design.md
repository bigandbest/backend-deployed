# NestJS Migration Design — BBM Backend

**Date:** 2026-07-22
**Status:** Approved by Amit (conversation, 2026-07-22)
**Source app:** `backend-deployed/` — Express 5, ESM, Prisma 5 + Supabase Postgres, ioredis, BullMQ, RabbitMQ (amqplib), Firebase Admin (FCM), Cloudinary, PM2 cluster. Serves production traffic.
**Target app:** `backend-nest/` — new sibling folder, NestJS 10 + TypeScript, Express adapter.

## Goals

1. Migrate the entire backend to NestJS with **zero functionality breakage** — production keeps running on the Express app until full parity is proven.
2. Separate folder; the old codebase is never modified (except adding docs/tests).
3. Persistent memory + progress tracker so any session can resume the migration safely.

## Non-goals

- No database schema changes. The existing Prisma schema is reused verbatim.
- No frontend changes during the port (see Fidelity below).
- No cutover in this project phase; cutover is planned but executed only after parity sign-off.

## Chosen strategy

**Incremental module-by-module port with parity testing.** Each domain is ported into `backend-nest/`, then verified by firing identical requests at both apps and diffing responses. A module is "done" only when parity passes. The Express app remains the source of truth throughout.

## Fidelity: 3-way comparison (required deliverable in the plan)

| Approach | What it means | Frontend impact | Risk | Verdict |
|---|---|---|---|---|
| **Strict 1:1 port** | Same paths, status codes, response shapes, even quirks | Zero — frontend untouched | Lowest | **Recommended for the port** |
| Port + safe cleanups | Contracts identical; internals restructured, validation tightened | Zero if contracts truly held; tightened validation can reject previously-accepted bad input → hidden frontend breakage | Medium | Defer cleanups to a logged list, apply after cutover |
| Modernize as we go | Improve API design; coordinate frontend updates | High — every changed endpoint needs a frontend change, both indexed frontends (`frontend-deployed`, `bbm-app`) must be audited per endpoint | Highest | Rejected for the port |

Decision: **strict 1:1** during the port. Every cleanup opportunity found is recorded in `docs/superpowers/deferred-cleanups.md` instead of being applied. Frontend-impact audit per endpoint is derived from the indexed frontend code graphs before any contract is ever allowed to change.

## Architecture of `backend-nest/`

- **NestJS 10, TypeScript, Express adapter** (not Fastify) so middleware semantics (cookies, CORS, multer uploads, compression) match the current app.
- **Prisma:** copy the existing schema + `scripts/compile-schema.js` flow; same generated client, same DB, same connection env vars.
- **Layering preserved:** `routes → controller → services → dao` maps to Nest `controller → service → repository`. DAO files port nearly 1:1 as injectable repositories.
- **Global cross-cutting pieces**, built first and shaped to byte-match current behavior:
  - JWT auth guard replicating `middleware/authenticate.js` (same token sources: headers/cookies, same error bodies).
  - Roles guard replicating `middleware/authorize.js`.
  - Exception filter reproducing the current error-response format(s).
  - No global response-mapping interceptor unless the current app has a uniform envelope — controllers return exactly what the old handlers returned.
- **Config:** `@nestjs/config` reading the same `.env` keys. No renames.
- **Queues/Jobs:** BullMQ via `@nestjs/bullmq` (Phase D); crons in `services/*Cron*.js`, `cronJobs.js`, `scheduled-jobs.js` via `@nestjs/schedule` (Phase D).
- **Workers:** `workers/` (bulkPrice, enquiry, geocodeRetry, notify, review) become Nest queue processors, runnable as a separate Nest app context (mirroring `npm run workers`).

## Module inventory (from code graph: 113 route files → ~50 domains)

Grouped into Nest modules: auth, admin-auth, seller-auth, rider-auth, users/profile, admin-users, products (+variants, bulk, brand-products, recommendations, sections V3), categories, brands, banners (add/promo/small-promo/video-card), stores (shopByStore, store, subStore, recommendedStore), quickPick/b&b/dailyDeals/savingZone/uniqueSection groupings, cart (+checkCartAvailability), wishlist, shoppingList, orders (+cod, walletOrder, onlinePaymentOrder, returnOrder, bulkOrder), payments (+refunds), wallet, coupons, delivery (charges, validation, zones, pincodes, geoAddress, location), warehouse/inventory/stock/outOfStock, fulfillment (+admin, SLA, tracking), riders (admin, location, orders, payouts), sellers, affiliate (admin, application, dashboard, tracking), referral (+internal, admin), enquiries (+messages), notifications (+FCM tokens), reviews, invoices, attendance, teamMembers, partners, businessPartnerInquiry, contact, testimonials, faqTemplates, bids, certifications, platformFee/chargeSettings/payoutSlabs, search, uploads, sessions, misc content (aboutContent), debug/quickFix (port last; candidates for exclusion — confirm before dropping).

## Safety net

1. **API contract snapshots first:** before porting a module, its full contract (method, path, auth, params, request/response shape, status codes) is extracted from the code graph + source into `docs/api-contracts/<module>.md`. This is the must-not-break checklist.
2. **Parity harness:** a test runner (in `backend-nest/test/parity/`) that sends the same request to Express (source of truth) and Nest, and deep-diffs status + headers-of-interest + body. Seeded/staging DB, never production. Read-only endpoints diffed directly; mutating endpoints run against isolated DB snapshots per app.
3. **Progress tracker:** every module has a status — `not-started → contract-snapshotted → ported → parity-passed`. Tracked in memory + `docs/superpowers/migration-progress.md`.
4. **Old app untouched**, production traffic untouched, until Phase F sign-off.

## Phases

- **A. Scaffold + shared infra:** Nest workspace in `backend-nest/`, Prisma wiring, Redis, config, auth/roles guards, error filter, parity harness skeleton.
- **B. Prove the pattern (low-risk read-heavy modules):** categories, brands, banners, stores. Full contract→port→parity cycle on each.
- **C. Core commerce:** products, cart, wishlist, orders, payments, wallet, coupons, delivery, inventory/warehouse, fulfillment, riders, sellers, affiliate/referral, remaining domains.
- **D. Background processing:** BullMQ workers, crons, RabbitMQ consumers.
- **E. Scripts:** seeding/verification scripts (port or keep as-is per script; operational tooling may stay JS).
- **F. Full parity sign-off + cutover plan:** documented options (nginx per-route-group switch vs full switch vs Nest-proxies-to-Express strangler), decided with Amit at that time.

## Error handling & testing

- Parity harness is the primary correctness gate; unit tests added for ported services where logic is non-trivial (wallet, checkout, stock reservation, payouts).
- Any behavioral difference found is resolved in favor of the Express app's behavior, no exceptions, during the port.

## Risks

- **Express 5 quirks** (route patterns, async error handling) must be replicated deliberately.
- **Dual bcrypt libs** (`bcrypt` + `bcryptjs`) — hash compatibility must be preserved exactly.
- **`type: module` ESM → TS**: import-time side effects (cron auto-start in `server.js`/`services`) must be identified so Nest doesn't double-run jobs while Express is still live. **Nest dev/staging must run with crons/workers disabled by default** until Phase D cutover planning.
- **Shared Redis/queues:** Nest instances must use separate Redis key prefixes/queue names in testing so they never consume production jobs.
