Yes. I would add a **Coding & Architecture Standards** section to the document. Since this is a financial/reward system, I would make these requirements explicit rather than leaving them as general "best practices."

You can add the following section to the MD:

````md
# 19. Coding & Architecture Standards

All phases must follow production-grade engineering practices. The goal is not only to make the features work, but to keep the Growth Program modular, maintainable, testable, and efficient as the system grows.

## 19.1 Modular Architecture

Referral, Affiliate, Campaign, Membership, Analytics, Wallet, Fraud, and Notifications should remain separate modules/services with clear responsibilities.

Do not create one large `growthService` containing all business logic.

Recommended separation:

```text
Growth
├── Referral
│   ├── Controller
│   ├── Service
│   ├── Repository / DAO
│   ├── Rules
│   └── Validators
│
├── Affiliate
│   ├── Controller
│   ├── Service
│   ├── Repository / DAO
│   ├── Rules
│   └── Validators
│
├── Campaign
│   ├── Controller
│   ├── Service
│   ├── Repository / DAO
│   └── Rules Engine
│
├── Membership
│   ├── Controller
│   ├── Service
│   ├── Repository / DAO
│   └── Rules
│
├── Analytics
│   ├── Controller
│   ├── Service
│   └── Repository
│
└── Shared
    ├── Reward Calculation
    ├── Attribution
    ├── Eligibility
    └── Common Types / Constants
````

Each module should expose only the functionality required by other modules.

---

## 19.2 Single Responsibility

Every service/function should have one clear responsibility.

Avoid functions such as:

```text
processOrderAndReferralAndAffiliateAndWallet()
```

Prefer:

```text
processOrder()
evaluateReferral()
evaluateAffiliate()
createReward()
createCommission()
```

Business orchestration can happen at the appropriate application/service layer while individual components remain focused.

---

## 19.3 Avoid N+1 Database Queries

All implementations must explicitly avoid N+1 query patterns.

### Bad

```js
const orders = await getOrders();

for (const order of orders) {
  const user = await getUser(order.userId);
  const reward = await getReward(order.id);
}
```

This creates:

```text
1 query for orders
+
N queries for users
+
N queries for rewards
```

### Prefer

Use:

* joins / Prisma `include`
* `select`
* batch queries
* `findMany`
* `groupBy`
* `in` queries
* preloaded relationships
* aggregation queries

Example:

```js
const orders = await prisma.order.findMany({
  where: {
    id: { in: orderIds },
  },
  include: {
    user: true,
    reward: true,
  },
});
```

Or batch related data:

```js
const users = await prisma.user.findMany({
  where: {
    id: { in: userIds },
  },
});
```

Then construct an in-memory lookup map when appropriate.

---

## 19.4 Query Efficiency

Do not retrieve entire database records when only a few fields are required.

Prefer:

```js
select: {
  id: true,
  userId: true,
  total: true,
  status: true,
}
```

instead of fetching the entire record.

Every new query should have a clear reason.

Before adding a query, ask:

1. Can the existing query provide this data?
2. Can this be included in the existing query?
3. Can multiple queries be batched?
4. Can the calculation be performed using already-loaded data?
5. Does the query require an index?

---

## 19.5 Transaction Boundaries

Financially significant operations must use appropriate database transactions.

Examples:

* Reward creation
* Commission creation
* Reward state transitions
* Commission state transitions
* Wallet credit
* Withdrawal state changes
* Return/reversal processing

Related writes that must succeed or fail together should be part of the same transaction where practical.

Do not perform:

```text
Create Order
COMMIT

Create Reward
COMMIT
```

when the business rule requires both operations to be atomic.

---

## 19.6 Idempotency

All order lifecycle hooks must be idempotent.

The same lifecycle event may be triggered more than once because of:

* API retries
* duplicate requests
* worker retries
* controller retries
* admin actions
* application restarts

Example:

```text
Order #123
    ↓
onOrderPlaced()
    ↓
Reward created

onOrderPlaced() called again
    ↓
Existing reward detected
    ↓
