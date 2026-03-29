# Return & Refund System — Complete Documentation

> **Last Updated:** March 2026
> **Stack:** Node.js / Express 5 · Prisma 5 · PostgreSQL (Supabase) · Next.js 16 · React 19 / Vite

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Database Schema](#2-database-schema)
3. [Business Rules](#3-business-rules)
4. [Backend Architecture](#4-backend-architecture)
5. [API Reference](#5-api-reference)
6. [Notification System](#6-notification-system)
7. [Frontend — User Flow](#7-frontend--user-flow)
8. [Admin Panel](#8-admin-panel)
9. [Status Lifecycle](#9-status-lifecycle)
10. [Error Reference](#10-error-reference)
11. [RabbitMQ Migration Guide](#11-rabbitmq-migration-guide)
12. [Future Enhancements](#12-future-enhancements)

---

## 1. System Overview

The Return & Refund system handles three distinct request types:

| Type | Trigger | Who | Refund |
|------|---------|-----|--------|
| **Return** | Delivered order, within return window | User | Item total (no shipping) |
| **Cancellation** | Pre-delivery order | User | Full order total (prepaid only) |
| **Standalone Refund** | Already-cancelled prepaid order | User | Full order total |

### Two DB Tables, One System

```
return_orders          ← Handles RETURNS + CANCELLATIONS
refund_requests        ← Handles STANDALONE REFUND requests (for already-cancelled orders)
```

Both tables use **Prisma only**. Supabase is not used in any return/refund controller.

### Key Constraints

- **COD orders are fully blocked** — no returns, no cancellations, no refunds.
- **Only prepaid orders** are eligible for monetary refunds.
- **Bank details are always required** when submitting any request.
- **Refund transfer is manual** — admin does the bank transfer outside the system, then marks `completed`.
- **Notifications** are written directly to the `user_notifications` table today; RabbitMQ will replace this (see §11).

---

## 2. Database Schema

### 2.1 `return_orders`

Handles all return and cancellation requests from users.

```prisma
model return_orders {
  id                       String               @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  order_id                 String               @db.Uuid        // FK → orders
  user_id                  String               @db.Uuid        // FK → users
  return_type              String               @db.VarChar     // "return" | "cancellation"
  reason                   String
  additional_details       String?
  bank_account_holder_name String?              @db.VarChar
  bank_account_number      String?              @db.VarChar
  bank_ifsc_code           String?              @db.VarChar
  bank_name                String?              @db.VarChar
  refund_amount            Decimal              @db.Decimal
  status                   String?              @default("pending") @db.VarChar
  admin_notes              String?
  admin_id                 String?              @db.Uuid        // FK → users (admin who acted)
  processed_at             DateTime?            @db.Timestamp(6)
  created_at               DateTime?            @default(now()) @db.Timestamp(6)
  updated_at               DateTime?            @default(now()) @db.Timestamp(6)
}
```

**Indexes:** `order_id`, `user_id`
**Cascade:** Deleting a `return_orders` row also deletes its `return_order_items` (onDelete: Cascade)

---

### 2.2 `return_order_items`

Stores per-item detail for partial returns.

```prisma
model return_order_items {
  id              String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  return_order_id String      @db.Uuid   // FK → return_orders (CASCADE DELETE)
  order_item_id   String      @db.Uuid   // FK → order_items
  quantity        Int         @default(1)
  return_reason   String?                // Per-item reason (overrides general reason)
  created_at      DateTime?   @default(now()) @db.Timestamp
}
```

**Indexes:** `return_order_id`, `order_item_id`

---

### 2.3 `refund_requests`

Stores standalone refund requests for already-cancelled prepaid orders.

```prisma
model refund_requests {
  id                       String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  order_id                 String    @db.Uuid        // FK → orders
  user_id                  String    @db.Uuid        // FK → users
  refund_amount            Decimal   @db.Decimal
  refund_type              String    @db.VarChar     // "order_cancellation" | "order_return" | "partial_refund"
  payment_method           String?   @db.VarChar     // Copied from order at request time
  original_payment_id      String?   @db.VarChar     // razorpay_payment_id from order
  bank_account_holder_name String?   @db.VarChar
  bank_account_number      String?   @db.VarChar
  bank_ifsc_code           String?   @db.VarChar
  bank_name                String?   @db.VarChar
  refund_mode              String?   @default("bank_transfer") @db.VarChar
  status                   String?   @default("pending") @db.VarChar
  admin_notes              String?
  processed_by             String?   @db.Uuid        // FK → users (admin)
  processed_at             DateTime? @db.Timestamp(6)
  razorpay_refund_id       String?   @db.VarChar     // Reserved for future Razorpay automation
  created_at               DateTime? @default(now()) @db.Timestamp(6)
  updated_at               DateTime? @default(now()) @db.Timestamp(6)
}
```

**Indexes:** `order_id`, `user_id`, `status`

---

### 2.4 `user_notifications`

Used by the notification service to store in-app notifications.

```prisma
model user_notifications {
  id           String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  user_id      String?   @db.Uuid
  type         String    @db.VarChar   // e.g. "return_created", "refund_status_updated"
  title        String    @db.VarChar
  message      String
  related_id   String?   @db.Uuid      // return_order.id or refund_request.id
  related_type String?   @db.VarChar   // "return_order" | "refund_request"
  is_read      Boolean?  @default(false)
  created_at   DateTime? @default(now()) @db.Timestamp
  read_at      DateTime? @db.Timestamp
}
```

---

## 3. Business Rules

### 3.1 COD Orders — Fully Blocked

```
payment_method contains "cod" | "cash" | "cash on delivery"
  → BLOCK all return, cancellation, and refund requests
  → Response: 400 "COD orders cannot be cancelled or returned as per policy."
```

No exceptions. COD orders have no monetary refund path.

---

### 3.2 Return Eligibility (Delivered Orders)

```
Order status = "delivered"
  → For each order item:
       returnDays = item.variant.product.return_days  (default: 7)
       daysSinceDelivery = ceil((now - order.updated_at) / 86400000)
       is_eligible = (daysSinceDelivery <= returnDays) AND (item not already returned)
  → can_return = true  if at least one item is eligible
```

- Return window starts from `order.updated_at` (delivery timestamp).
- Different products in the same order can have different return windows.
- Once an item's `order_item_id` appears in `return_order_items`, it is permanently ineligible for another return.

---

### 3.3 Cancellation Eligibility (Pre-Delivery Orders)

```
Order status IN ("pending", "confirmed", "processing", "shipped")
  → can_cancel = true
  → refund_amount = order.total  (full amount, prepaid only)
  → Order status immediately updated to "cancelled" on request creation
```

Delivered orders **cannot** be cancelled — they must use the return flow.

---

### 3.4 Refund Amount Calculation

| Request Type | Formula |
|---|---|
| Cancellation (prepaid) | `order.total` (full refund, includes shipping) |
| Return (selected items) | `Σ (order_item.price × return_quantity)` |
| COD (any) | `0` — request is blocked entirely |

Shipping cost is **not** refunded for returns. It is included for cancellations (since `order.total` already includes shipping).

---

### 3.5 Duplicate Prevention

| Scenario | Behaviour |
|---|---|
| Same order → second `return_orders` row | Blocked at controller level (`findByOrderId` check) |
| Same `order_item_id` → second `return_order_items` row | Blocked before creation, returns 400 |
| Same `order_id` → second `refund_requests` row | Blocked via `findByOrderId` check |

---

### 3.6 Bank Details

Required for **every** prepaid request regardless of type. Fields validated server-side:

- `bank_account_holder_name` (required)
- `bank_account_number` (required)
- `bank_ifsc_code` (required)
- `bank_name` (required)

---

## 4. Backend Architecture

### 4.1 File Map

```
backend-deployed/
│
├── prisma/models/
│   ├── return_orders.prisma
│   ├── return_order_items.prisma
│   └── refund_requests.prisma
│
├── dao/
│   ├── returnOrder.dao.js          ← Prisma DAO for return_orders + return_order_items
│   └── refundRequest.dao.js        ← Prisma DAO for refund_requests
│
├── controller/
│   ├── returnOrderController.js    ← Returns + cancellations
│   └── refundController.js         ← Standalone refund requests
│
├── routes/
│   ├── returnOrderRoutes.js        ← /api/return-orders/*
│   └── refundRoutes.js             ← /api/refund/*
│
└── services/
    └── notificationService.js      ← Central notification service (RabbitMQ placeholder)
```

---

### 4.2 `returnOrder.dao.js` — Method Reference

| Method | Signature | Description |
|---|---|---|
| `create` | `(data, items[])` | Creates `return_orders` + `return_order_items` in a single Prisma transaction |
| `findById` | `(id)` | Full fetch including items, user, order |
| `findByOrderId` | `(orderId)` | Checks if a return request already exists for an order |
| `listByUser` | `(userId, limit, offset)` | Paginated user history, ordered by `created_at` desc |
| `listAll` | `(filters, limit, offset)` | Admin list with optional `status` filter |
| `update` | `(id, data)` | Updates status, admin_notes, admin_id, processed_at |
| `delete` | `(id)` | Hard delete (cascade removes items) |

---

### 4.3 `refundRequest.dao.js` — Method Reference

| Method | Signature | Returns | Description |
|---|---|---|---|
| `create` | `(data)` | row | Inserts one `refund_requests` row |
| `findById` | `(id)` | row | Full fetch including order, user, processed_by user |
| `findByOrderId` | `(orderId)` | row \| null | Duplicate check |
| `listByUser` | `(userId, page, limit)` | `{ data, total }` | Paginated user history |
| `listAll` | `(filters, page, limit)` | `{ data, total }` | Admin list, `status` + `refundType` filters |
| `update` | `(id, data)` | row | Updates status, notes, processed_by, processed_at |
| `countByStatus` | `()` | grouped array | Counts + sums by status for dashboard |

---

### 4.4 Controller Logic Flow

#### `createReturnRequest`

```
1.  Validate: order_id, user_id, return_type, reason present
2.  Fetch order via orderDao.getById(order_id)
3.  Assert order.user_id === body.user_id
4.  Block if COD (payment_method check)
5.  Validate all 4 bank detail fields present
6.  Check eligibility:
      return:       order.status === "delivered"
                    each item in window (product.return_days)
                    no item already in return_order_items
      cancellation: order.status in (pending/confirmed/processing/shipped)
7.  Calculate refund_amount
      cancellation: order.total
      return:       Σ order_item.price × requested_quantity
8.  returnOrderDao.create(data, items)        ← atomic transaction
9.  If cancellation → orderDao.update(order_id, { status: "cancelled" })
10. notifyReturnCreated(userId, orderId, returnId, returnType)
11. Return 200 { success, return_order, message }
```

#### `createRefundRequest`

```
1. Validate orderId present
2. Fetch order via orderDao.getById
3. Assert order.user_id === req.user.id
4. Assert order.status === "cancelled"
5. Block if COD
6. Assert no existing refund_requests row for this order_id
7. refundRequestDao.create(data)
8. notifyRefundCreated(userId, orderId, refundId, amount)
9. Return 200 { success, refundRequest }
```

---

## 5. API Reference

### 5.1 Return Order Endpoints — `/api/return-orders`

---

#### `GET /eligibility/:order_id`

Check if an order is eligible for return or cancellation. No authentication required.

**Response 200:**
```json
{
  "success": true,
  "order_status": "delivered",
  "eligibility": {
    "can_return": true,
    "can_cancel": false,
    "reason": "",
    "days_since_delivery": 3,
    "item_eligibility": {
      "<order_item_id>": {
        "is_eligible": true,
        "reason": "Eligible (7-day window)",
        "return_days": 7,
        "remaining_days": 4
      }
    }
  },
  "returned_item_ids": ["<order_item_id>"]
}
```

**Decision matrix:**

| Order Status | Payment | `can_return` | `can_cancel` |
|---|---|---|---|
| any | COD | false | false |
| `delivered` | prepaid | per-item window check | false |
| `pending` / `confirmed` / `processing` / `shipped` | prepaid | false | true |
| `cancelled` / `completed` / other | any | false | false |

---

#### `POST /create`

Create a return or cancellation request.

**Request:**
```json
{
  "order_id": "uuid",
  "user_id": "uuid",
  "return_type": "return",
  "reason": "Product damaged",
  "additional_details": "Box was crushed during delivery",
  "bank_account_holder_name": "Amit Verma",
  "bank_account_number": "1234567890",
  "bank_ifsc_code": "SBIN0001234",
  "bank_name": "State Bank of India",
  "items": [
    { "order_item_id": "uuid", "quantity": 1, "reason": "Damaged product" }
  ]
}
```

> `items` is **required** for `return_type: "return"`.
> `items` is **ignored** for `return_type: "cancellation"` (full order is cancelled).

**Response 200:**
```json
{
  "success": true,
  "return_order": {
    "id": "uuid",
    "return_type": "return",
    "status": "pending",
    "refund_amount": "850.00",
    "created_at": "2026-03-29T10:00:00Z"
  },
  "message": "Return request created successfully"
}
```

---

#### `GET /user/:user_id?limit=10&offset=0`

Get a user's return/cancellation history.

**Response 200:**
```json
{
  "success": true,
  "return_requests": [
    {
      "id": "uuid",
      "return_type": "return",
      "status": "approved",
      "refund_amount": "850.00",
      "reason": "Product damaged",
      "created_at": "2026-03-01T10:00:00Z",
      "orders": { "id": "uuid", "payment_method": "prepaid" },
      "users_return_orders_user_idTousers": { "name": "Amit Verma" }
    }
  ]
}
```

---

#### `GET /details/:id`

Get full details of a single return request including items.

**Response 200:**
```json
{
  "success": true,
  "return_request": {
    "id": "uuid",
    "return_type": "return",
    "reason": "Product damaged",
    "status": "pending",
    "refund_amount": "850.00",
    "bank_account_holder_name": "Amit Verma",
    "return_items": [
      {
        "id": "uuid",
        "order_item_id": "uuid",
        "quantity": 1,
        "return_reason": "Damaged product"
      }
    ]
  }
}
```

---

#### `GET /admin/all?limit=50&offset=0&status=pending`

Admin: list all return requests.

| Query Param | Type | Default | Description |
|---|---|---|---|
| `limit` | int | 50 | Page size |
| `offset` | int | 0 | Skip N rows |
| `status` | string | — | Filter: `pending` \| `approved` \| `rejected` \| `processing` \| `completed` |

---

#### `PUT /admin/status/:id`

Admin: update return request status.

**Request:**
```json
{
  "status": "approved",
  "admin_notes": "Return approved. Please arrange pickup.",
  "admin_id": "uuid"
}
```

**Response 200:**
```json
{
  "success": true,
  "return_request": { "id": "uuid", "status": "approved", "admin_notes": "..." },
  "message": "Return request updated successfully",
  "notification_sent": true
}
```

Side effects:
- `processed_at` is set when `status === "completed"`
- `admin_id` is recorded
- Notification is sent to user

---

#### `DELETE /admin/delete/:id`

Admin: hard-delete a return request (cascades to `return_order_items`).

**Response 200:**
```json
{ "success": true, "message": "Return request deleted successfully" }
```

---

### 5.2 Refund Endpoints — `/api/refund`

All routes require `Authorization: Bearer <token>`.

---

#### `POST /create` — Authenticated User

Create a standalone refund request for a cancelled prepaid order.

**Request:**
```json
{
  "orderId": "uuid",
  "refundType": "order_cancellation",
  "bankDetails": {
    "accountHolderName": "Amit Verma",
    "accountNumber": "1234567890",
    "ifscCode": "SBIN0001234",
    "bankName": "State Bank of India"
  }
}
```

**Pre-conditions:**
- `order.status === "cancelled"`
- `order.payment_method` is not COD
- No existing `refund_requests` row for this `order_id`
- `req.user.id === order.user_id`

**Response 200:**
```json
{
  "success": true,
  "message": "Refund request created successfully",
  "refundRequest": {
    "id": "uuid",
    "orderId": "uuid",
    "amount": 1500.00,
    "status": "pending",
    "refundMode": "bank_transfer"
  }
}
```

---

#### `GET /my-requests?page=1&limit=10` — Authenticated User

**Response 200:**
```json
{
  "success": true,
  "refundRequests": [ ... ],
  "total": 3,
  "page": 1,
  "limit": 10,
  "totalPages": 1
}
```

---

#### `GET /admin/all?page=1&limit=20&status=pending&refundType=order_cancellation` — Admin

| Query Param | Values |
|---|---|
| `status` | `pending` \| `approved` \| `processing` \| `completed` \| `rejected` |
| `refundType` | `order_cancellation` \| `order_return` \| `partial_refund` |

**Response 200:**
```json
{
  "success": true,
  "refundRequests": [
    {
      "id": "uuid",
      "refund_amount": "1500.00",
      "refund_type": "order_cancellation",
      "status": "pending",
      "created_at": "2026-03-29T10:00:00Z",
      "orders": { "id": "uuid", "total": "1500.00" },
      "users_refund_requests_user_idTousers": { "name": "Amit Verma", "email": "amit@example.com", "phone": "+91..." }
    }
  ],
  "total": 12,
  "page": 1,
  "limit": 20,
  "totalPages": 1
}
```

---

#### `PUT /admin/update-status/:id` — Admin

**Request:**
```json
{
  "status": "processing",
  "adminNotes": "Bank transfer initiated. UTR: HDFC123456"
}
```

Side effects:
- `processed_at` is set when status becomes `processing` or `completed`
- `processed_by` is set to `req.user.id`
- Notification sent to user

**Response 200:**
```json
{ "success": true, "message": "Refund request processing successfully" }
```

---

## 6. Notification System

### 6.1 Architecture

```
Controller
    │
    └─→ services/notificationService.js
              │
              └─→ publishEvent(eventType, payload)
                        │
                        ├── TODAY:  prisma.user_notifications.create(...)
                        │
                        └── FUTURE: channel.publish(QUEUE, payload)
                                    ↓
                                   Consumer Worker
                                    ↓
                                   DB write + push/email/SMS
```

The **single swap point** is the `publishEvent()` function body — nothing else in the system changes for RabbitMQ.

---

### 6.2 Exported Functions

| Function | Called By | Notification Target |
|---|---|---|
| `notifyReturnCreated` | `createReturnRequest` | User — "Request received" |
| `notifyReturnStatusUpdated` | `updateReturnRequestStatus` | User — status change |
| `notifyRefundCreated` | `createRefundRequest` | User — "Refund submitted" |
| `notifyRefundStatusUpdated` | `updateRefundRequestStatus` | User — refund status change |

---

### 6.3 Notification Messages by Status

| Event / Status | Title | Message |
|---|---|---|
| `return_created` | "Return Request Received" | "Your return request has been submitted and is pending review." |
| `cancellation_created` | "Cancellation Request Received" | "Your cancellation request has been submitted and is pending review." |
| `approved` | "[Type] Request Approved" | "…approved. Refund processing will begin shortly." |
| `rejected` | "[Type] Request Rejected" | "…declined. Please contact support for more details." |
| `processing` | "[Type] Processing" | "…being processed. Refund will be credited to your account soon." |
| `completed` | "[Type] Completed" | "…completed. Refund amount has been credited to your bank account." |

---

### 6.4 `user_notifications` Record Structure

```json
{
  "user_id": "uuid",
  "type": "return_status_updated",
  "title": "Return Request Approved",
  "message": "Your return request has been approved. Refund processing will begin shortly.",
  "related_id": "<return_order.id>",
  "related_type": "return_order",
  "is_read": false
}
```

`related_type` values: `"return_order"` | `"refund_request"`

---

### 6.5 Failure Handling

Notification failures are **caught and logged** but never propagate to the parent request. A failed notification does not roll back the DB operation.

```javascript
// Inside publishEvent():
try {
  await prisma.user_notifications.create({ ... });
} catch (err) {
  console.error("[NotificationService] Failed to persist notification:", err.message);
  // request continues normally
}
```

---

## 7. Frontend — User Flow

**Component:** `frontend-deployed/src/components/profile/ReturnRefundSection.jsx`

### 7.1 Tab Structure

```
┌──────────────────┬──────────────────────────┐
│   New Request    │   My Requests (N)        │
└──────────────────┴──────────────────────────┘
```

**New Request** — 4-step stepper for creating a return/cancellation
**My Requests** — Combined history of all returns and refunds

---

### 7.2 4-Step Stepper

```
Step 1           Step 2              Step 3          Step 4
Select Order  →  Request Details  →  Bank Details  →  Confirm & Submit
```

Each step validates before advancing. Back navigation is available at every step.

---

### 7.3 Step 1 — Select Order

- Fetches `GET /api/order/my-orders` (with auth token)
- Shows: Order ID (truncated), date, total amount, status badge
- Clicking triggers eligibility check — `GET /api/return-orders/eligibility/:id`
- Loading spinner shown during check
- On success: advances to Step 2 with eligibility data pre-loaded
- On failure: shows error toast, stays on Step 1

---

### 7.4 Step 2 — Request Details

**For Returns (order is delivered):**

- Item list fetched from `GET /api/order/:orderId`
- Per-item card showing:
  - Product name + variant
  - Unit price + ordered quantity
  - Eligibility indicator:
    - Green: eligible, shows remaining days (e.g. "4 days left to return")
    - Red + disabled: expired window or already returned
- Selected items show quantity input (1 → ordered qty) and optional per-item reason
- Live refund preview: `Σ (price × selected_quantity)`
- General reason dropdown (required)
- Additional details textarea (optional)

**For Cancellations (order is pre-delivery):**

- No item selection
- Refund summary card showing full `order.total`
- General reason dropdown (required)
- Additional details textarea (optional)

---

### 7.5 Step 3 — Bank Details

| Field | Validation |
|---|---|
| Account Holder Name | Required, text |
| Bank Name | Required, text |
| Account Number | Required, text |
| IFSC Code | Required, auto-uppercased |

All four must be filled to proceed.

---

### 7.6 Step 4 — Review & Confirm

Summary table showing:

| Field | Display |
|---|---|
| Request Type | Colour-coded badge (Return / Cancellation) |
| Order ID | Short hex |
| Reason | As entered |
| Items Selected | Count (returns only) |
| Estimated Refund | Green, formatted ₹ |
| Account Number | Masked: `****1234` |
| IFSC | Plain |

Submit calls `POST /api/return-orders/create`.
On success: toast notification, redirect to My Requests tab.
On error: toast notification, stays on Step 4.

---

### 7.7 My Requests Tab

Fetches in parallel:
- `GET /api/return-orders/user/:userId`
- `GET /api/refund/my-requests` (with auth)

Merged and sorted by `created_at` descending.

Each row (expandable accordion):
- Icon: return (purple), cancellation (orange), standalone refund (blue)
- Request type label + short ID
- Order ID
- Status badge
- Refund amount

Expanded section shows:
- Reason + additional details
- Bank account (masked)
- Submission date + processing date (if set)
- Admin notes (blue callout)
- Status timeline: `pending → approved → processing → completed` with rejected branch

---

### 7.8 API Calls by Frontend

| Action | Method | Endpoint | Auth |
|---|---|---|---|
| Load orders | GET | `/api/order/my-orders` | Yes |
| Check eligibility | GET | `/api/return-orders/eligibility/:orderId` | No |
| Load order items | GET | `/api/order/:orderId` | Yes |
| Submit request | POST | `/api/return-orders/create` | No (user_id in body) |
| Load return history | GET | `/api/return-orders/user/:userId` | No |
| Load refund history | GET | `/api/refund/my-requests` | Yes |

---

## 8. Admin Panel

**Component:** `admin-deployed/src/Pages/ReturnRefund/index.jsx`
**Route:** `/return-orders`
**API client:** `utils/api.js` (axios with JWT interceptor from localStorage)

### 8.1 Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  Returns & Refunds                               [Refresh]       │
├──────────┬──────────┬────────────┬────────────┬──────────────────┤
│ Pending  │ Approved │ Processing │ Completed  │  Total Refunds ₹ │
├──────────┴──────────┴────────────┴────────────┴──────────────────┤
│  [Search…]         [Status ▾]    [Type ▾ refunds only]           │
├──────────────────────────────────────────────────────────────────┤
│  [Returns & Cancellations (N)]   [Refund Requests (N)]           │
├──────────────────────────────────────────────────────────────────┤
│  Row 1  ▼                                                        │
│  Row 2  ▼                                                        │
│  ...                                                             │
└──────────────────────────────────────────────────────────────────┘
```

---

### 8.2 Stats Cards

Computed client-side from the full fetched dataset (both tables combined):

| Card | Formula |
|---|---|
| Pending | count where `status === "pending"` |
| Approved | count where `status === "approved"` |
| Processing | count where `status === "processing"` |
| Completed | count where `status === "completed"` |
| Total Refunds | `Σ refund_amount` where status in `{approved, processing, completed}` |

---

### 8.3 Quick Action Buttons

Inline per row, derived from current status:

| Current Status | Quick Actions Shown |
|---|---|
| `pending` | **Approve**, **Reject** |
| `approved` | **Process**, **Reject** |
| `processing` | **Complete** |
| `completed` / `rejected` | None |

Quick actions call the API directly without opening a modal.

---

### 8.4 Edit / Update Modal

Opened via the **Edit** button on return rows or **Update** button on refund rows.

Fields:
- Status dropdown (all 5 statuses)
- Admin notes textarea
- Bank details reminder (read-only, for reference during bank transfer)

Endpoint called:
- Returns: `PUT /return-orders/admin/status/:id` with `{ status, admin_notes }`
- Refunds: `PUT /refund/admin/update-status/:id` with `{ status, adminNotes }`

---

### 8.5 Expanded Row Detail

| Section | Fields |
|---|---|
| Customer | Name, email, phone |
| Reason | Reason + additional details |
| Bank Details | Holder, account number, IFSC, bank name |
| Refund Info (refunds only) | Refund mode, payment method, processed date |
| Admin Note | Blue callout if present |
| Delete (returns only) | Hard-delete with `window.confirm` |

---

### 8.6 Search

Client-side filtering (no new API call) on the already-fetched list:

**Returns tab:** filters on request ID, order ID, customer name, reason
**Refunds tab:** filters on request ID, order ID, customer name

---

### 8.7 Admin API Calls

| Action | Endpoint |
|---|---|
| Initial load | `GET /return-orders/admin/all?limit=100` + `GET /refund/admin/all?limit=100` |
| Filter reload | Same endpoints with `status` / `refundType` params |
| Update return status | `PUT /return-orders/admin/status/:id` |
| Delete return | `DELETE /return-orders/admin/delete/:id` |
| Update refund status | `PUT /refund/admin/update-status/:id` |

---

## 9. Status Lifecycle

### 9.1 Return Orders

```
                   ┌──────────┐
                   │ PENDING  │  ← Set on creation
                   └────┬─────┘
              ┌──────────┴──────────┐
              ▼                     ▼
         ┌──────────┐         ┌──────────┐
         │ APPROVED │         │ REJECTED │  ← Terminal
         └────┬─────┘         └──────────┘
              │
     ┌────────┴────────┐
     ▼                 ▼
┌──────────┐     ┌──────────┐
│PROCESSING│     │ REJECTED │  ← Can reject post-approval
└────┬─────┘     └──────────┘
     ▼
┌──────────┐
│COMPLETED │  ← Terminal, sets processed_at
└──────────┘
```

### 9.2 Refund Requests

```
┌──────────┐
│ PENDING  │
└────┬─────┘
     ├──────────────┐
     ▼              ▼
┌──────────┐  ┌──────────┐
│ APPROVED │  │ REJECTED │  ← Terminal
└────┬─────┘  └──────────┘
     ▼
┌──────────┐
│PROCESSING│  ← sets processed_at
└────┬─────┘
     ▼
┌──────────┐
│COMPLETED │  ← Terminal
└──────────┘
```

### 9.3 Status Semantics

| Status | Meaning | Who Sets It | `processed_at` Set? |
|---|---|---|---|
| `pending` | Submitted, awaiting review | System (creation) | No |
| `approved` | Admin approved | Admin | No |
| `processing` | Bank transfer initiated | Admin | Yes (refund_requests only) |
| `completed` | Transfer confirmed | Admin | Yes (both tables) |
| `rejected` | Request denied | Admin | No |

---

## 10. Error Reference

| HTTP | Condition | Message |
|---|---|---|
| 400 | Missing required fields | `"order_id, user_id, return_type and reason are required"` |
| 400 | COD order | `"COD orders cannot be cancelled or returned as per policy."` |
| 400 | Missing bank details | `"Bank details are required for processing refunds"` |
| 400 | No items selected for return | `"Select at least one item to return"` |
| 400 | Return window expired | `"Return window expired for: <Product Name>"` |
| 400 | Items already returned | `"One or more selected items have already been returned."` |
| 400 | Order not delivered (return attempt) | `"Only delivered orders can be returned"` |
| 400 | Order not in cancellable state | `"Order is not eligible for this request type"` |
| 400 | Refund: order not cancelled | `"Only cancelled orders are eligible for refund"` |
| 400 | Refund: COD order | `"COD orders are not eligible for refunds"` |
| 400 | Duplicate refund request | `"Refund request already exists for this order"` |
| 400 | Invalid status value | `"Invalid status"` |
| 403 | User does not own order | `"Unauthorized to create refund for this order"` |
| 404 | Order not found / wrong user | `"Order not found or doesn't belong to user"` |
| 404 | Return request not found | `"Return order not found"` |
| 404 | Refund request not found | `"Refund request not found"` |
| 500 | Unhandled exception | `"Internal server error"` or `error.message` |

---

## 11. RabbitMQ Migration Guide

When the message broker is ready, **only one function body** needs to change.

**File:** `backend-deployed/services/notificationService.js`
**Function:** `publishEvent(eventType, payload)`

### Current (direct DB write)

```javascript
async function publishEvent(eventType, payload) {
  try {
    await prisma.user_notifications.create({
      data: {
        user_id: payload.user_id || null,
        type: eventType,
        title: payload.title,
        message: payload.message,
        related_id: payload.related_id || null,
        related_type: payload.related_type || null,
        is_read: false,
      },
    });
  } catch (err) {
    console.error("[NotificationService] Failed to persist notification:", err.message);
  }
}
```

### After (RabbitMQ publish)

```javascript
import amqp from "amqplib";

const QUEUE = "notifications";
let _channel = null;

async function getChannel() {
  if (!_channel) {
    const conn = await amqp.connect(process.env.RABBITMQ_URL);
    _channel = await conn.createChannel();
    await _channel.assertQueue(QUEUE, { durable: true });
  }
  return _channel;
}

async function publishEvent(eventType, payload) {
  try {
    const ch = await getChannel();
    ch.sendToQueue(
      QUEUE,
      Buffer.from(JSON.stringify({ event: eventType, ...payload })),
      { persistent: true }
    );
  } catch (err) {
    console.error("[NotificationService] RabbitMQ publish failed:", err.message);
    // Optional: fallback to direct DB write here
  }
}
```

Everything else in the file — all exported `notify*` functions and all controller call sites — **stays completely unchanged**.

### Consumer Worker (create when ready)

```javascript
// workers/notificationConsumer.js
import amqp from "amqplib";
import prisma from "../config/prisma.js";

const conn = await amqp.connect(process.env.RABBITMQ_URL);
const channel = await conn.createChannel();
await channel.assertQueue("notifications", { durable: true });
channel.prefetch(10);

channel.consume("notifications", async (msg) => {
  const { event, user_id, title, message, related_id, related_type } = JSON.parse(msg.content.toString());
  await prisma.user_notifications.create({
    data: { user_id, type: event, title, message, related_id, related_type, is_read: false }
  });
  // Future: trigger push notification, email, SMS here
  channel.ack(msg);
});
```

---

## 12. Future Enhancements

| Feature | Notes |
|---|---|
| **Razorpay automatic refund** | `razorpay_refund_id` field already exists in `refund_requests`. When admin marks `processing`, call Razorpay Refund API and store the returned ID. |
| **Inventory restoration** | When a return reaches `completed`, re-add stock quantities to the relevant `inventory` records. |
| **Return pickup scheduling** | Add `pickup_date`, `pickup_slot`, `pickup_address` fields to `return_orders`. |
| **Email / SMS notifications** | Add handlers in the RabbitMQ consumer worker — no controller changes needed. |
| **Return tracking** | Add `return_tracking_number`, `courier_partner` fields to `return_orders`. |
| **Partial refund adjustment** | Items model already supports it via `return_order_items`. Admin UI needs an amount override field. |
| **Analytics dashboard** | `refundRequest.dao.js` already has a `countByStatus()` method returning grouped counts + sums. |
| **Automated refund timers** | Cron job to auto-complete refunds after N days if bank transfer confirmed externally. |

---

*For questions, contact the backend team or refer to `backend-deployed/README.md`.*
