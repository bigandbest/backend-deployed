# Return & Refund — Mobile App Integration Guide

> **Base URL:** `https://api.amitdev.tech/api`
> **Auth:** All user endpoints require `Authorization: Bearer <access_token>` header
> **Content-Type:** `application/json`

---

## Table of Contents

1. [Overview & Architecture](#1-overview--architecture)
2. [Business Rules](#2-business-rules)
3. [Refund Amount Formula](#3-refund-amount-formula)
4. [Complete Flow — Step by Step](#4-complete-flow--step-by-step)
5. [API Reference](#5-api-reference)
6. [Error Reference](#6-error-reference)
7. [Status Lifecycle](#7-status-lifecycle)
8. [Notification Events](#8-notification-events)
9. [Mobile UI Screens — What to Show When](#9-mobile-ui-screens--what-to-show-when)
10. [Sample Integration Code (Dart / Flutter)](#10-sample-integration-code-dart--flutter)

---

## 1. Overview & Architecture

There are **two separate systems** that mobile must integrate:

| System | Table | Purpose | When to Use |
|--------|-------|---------|-------------|
| **Return Orders** | `return_orders` | Cancellations (pre-delivery) + Returns (post-delivery) | User wants to cancel an active order OR return a delivered item |
| **Refund Requests** | `refund_requests` | Standalone refund for already-cancelled orders | Order was cancelled externally (by system/admin) and user has not yet requested a refund |

**In practice, mobile app primarily uses the Return Orders system** (POST `/return-orders/create`), which handles both cancellations and returns in one flow. The Refund Requests endpoint is a secondary path for edge cases.

---

## 2. Business Rules

| Rule | Details |
|------|---------|
| **COD orders** | Cannot be cancelled, returned, or refunded. Block at UI level. |
| **Cancellations** | Only for orders in status: `pending`, `confirmed`, `processing`, `shipped` |
| **Returns** | Only for `delivered` orders within the per-product return window (default 7 days) |
| **Double request** | One active (non-rejected) request per order. Show status instead of form. |
| **Refund mode** | User chooses: `wallet` (2–3 hours) or `bank_transfer` (3–4 business days) |
| **Bank details** | Required only when `refund_mode = "bank_transfer"` |
| **Charges excluded** | Shipping, handling, surge, platform charges are NEVER refunded |
| **Deduction** | Admin configures a `refund_percentage` (0–100). Applied as deduction on product subtotal |

---

## 3. Refund Amount Formula

```
refund_percentage  = fetched from GET /charge-settings → data.refund_percentage
product_subtotal   = order.subtotal  (for cancellations)
                   = Σ(item.price × return_quantity)  (for returns)

refund_amount = product_subtotal × (1 - refund_percentage / 100)
```

**Examples** (assuming 10% deduction):

| Scenario | Product Subtotal | Deduction (10%) | User Receives |
|----------|-----------------|-----------------|---------------|
| Cancel ₹500 order | ₹500 | ₹50 | ₹450 |
| Return 2 items @₹200 | ₹400 | ₹40 | ₹360 |
| 0% deduction | ₹500 | ₹0 | ₹500 |

> The `refund_percentage` should be fetched once on app launch / return screen open and cached for the session.

---

## 4. Complete Flow — Step by Step

### Flow A: Cancel Order (pre-delivery)

```
1. User opens order → order status is pending/confirmed/processing/shipped
2. Show "Cancel Order" button (hide if COD or request already exists)
3. App calls GET /return-orders/eligibility/:order_id
   → Verify eligibility.can_cancel === true
4. Fetch GET /charge-settings → get refund_percentage
5. Calculate and display refund preview:
   - Product subtotal: order.subtotal
   - Deduction: subtotal × (refund_percentage/100)
   - You receive: subtotal × (1 - refund_percentage/100)
   - Note: "Shipping & other charges not refunded"
6. User selects reason
7. User selects refund mode:
   - Wallet → credit in 2–3 hours (no bank details needed)
   - Bank Transfer → 3–4 business days (collect bank details)
8. App calls POST /return-orders/create
9. On success: refresh order list, show confirmation screen
   - Order status changes to "cancelled" immediately
```

### Flow B: Return Items (post-delivery)

```
1. User opens delivered order
2. Show "Return Order" button only if:
   - order.status === "delivered"
   - payment_method is NOT COD
   - No active return request exists for this order
3. App calls GET /return-orders/eligibility/:order_id
   → Check eligibility.can_return === true
   → Check item_eligibility[item.id].is_eligible for each item
   → Show remaining_days per item
4. Fetch GET /charge-settings → get refund_percentage
5. User selects eligible items + quantities
6. Calculate and display refund preview (sum of selected items)
7. User selects reason
8. User selects refund mode (wallet / bank transfer)
9. If bank_transfer: collect bank details
10. Show final confirmation with:
    - Selected items list
    - Product subtotal
    - Deduction amount (if refund_percentage > 0)
    - Final refund amount
    - Refund method & timeline
11. App calls POST /return-orders/create
12. On success: show confirmation, navigate to My Requests screen
```

### Flow C: Check Existing Request Status

```
1. On orders list: call GET /return-orders/user/:user_id once
2. Build a map: { order_id → request }
3. For each order card:
   - If request exists and status !== "rejected":
     → Show status badge instead of action button
     → "Cancellation Requested", "Return Requested", "Approved", "Processing", "Completed (Refunded)", "Rejected"
   - If no request (or rejected):
     → Show appropriate action button
```

### Flow D: Standalone Refund (cancelled order, no return request)

```
1. Order status is "cancelled" AND no refund_request exists
2. Show "Request Refund" button
3. Collect bank details (this endpoint only supports bank_transfer)
4. Call POST /refund/create with Bearer token
5. Track via GET /refund/my-requests
```

---

## 5. API Reference

---

### 5.1 Get Charge Settings (Refund Policy)

Fetch refund deduction % before showing any refund preview.

```
GET /charge-settings
Authorization: not required
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "handling_charge": "10",
    "surge_charge": "0",
    "platform_charge": "5",
    "discount_charge": "0",
    "refund_percentage": "10",
    "delivery_charge": 30
  }
}
```

> Cache this value per session. `refund_percentage` is the deduction % applied to product subtotal.

---

### 5.2 Check Return / Cancellation Eligibility

Always call this before showing the return/cancel form.

```
GET /return-orders/eligibility/:order_id
Authorization: not required (public check)
```

**Response — Cancellable order:**
```json
{
  "success": true,
  "order_status": "confirmed",
  "eligibility": {
    "can_return": false,
    "can_cancel": true,
    "reason": "Order can be cancelled as it hasn't been delivered yet.",
    "days_since_delivery": 0,
    "item_eligibility": {}
  },
  "returned_item_ids": []
}
```

**Response — Returnable delivered order:**
```json
{
  "success": true,
  "order_status": "delivered",
  "eligibility": {
    "can_return": true,
    "can_cancel": false,
    "reason": "",
    "days_since_delivery": 2,
    "item_eligibility": {
      "item-uuid-1": {
        "is_eligible": true,
        "reason": "Eligible (7-day window)",
        "return_days": 7,
        "remaining_days": 5
      },
      "item-uuid-2": {
        "is_eligible": false,
        "reason": "Return window expired (7 days)",
        "return_days": 7,
        "remaining_days": 0
      }
    }
  },
  "returned_item_ids": []
}
```

**Response — COD order:**
```json
{
  "success": true,
  "order_status": "delivered",
  "eligibility": {
    "can_return": false,
    "can_cancel": false,
    "reason": "COD orders cannot be cancelled or returned as per policy.",
    "item_eligibility": {
      "item-uuid-1": {
        "is_eligible": false,
        "reason": "COD orders are non-returnable",
        "return_days": 0,
        "remaining_days": 0
      }
    }
  }
}
```

---

### 5.3 Create Return / Cancellation Request

```
POST /return-orders/create
Authorization: not required (user_id passed in body)
Content-Type: application/json
```

#### Body — Cancel order (wallet refund)
```json
{
  "order_id": "uuid",
  "user_id": "uuid",
  "return_type": "cancellation",
  "reason": "Changed my mind",
  "additional_details": "Optional extra info",
  "refund_mode": "wallet"
}
```

#### Body — Cancel order (bank transfer)
```json
{
  "order_id": "uuid",
  "user_id": "uuid",
  "return_type": "cancellation",
  "reason": "Changed my mind",
  "refund_mode": "bank_transfer",
  "bank_account_holder_name": "Rahul Sharma",
  "bank_account_number": "1234567890",
  "bank_ifsc_code": "SBIN0001234",
  "bank_name": "State Bank of India"
}
```

#### Body — Return items (wallet refund)
```json
{
  "order_id": "uuid",
  "user_id": "uuid",
  "return_type": "return",
  "reason": "Product is defective/damaged",
  "additional_details": "Screen has a crack",
  "refund_mode": "wallet",
  "items": [
    {
      "order_item_id": "item-uuid-1",
      "quantity": 1,
      "reason": "Product is defective/damaged"
    },
    {
      "order_item_id": "item-uuid-2",
      "quantity": 2,
      "reason": "Wrong item delivered"
    }
  ]
}
```

#### Body — Return items (bank transfer)
```json
{
  "order_id": "uuid",
  "user_id": "uuid",
  "return_type": "return",
  "reason": "Product is defective/damaged",
  "refund_mode": "bank_transfer",
  "bank_account_holder_name": "Rahul Sharma",
  "bank_account_number": "1234567890",
  "bank_ifsc_code": "SBIN0001234",
  "bank_name": "State Bank of India",
  "items": [
    {
      "order_item_id": "item-uuid-1",
      "quantity": 1,
      "reason": "Product is defective/damaged"
    }
  ]
}
```

**Response (success):**
```json
{
  "success": true,
  "message": "Return request created successfully",
  "return_order": {
    "id": "return-uuid",
    "order_id": "uuid",
    "user_id": "uuid",
    "return_type": "return",
    "reason": "Product is defective/damaged",
    "refund_mode": "wallet",
    "refund_amount": "360.00",
    "status": "pending",
    "created_at": "2026-03-30T10:00:00.000Z"
  }
}
```

---

### 5.4 Get User's Return Requests

```
GET /return-orders/user/:user_id?limit=10&offset=0
Authorization: not required
```

**Response:**
```json
{
  "success": true,
  "return_requests": [
    {
      "id": "return-uuid",
      "order_id": "order-uuid",
      "return_type": "cancellation",
      "reason": "Changed my mind",
      "refund_mode": "wallet",
      "refund_amount": "450.00",
      "status": "pending",
      "admin_notes": null,
      "created_at": "2026-03-30T10:00:00.000Z",
      "updated_at": "2026-03-30T10:00:00.000Z",
      "orders": {
        "id": "order-uuid",
        "payment_method": "prepaid"
      }
    }
  ]
}
```

> Use `offset` for pagination. E.g., page 2 with limit 10 → `offset=10`.

---

### 5.5 Get Return Request Details

```
GET /return-orders/details/:return_id
Authorization: not required
```

**Response:**
```json
{
  "success": true,
  "return_request": {
    "id": "return-uuid",
    "order_id": "order-uuid",
    "user_id": "user-uuid",
    "return_type": "return",
    "reason": "Product is defective/damaged",
    "additional_details": "Screen has a crack",
    "refund_mode": "bank_transfer",
    "bank_account_holder_name": "Rahul Sharma",
    "bank_account_number": "1234567890",
    "bank_ifsc_code": "SBIN0001234",
    "bank_name": "State Bank of India",
    "refund_amount": "360.00",
    "status": "approved",
    "admin_notes": "Approved. Bank transfer initiated.",
    "processed_at": null,
    "created_at": "2026-03-29T14:00:00.000Z",
    "return_items": [
      {
        "id": "item-uuid",
        "order_item_id": "order-item-uuid",
        "quantity": 1,
        "return_reason": "Product is defective/damaged",
        "order_items": {
          "id": "order-item-uuid",
          "price": "400.00",
          "quantity": 1,
          "products": {
            "id": "product-uuid",
            "name": "Product Name"
          }
        }
      }
    ]
  }
}
```

---

### 5.6 Get User's Refund Requests (standalone)

For orders cancelled externally that need a separate refund request.

```
GET /refund/my-requests?page=1&limit=10
Authorization: Bearer <access_token>   ← REQUIRED
```

**Response:**
```json
{
  "success": true,
  "refundRequests": [
    {
      "id": "refund-uuid",
      "order_id": "order-uuid",
      "refund_amount": "450.00",
      "refund_type": "order_cancellation",
      "refund_mode": "bank_transfer",
      "status": "pending",
      "admin_notes": null,
      "created_at": "2026-03-29T12:00:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 10,
  "totalPages": 1
}
```

---

### 5.7 Create Standalone Refund Request

Only for orders that are already `cancelled` and have no existing refund request.

```
POST /refund/create
Authorization: Bearer <access_token>   ← REQUIRED
Content-Type: application/json
```

**Body:**
```json
{
  "orderId": "order-uuid",
  "refundType": "order_cancellation",
  "bankDetails": {
    "accountHolderName": "Rahul Sharma",
    "accountNumber": "1234567890",
    "ifscCode": "SBIN0001234",
    "bankName": "State Bank of India"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Refund request created successfully",
  "refundRequest": {
    "id": "refund-uuid",
    "orderId": "order-uuid",
    "amount": 450.00,
    "status": "pending",
    "refundMode": "bank_transfer"
  }
}
```

---

## 6. Error Reference

| HTTP | Error Message | Cause | Mobile Action |
|------|--------------|-------|---------------|
| 400 | `order_id, user_id, return_type and reason are required` | Missing required fields | Validate form before submit |
| 400 | `COD orders cannot be cancelled or returned as per policy.` | COD payment method | Hide buttons for COD orders |
| 400 | `Bank details are required for bank transfer refunds` | Bank mode selected but fields empty | Validate bank form |
| 400 | `Only delivered orders can be returned` | Trying return on non-delivered | Check eligibility first |
| 400 | `Select at least one item to return` | No items in items array | Validate item selection |
| 400 | `Return window expired for: <product name>` | Item past return window | Show per-item eligibility |
| 400 | `One or more selected items have already been returned.` | Item in existing return | Refresh eligibility |
| 400 | `Order is not eligible for this request type` | Wrong return_type for order state | Check eligibility first |
| 400 | `Only cancelled orders are eligible for refund` | Order not cancelled yet | Check order status |
| 400 | `Refund request already exists for this order` | Duplicate standalone refund | Show existing request |
| 404 | `Order not found or doesn't belong to user` | Wrong order_id or user_id | Re-authenticate |
| 500 | `Internal server error` | Backend issue | Show generic error, retry |

---

## 7. Status Lifecycle

### Return / Cancellation Request (`return_orders.status`)

```
                    ┌──────────┐
                    │  PENDING │  ← Created on submit
                    └────┬─────┘
           ┌─────────────┼────────────┐
           ▼             ▼            ▼
      ┌──────────┐  ┌──────────┐  ┌──────────┐
      │ APPROVED │  │ REJECTED │  │          │
      └────┬─────┘  └──────────┘  └──────────┘
           │
           ▼
    ┌────────────┐
    │ PROCESSING │  ← Admin initiating transfer
    └─────┬──────┘
          │
          ▼
    ┌───────────┐
    │ COMPLETED │  ← Refund sent
    └───────────┘
```

### Status → User-Facing Label

| Status | Display Label | Color | Icon |
|--------|--------------|-------|------|
| `pending` | Under Review | Amber | 🕐 |
| `approved` | Approved | Blue | ✓ |
| `processing` | Refund Processing | Purple | ⟳ |
| `completed` | Refunded | Green | ✓✓ |
| `rejected` | Declined | Red | ✗ |

### Status → Refund Timeline Message

| Status | `refund_mode: wallet` | `refund_mode: bank_transfer` |
|--------|----------------------|------------------------------|
| `approved` | "Wallet credit in 2–3 hours" | "Bank transfer in 3–4 business days" |
| `processing` | "Being credited to your wallet" | "Bank transfer in progress" |
| `completed` | "Credited to your wallet" | "Amount credited to your bank account" |
| `rejected` | "Request declined. Contact support." | "Request declined. Contact support." |

---

## 8. Notification Events

These push notifications are sent via the notification system. Mobile should map these to local push messages.

| Event Type | Title | When Triggered |
|-----------|-------|----------------|
| `return_created` | "Return Request Received" | On successful POST /return-orders/create |
| `return_status_updated` | "Return Request Approved/Rejected/Completed…" | When admin updates status |
| `refund_created` | "Refund Request Submitted" | On successful POST /refund/create |
| `refund_status_updated` | "Refund Approved/Processing/Completed…" | When admin updates refund status |

### Fetch user notifications:
```
GET /notifications/user/:user_id
Authorization: Bearer <access_token>
```

---

## 9. Mobile UI Screens — What to Show When

### Order Card Actions

```
Order Status      | COD? | Existing Request? | Show
------------------|------|-------------------|----------------------------------------------
pending/confirmed | No   | No                | "Cancel Order" button
pending/confirmed | No   | Yes (pending)     | Grey badge: "Cancellation Requested"
pending/confirmed | No   | Yes (approved)    | Grey badge: "Refund Initiated"
pending/confirmed | No   | Yes (completed)   | Green badge: "Refunded"
pending/confirmed | Yes  | -                 | Nothing (COD — no actions)
delivered         | No   | No                | "Return Order" button
delivered         | No   | Yes (pending)     | Amber badge: "Return Requested"
delivered         | No   | Yes (approved)    | Blue badge: "Approved"
delivered         | No   | Yes (processing)  | Purple badge: "Refund Processing"
delivered         | No   | Yes (completed)   | Green badge: "Refunded"
delivered         | No   | Yes (rejected)    | Red badge: "Rejected" + show "Return Order" again
delivered         | Yes  | -                 | Nothing
cancelled         | No   | No refund req     | "Request Refund" button (standalone flow)
cancelled         | No   | Yes               | Show refund request status badge
```

### Return/Cancel Modal — 3 Steps

```
Step 1: Select & Reason
  ├── [If refund_percentage > 0]: Show deduction disclaimer
  │     Product: ₹X
  │     Deduction (N%): −₹Y
  │     You receive: ₹Z
  │     "Shipping & charges not refunded"
  ├── [For return]: Item list with checkboxes
  │     ✓ Eligible items (with remaining days)
  │     ✗ Ineligible items (greyed, show reason)
  └── Reason dropdown + optional notes

Step 2: Choose Refund Method
  ├── Show refund summary (product subtotal → deduction → final amount)
  ├── [Wallet] — 2–3 hours
  └── [Bank Transfer] — 3–4 business days

Step 3: Bank Details (only if bank transfer selected)
  ├── Account Holder Name *
  ├── Bank Name *
  ├── Account Number *
  ├── IFSC Code *
  └── Confirm button with final amount reminder
```

### My Requests Screen

```
Request Card fields:
  - Request type icon (return / cancellation / refund)
  - Order ID (first 8 chars, uppercase)
  - Date submitted
  - Refund amount
  - Status badge
  - Refund mode (Wallet / Bank Transfer)
  - [Expandable] Reason, items, bank details, admin note, status timeline
```

---

## 10. Sample Integration Code (Dart / Flutter)

### Service Class

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;

class ReturnRefundService {
  static const String baseUrl = 'https://api.amitdev.tech/api';

  // ─── Fetch refund deduction percentage ───────────────────────────────────
  Future<double> getRefundPercentage() async {
    final res = await http.get(Uri.parse('$baseUrl/charge-settings'));
    final data = jsonDecode(res.body);
    if (data['success'] == true) {
      return double.tryParse(data['data']['refund_percentage'].toString()) ?? 0.0;
    }
    return 0.0;
  }

  // ─── Check eligibility ───────────────────────────────────────────────────
  Future<Map<String, dynamic>> checkEligibility(String orderId) async {
    final res = await http.get(
      Uri.parse('$baseUrl/return-orders/eligibility/$orderId'),
    );
    return jsonDecode(res.body);
  }

  // ─── Create return / cancellation request ────────────────────────────────
  Future<Map<String, dynamic>> createReturnRequest({
    required String orderId,
    required String userId,
    required String returnType,     // "cancellation" | "return"
    required String reason,
    required String refundMode,     // "wallet" | "bank_transfer"
    String? additionalDetails,
    List<Map<String, dynamic>>? items,
    // Bank details — required only if refundMode == "bank_transfer"
    String? bankAccountHolderName,
    String? bankAccountNumber,
    String? bankIfscCode,
    String? bankName,
  }) async {
    final body = <String, dynamic>{
      'order_id': orderId,
      'user_id': userId,
      'return_type': returnType,
      'reason': reason,
      'refund_mode': refundMode,
      if (additionalDetails != null) 'additional_details': additionalDetails,
      if (items != null && items.isNotEmpty) 'items': items,
      if (refundMode == 'bank_transfer') ...{
        'bank_account_holder_name': bankAccountHolderName,
        'bank_account_number': bankAccountNumber,
        'bank_ifsc_code': bankIfscCode,
        'bank_name': bankName,
      },
    };

    final res = await http.post(
      Uri.parse('$baseUrl/return-orders/create'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(body),
    );
    return jsonDecode(res.body);
  }

  // ─── Get user's return requests ──────────────────────────────────────────
  Future<Map<String, dynamic>> getUserReturnRequests(
    String userId, {
    int limit = 10,
    int offset = 0,
  }) async {
    final res = await http.get(
      Uri.parse('$baseUrl/return-orders/user/$userId?limit=$limit&offset=$offset'),
    );
    return jsonDecode(res.body);
  }

  // ─── Get return request detail ───────────────────────────────────────────
  Future<Map<String, dynamic>> getReturnRequestDetail(String returnId) async {
    final res = await http.get(
      Uri.parse('$baseUrl/return-orders/details/$returnId'),
    );
    return jsonDecode(res.body);
  }

  // ─── Get user's standalone refund requests ───────────────────────────────
  Future<Map<String, dynamic>> getUserRefundRequests(
    String accessToken, {
    int page = 1,
    int limit = 10,
  }) async {
    final res = await http.get(
      Uri.parse('$baseUrl/refund/my-requests?page=$page&limit=$limit'),
      headers: {'Authorization': 'Bearer $accessToken'},
    );
    return jsonDecode(res.body);
  }

  // ─── Create standalone refund request ────────────────────────────────────
  Future<Map<String, dynamic>> createRefundRequest({
    required String orderId,
    required String accessToken,
    required String accountHolderName,
    required String accountNumber,
    required String ifscCode,
    required String bankName,
  }) async {
    final res = await http.post(
      Uri.parse('$baseUrl/refund/create'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $accessToken',
      },
      body: jsonEncode({
        'orderId': orderId,
        'refundType': 'order_cancellation',
        'bankDetails': {
          'accountHolderName': accountHolderName,
          'accountNumber': accountNumber,
          'ifscCode': ifscCode,
          'bankName': bankName,
        },
      }),
    );
    return jsonDecode(res.body);
  }

  // ─── Calculate refund preview ─────────────────────────────────────────────
  /// Call this before rendering the refund summary screen.
  double calculateRefund({
    required double productSubtotal,
    required double refundPercentage,
  }) {
    return double.parse(
      (productSubtotal * (1 - refundPercentage / 100)).toStringAsFixed(2),
    );
  }

  // ─── Build order→request map ──────────────────────────────────────────────
  /// Returns Map<orderId, request> for quick lookup on the orders list.
  Map<String, dynamic> buildRequestMap(List<dynamic> returnRequests) {
    final map = <String, dynamic>{};
    for (final req in returnRequests) {
      if (req['status'] != 'rejected') {
        map[req['order_id']] = req;
      }
    }
    return map;
  }
}
```

### Usage in Widget

```dart
final service = ReturnRefundService();

// On return screen open:
final eligibility = await service.checkEligibility(order.id);
final refundPct = await service.getRefundPercentage();

// Calculate preview:
final preview = service.calculateRefund(
  productSubtotal: order.subtotal,
  refundPercentage: refundPct,
);

// On submit (wallet):
final result = await service.createReturnRequest(
  orderId: order.id,
  userId: currentUser.id,
  returnType: 'return',
  reason: selectedReason,
  refundMode: 'wallet',
  items: selectedItems.map((item) => {
    'order_item_id': item.id,
    'quantity': item.returnQuantity,
    'reason': selectedReason,
  }).toList(),
);

if (result['success'] == true) {
  // Show success screen
  Navigator.pushReplacementNamed(context, '/my-requests');
} else {
  // Show error
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(content: Text(result['error'] ?? 'Request failed')),
  );
}
```

### Reason Values to Send

```dart
const cancellationReasons = [
  'Changed my mind',
  'Ordered by mistake',
  'Found better price',
  'Shipping is too delayed',
  'Other',
];

const returnReasons = [
  'Product is defective/damaged',
  'Received wrong item',
  'Quality not as expected',
  'Changed my mind',
  'Ordered by mistake',
  'Other',
];
```

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────────────────┐
│  ENDPOINT QUICK REFERENCE                                    │
├─────────────────────────────────────────────────────────────┤
│  GET  /charge-settings                  → refund_percentage  │
│  GET  /return-orders/eligibility/:id    → can_cancel/return  │
│  POST /return-orders/create             → submit request     │
│  GET  /return-orders/user/:user_id      → list user requests │
│  GET  /return-orders/details/:id        → single request     │
│                                                              │
│  GET  /refund/my-requests    (auth)     → standalone refunds │
│  POST /refund/create         (auth)     → standalone refund  │
├─────────────────────────────────────────────────────────────┤
│  REFUND MODES                                                │
│  wallet        → credited in 2–3 hours, no bank details     │
│  bank_transfer → 3–4 business days, bank details required   │
├─────────────────────────────────────────────────────────────┤
│  FORMULA                                                     │
│  refund = subtotal × (1 - refund_percentage / 100)          │
│  shipping / handling / surge / platform = NEVER refunded    │
├─────────────────────────────────────────────────────────────┤
│  COD = no cancel, no return, no refund (block at UI)        │
└─────────────────────────────────────────────────────────────┘
```