No duplicate reward
```

Prefer database-level unique constraints wherever possible rather than relying only on application-level checks.

---

## 19.7 Database Constraints

Business invariants that must always hold should be enforced at the database level where possible.

Examples:

```text
One referral reward per qualifying order/attribution
One affiliate commission per qualifying order/attribution
One membership eligibility record per user
Unique referral codes
Unique affiliate codes
```

Application validation should still exist, but database constraints provide the final protection against race conditions.

---

## 19.8 Concurrency Safety

Do not assume requests are processed sequentially.

Potential concurrent operations include:

```text
Order placement
Reward creation
Return request
Reward expiry
Withdrawal
```

Use appropriate:

* database transactions
* unique constraints
* conditional updates
* row locking where required
* atomic state transitions

Avoid:

```js
if (!reward) {
  await createReward();
}
```

as the only duplicate-prevention mechanism.

Two requests can both observe `!reward`.

---

## 19.9 State Transition Rules

Reward, commission, withdrawal, and membership statuses should have explicit valid transitions.

Example:

```text
PENDING
   |
   v
AVAILABLE
   |
   v
WITHDRAWAL_REQUESTED
   |
   v
PAID
```

Invalid transitions should be rejected.

For example:

```text
PAID → PENDING
```

should not happen through a normal application operation.

State transitions should be centralized rather than duplicated across controllers.

---

## 19.10 Controllers Should Remain Thin

Controllers should primarily handle:

* Request validation
* Authentication/authorization
* Calling application services
* Formatting responses

Avoid putting complex business logic inside controllers.

Bad:

```js
router.post('/order', async (req, res) => {
  // 100+ lines of referral calculations
  // commission calculations
  // wallet logic
  // campaign logic
});
```

Prefer:

```js
router.post('/order', async (req, res) => {
  const result = await orderService.placeOrder(req.user, req.body);
  return res.json(result);
});
```

Business logic belongs in services/domain components.

---

## 19.11 Repository / DAO Responsibility

Repositories/DAOs should be responsible for data access rather than business decisions.

Avoid:

```js
affiliateDao.calculateCommissionAndApprovePayout();
```

Prefer:

```js
affiliateDao.findEligibleCommissionRule();
affiliateDao.createCommission();
```

The service decides whether the commission is eligible and what should happen.

---

## 19.12 Shared Calculation Logic

Do not duplicate financial calculations between Referral and Affiliate.

For example, avoid:

```text
referralService.js
    calculateEligibleAmount()

affiliateService.js
    calculateEligibleAmount()
```

These can drift apart.

Create a shared calculation component:

```text
Growth
└── Shared
    └── RewardCalculationService
```

It should provide the canonical eligible amount calculation.

```text
Eligible Base
=
Product Subtotal
- Coupon / Discount
- Excluded Amounts
```

Referral and Affiliate can then apply their own reward/commission rules to the same base.

---

## 19.13 Attribution Logic Should Be Centralized

Attribution decisions should not be duplicated in controllers.

Use a dedicated component:

```text
AttributionService
```

For example:

```text
Affiliate Last Click exists?
        |
       YES
        |
        v
Affiliate attribution wins

       NO
        |
        v
Permanent referral attribution
```

This ensures the Q1 business rule is implemented consistently.

---

## 19.14 Avoid Hard-Coded Business Rules

Do not hard-code values such as:

```js
const reward = order.total * 0.10;
```

when the business expects configurable rules.

Instead:

```text
Order
 ↓
Campaign
 ↓
Applicable Rule
 ↓
Eligible Base
 ↓
