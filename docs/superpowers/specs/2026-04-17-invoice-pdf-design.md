# Invoice PDF Generation — Design Spec
Date: 2026-04-17

## Overview
On-demand GST-compliant tax invoice PDF generation for orders. Users download from the order success screen and orders page. Admins view/download from the dashboard.

## Config File (`config/invoiceConfig.js`)
Static JS file edited directly by admin (one-time setup). Contains:
- `seller`: name, address, gstin, fssai
- `deliveredFrom`: name, address, fssai
- `platform`: name, address, fssai, email

No DB table. Changes apply immediately to all future PDF generations.

## Backend

### New Files
- `config/invoiceConfig.js` — business identity config
- `controller/invoiceController.js` — request handler, input validation, streams PDF
- `services/invoiceService.js` — builds PDF (pdfkit + qrcode), GST computation
- `routes/invoiceRoutes.js` — mounts GET /orders/:id/invoice and GET /orders/batch/invoice (multiple)

### Modified Files
- `server.js` — register invoiceRoutes

### API Endpoints
```
GET  /orders/:id/invoice          — single order invoice (user or admin)
POST /orders/batch/invoice        — multiple orders (admin bulk download as zip)
```

### Auth
- Single: user must own the order OR be admin
- Batch: admin only

### Data Query (Optimized)
Single Prisma query with nested includes:
```
order → order_items → variant → product (hsn_or_sac_code, gst_rate, cess_rate, mrp, name)
       → user (name, phone)
       → address fields
```
No N+1 queries. All data fetched in one round-trip.

### GST Computation (per item)
```
rate         = item.price  (price already includes GST)
taxable      = rate / (1 + gst_rate / 100)
cgst_rate    = sgst_rate = gst_rate / 2
cgst_amt     = taxable * cgst_rate / 100
sgst_amt     = cgst_amt
cess_amt     = taxable * cess_rate / 100
discount_pct = (mrp - rate) / mrp * 100   (shown as %)
total        = taxable + cgst_amt + sgst_amt + cess_amt
```

### QR Code Content
JSON string embedded in QR (immutable order data):
```json
{
  "invoiceNo": "<order.id>",
  "orderNo": "<order.id>",
  "date": "<order.created_at>",
  "sellerGSTIN": "<config.seller.gstin>",
  "buyerName": "<receiver_name>",
  "total": "<order.total>"
}
```
Generated with `qrcode` package as base64 PNG, embedded in PDF.

### Place of Supply
Derived from `order.delivery_pincode` — first 2 digits map to state code.
Fallback: "UTTAR PRADESH (9)" if mapping fails.

### PDF Layout (matches LaTeX template)
1. Header: seller info (left) + QR code (right)
2. Title: TAX INVOICE / BILL OF SUPPLY
3. Meta table: Invoice No, Place of Supply, Order No, Date
4. Address table: Bill To / Ship To
5. Items table: SR, Item, Unit MRP, HSN, Qty, Rate, Disc%, Taxable, CGST%, SGST%, CGST Amt, SGST Amt, Cess%, Cess Amt, Total
6. Totals row + Summary table (Item Total, Round Off, Invoice Value)
7. Notes section
8. Footer: Order Delivered From + Platform FBO info

### New npm Packages
- `pdfkit` — PDF generation, pure JS, ESM-compatible
- `qrcode` — QR code as PNG buffer

### Edge Cases
- Order not found → 404
- Order items with no product/variant → skip item, log warning
- gst_rate = 0 → taxable = price, cgst/sgst = 0 (exempt items)
- Missing hsn_or_sac_code → show "N/A" in table
- Missing mrp → discount shown as "0%"
- Round off = invoice_value - item_total (±0.99 max)
- Batch: max 50 orders per request; returns zip of PDFs named `invoice-<orderId>.pdf`
- Batch: orders not belonging to requester filtered out silently

## Frontend

### Success Screen (`WarehouseAwareCheckout.jsx`)
Add "Download Invoice" button in `renderConfirmation` alongside "View Orders".
Calls `GET /orders/:orderId/invoice`, triggers browser download.

### Orders Page (`src/app/pages/orders/page.jsx`)
Add download icon button per order row. Same endpoint.

### Admin Dashboard (`src/app/pages/admin/dashboard/page.jsx`)
Add View (opens in new tab) and Download buttons per order.
Batch select → "Download Selected Invoices" calls POST /orders/batch/invoice.

## Security
- JWT auth on all invoice endpoints
- User can only download their own orders
- Admin role bypasses ownership check