Reward Calculation
```

Hard-coded constants should only be used where the value is genuinely a technical constant.

---

## 19.15 Avoid Premature Abstraction

Modularity does not mean creating unnecessary abstractions.

Do not create:

```text
BaseGrowthFactory
AbstractRewardProvider
GenericGrowthStrategyFactory
UniversalAttributionAdapter
```

unless there is a real requirement for them.

Prefer simple, understandable modules first.

The architecture should evolve from actual requirements.

---

## 19.16 API Design

APIs should:

* Follow consistent naming conventions
* Use appropriate HTTP methods
* Validate request parameters
* Return consistent response structures
* Return meaningful HTTP status codes
* Avoid leaking internal database structures
* Avoid exposing unnecessary fields

Do not create multiple APIs that return the same information for different screens unless there is a clear reason.

---

## 19.17 Pagination

Any endpoint returning potentially large collections must support pagination.

Examples:

* Referral transactions
* Affiliate orders
* Commission history
* Withdrawal history
* Campaigns
* Analytics
* Fraud logs

Avoid unbounded:

```text
GET /referral/transactions
```

responses.

Prefer:

```text
?page=1&limit=20
```

with a sensible maximum limit.

---

## 19.18 Indexing

Every frequently queried field should be evaluated for indexing.

Important examples include:

```text
user_id
order_id
referral_code
affiliate_id
affiliate_click_id
campaign_id
status
created_at
is_converted
```

Composite indexes should be introduced when the query pattern justifies them.

Do not add indexes blindly; validate them against actual query patterns.

---

## 19.19 Selective Loading

For dashboards, return only what the screen requires.

Avoid:

```text
Referral Dashboard
    ↓
Load complete user
Load every order
Load every transaction
Load every reward
Load every affiliate record
```

Instead use purpose-built aggregation queries where appropriate:

```text
Referral Dashboard
    ├── Total Referrals
    ├── Successful Referrals
    ├── Total Earnings
    ├── Available Balance
    └── Recent Transactions
```

This reduces database load and response size.

---

## 19.20 Caching

Caching should be used selectively for data that is:

* Read frequently
* Relatively stable
* Safe to serve slightly stale

Good candidates may include:

* Public referral configuration
* Active campaign configuration
* Static reward configuration

Do not cache financial balances or state transitions without a clearly defined consistency strategy.

---

## 19.21 Error Handling

Use consistent error handling.

Do not silently swallow errors:

```js
try {
  await createReward();
} catch (error) {
  console.log(error);
}
```

Errors affecting financial correctness should be:

* Logged
* Traceable
* Associated with the relevant order/user/transaction
* Returned or propagated appropriately
* Recoverable where possible

---

## 19.22 Observability

Important growth operations should have structured logs.

Examples:

```text
ORDER_REWARD_CREATED
ORDER_COMMISSION_CREATED
REWARD_AVAILABLE
REWARD_REVERSED
COMMISSION_REVERSED
WITHDRAWAL_REQUESTED
WITHDRAWAL_APPROVED
FRAUD_DETECTED
```

Include identifiers such as:

```text
orderId
userId
referralId
affiliateId
rewardId
commissionId
campaignId
```

Do not log sensitive personal or financial information unnecessarily.

---

## 19.23 Auditability

Financial and administrative actions should remain auditable.

Examples:

* Reward approval
* Reward reversal
* Commission approval
* Commission reversal
* Withdrawal approval
* Fraud block/unblock
* Campaign changes
* Reward-rule changes
* Membership changes

Use the existing audit/logging mechanisms where possible rather than creating duplicate audit systems.

---

## 19.24 Security

All new APIs must follow existing:

* Authentication
* Authorization
* RBAC
* Input validation
* Rate limiting where required
* Ownership checks

A customer must not be able to access another customer's:

* Referral wallet
* Earnings
* Transactions
* Withdrawal records
* Analytics

Admin operations must require appropriate permissions.

---

## 19.25 Input Validation

Validate all external input at the API boundary.

Examples:

* Referral code
* Affiliate code
* Campaign ID
* Product ID
* Withdrawal amount
* Pagination parameters
* Date ranges

Never rely solely on frontend validation.

---

## 19.26 Financial Precision

Do not use unsafe floating-point arithmetic for monetary calculations.

Avoid:

```js
0.1 + 0.2
```

for financial balances.

Use the database's appropriate decimal/numeric type and the project's established money-handling strategy.

Rounding rules must be explicit and consistent.

---

## 19.27 No Business Logic Duplication

Before implementing a new function, check whether equivalent functionality already exists.

Examples:

* Reward calculation
* Wallet credit
* Withdrawal
* Notification
* Fraud logging
* Audit logging
* Authentication
* User lookup

Reuse existing stable functionality instead of creating a second implementation.

---

## 19.28 Backward Compatibility

Because this work extends an existing production codebase:

* Do not unnecessarily break existing APIs
* Preserve existing response contracts where mobile already depends on them
* Introduce changes incrementally
* Avoid destructive migrations unless required
* Backfill data before making existing fields mandatory
* Test existing order flows after growth integration

---

## 19.29 Testing Requirements

Every phase should include automated tests.

### Unit tests

Test:

* Reward calculation
* Commission calculation
* Attribution
* Eligibility
* Status transitions
* Campaign rules
* Membership rules

### Integration tests

Test:

```text
Signup
 → Referral Attribution
 → Order
 → Reward
 → Delivery
 → Return Window
 → Available Reward
 → Withdrawal
```

And:

```text
Affiliate Application
 → Approval
 → Link
 → Click
 → Order
 → Commission
 → Delivery
 → Return Window
 → Withdrawal
```

### Idempotency tests

Explicitly test duplicate lifecycle calls.

```text
onOrderPlaced() × 2
    → one reward

processAffiliateOrder() × 2
    → one commission
```

### Failure tests

Test failures during:

* Order creation
* Reward creation
* Commission creation
* Wallet credit
* Return processing
* Withdrawal

---

## 19.30 N+1 and Performance Review

Before merging any feature, review:

1. Number of database queries
2. Queries executed inside loops
3. Large `include`/joins
4. Missing indexes
5. Unbounded queries
6. Duplicate queries for the same data
7. Unnecessary API calls
8. Large response payloads

A feature is not considered complete merely because the functional test passes.

---

## 19.31 Migration Safety

Database migrations must be backward-compatible wherever practical.

For new required fields:

```text
Add nullable field
      ↓
Deploy code that populates it
      ↓
Backfill existing records
      ↓
Validate data
      ↓
Add NOT NULL constraint
```

Do not introduce a `NOT NULL` field to an existing populated table without confirming existing rows are handled.

---

## 19.32 Code Quality

All code should follow the existing project's conventions for:

* Naming
* Folder structure
* Error handling
* Async patterns
* Database access
* Validation
* Logging
* Formatting

Avoid mixing architectural styles within the same feature unless there is a documented reason.

---

# 20. Definition of Done — Engineering

A feature is not considered complete until:

* [ ] Business rules are implemented
* [ ] Existing functionality is preserved
* [ ] No unnecessary duplicate logic exists
* [ ] No N+1 query pattern exists
* [ ] Database queries are reviewed
* [ ] Appropriate indexes exist
* [ ] Transaction boundaries are reviewed
* [ ] Idempotency is guaranteed where required
* [ ] Race conditions are considered
* [ ] Input validation exists
* [ ] Authorization is enforced
* [ ] Errors are handled and logged
* [ ] Financial calculations use safe precision
* [ ] Audit requirements are covered
* [ ] Unit tests exist
* [ ] Integration tests exist
* [ ] Failure scenarios are tested
* [ ] API contracts remain backward compatible where required
* [ ] Database migrations are safe
* [ ] Performance has been reviewed
* [ ] Code is modular and maintainable

---

# 21. Core Engineering Principle

The Growth Program should follow this principle:

> **Build the smallest correct solution, keep business domains modular, reuse existing infrastructure, minimize database calls, make financial operations transactional and idempotent, and avoid introducing architecture that the current requirements do not justify.**

The objective is not to create the most abstract architecture.

The objective is to create a **reliable, maintainable and scalable Growth Program without unnecessary complexity or technical debt.**
"""

path = Path("/mnt/data/growth_program_coding_architecture_standards.md")
path.write_text(content, encoding="utf-8")
print(path)
print(len(content.splitlines()), "lines")
print(len(content.encode("utf-8")), "bytes")
Griffin = None
Griffin
if False else None
print("done")
