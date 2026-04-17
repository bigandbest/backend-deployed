# Invoice PDF Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On-demand GST-compliant tax invoice PDF generation — downloadable from the order success screen, orders page, and admin dashboard.

**Architecture:** A single backend endpoint `GET /api/orders/:id/invoice` fetches order data in one optimized Prisma query, computes GST breakdowns, embeds a QR code, and streams a binary PDF built with pdfkit. A `POST /api/orders/batch/invoice` admin-only endpoint returns a ZIP of multiple PDFs via archiver. Frontend adds download buttons in three surfaces: checkout confirmation, orders page, admin orders table.

**Tech Stack:** pdfkit (PDF generation), qrcode (QR as PNG buffer), archiver (ZIP for batch), authenticateToken + requireAdmin middleware (existing), Prisma (existing)

---

## File Map

### Backend — New Files
| File | Responsibility |
|------|---------------|
| `config/invoiceConfig.js` | Static seller/platform identity — admin edits this file |
| `utils/stateFromPincode.js` | Maps pincode prefix → state name + GST code |
| `services/invoiceService.js` | PDF builder: GST computation, QR generation, pdfkit layout |
| `controller/invoiceController.js` | HTTP handlers: single invoice + batch ZIP |
| `routes/invoiceRoutes.js` | Route definitions, auth middleware applied here |

### Backend — Modified Files
| File | Change |
|------|--------|
| `server.js` | Import and mount invoiceRoutes at `/api/orders` |

### Frontend — Modified Files
| File | Change |
|------|--------|
| `src/utils/invoiceApi.js` | New: download helper (fetch → blob → browser download) |
| `src/components/checkout/WarehouseAwareCheckout.jsx` | Add Download Invoice button in `renderConfirmation` |
| `src/app/pages/orders/page.jsx` | Add download button per order card (tracking + history tabs) |
| `src/components/admin/Orders.jsx` | Add View + Download buttons per row, bulk download |

---

## Task 1: Install backend dependencies

**Files:**
- Modify: `package.json` (via npm install)

- [ ] **Step 1: Install pdfkit, qrcode, archiver**

```bash
cd /Users/amitverma/Downloads/vikas-sir/project/backend-deployed
npm install pdfkit qrcode archiver
```

Expected: `package.json` dependencies now include `pdfkit`, `qrcode`, `archiver`.

- [ ] **Step 2: Verify install**

```bash
node -e "import('pdfkit').then(() => console.log('pdfkit ok')); import('qrcode').then(() => console.log('qrcode ok')); import('archiver').then(() => console.log('archiver ok'))"
```

Expected output: three `ok` lines.

---

## Task 2: Create invoice config file

**Files:**
- Create: `config/invoiceConfig.js`

- [ ] **Step 1: Create config with all seller and platform fields**

```js
// config/invoiceConfig.js
const invoiceConfig = {
  seller: {
    name: "Big and Best Mart Private Limited",
    address: "Your Registered Address, City, State, PIN",
    gstin: "YOUR_GSTIN_HERE",
    fssai: "YOUR_FSSAI_HERE",
  },
  deliveredFrom: {
    name: "Big and Best Mart Private Limited",
    address: "Your Warehouse Address, City, State, PIN",
    fssai: "YOUR_WAREHOUSE_FSSAI_HERE",
  },
  platform: {
    name: "BIG AND BEST MART MARKETPLACE PRIVATE LIMITED",
    address: "Your Platform Address, City, State, PIN",
    fssai: "YOUR_PLATFORM_FSSAI_HERE",
    email: "support@bigandbest.com",
  },
};

export default invoiceConfig;
```

- [ ] **Step 2: Commit**

```bash
git add config/invoiceConfig.js
git commit -m "feat: add invoice config file for seller/platform identity"
```

---

## Task 3: Create pincode → state utility

**Files:**
- Create: `utils/stateFromPincode.js`

- [ ] **Step 1: Write state mapping from pincode prefix**

```js
// utils/stateFromPincode.js
const PINCODE_STATE_MAP = {
  "11": { name: "DELHI", code: "07" },
  "12": { name: "HARYANA", code: "06" },
  "13": { name: "HARYANA", code: "06" },
  "14": { name: "PUNJAB", code: "03" },
  "15": { name: "PUNJAB", code: "03" },
  "16": { name: "PUNJAB", code: "03" },
  "17": { name: "HIMACHAL PRADESH", code: "02" },
  "18": { name: "JAMMU AND KASHMIR", code: "01" },
  "19": { name: "JAMMU AND KASHMIR", code: "01" },
  "20": { name: "UTTAR PRADESH", code: "09" },
  "21": { name: "UTTAR PRADESH", code: "09" },
  "22": { name: "UTTAR PRADESH", code: "09" },
  "23": { name: "UTTAR PRADESH", code: "09" },
  "24": { name: "UTTAR PRADESH", code: "09" },
  "25": { name: "UTTAR PRADESH", code: "09" },
  "26": { name: "UTTAR PRADESH", code: "09" },
  "27": { name: "UTTAR PRADESH", code: "09" },
  "28": { name: "UTTAR PRADESH", code: "09" },
  "30": { name: "RAJASTHAN", code: "08" },
  "31": { name: "RAJASTHAN", code: "08" },
  "32": { name: "RAJASTHAN", code: "08" },
  "33": { name: "RAJASTHAN", code: "08" },
  "34": { name: "RAJASTHAN", code: "08" },
  "36": { name: "GUJARAT", code: "24" },
  "37": { name: "GUJARAT", code: "24" },
  "38": { name: "GUJARAT", code: "24" },
  "39": { name: "GUJARAT", code: "24" },
  "40": { name: "MAHARASHTRA", code: "27" },
  "41": { name: "MAHARASHTRA", code: "27" },
  "42": { name: "MAHARASHTRA", code: "27" },
  "43": { name: "MAHARASHTRA", code: "27" },
  "44": { name: "MAHARASHTRA", code: "27" },
  "45": { name: "MADHYA PRADESH", code: "23" },
  "46": { name: "MADHYA PRADESH", code: "23" },
  "47": { name: "MADHYA PRADESH", code: "23" },
  "48": { name: "MADHYA PRADESH", code: "23" },
  "49": { name: "CHHATTISGARH", code: "22" },
  "50": { name: "TELANGANA", code: "36" },
  "51": { name: "TELANGANA", code: "36" },
  "52": { name: "ANDHRA PRADESH", code: "37" },
  "53": { name: "ANDHRA PRADESH", code: "37" },
  "56": { name: "KARNATAKA", code: "29" },
  "57": { name: "KARNATAKA", code: "29" },
  "58": { name: "KARNATAKA", code: "29" },
  "59": { name: "KARNATAKA", code: "29" },
  "60": { name: "TAMIL NADU", code: "33" },
  "61": { name: "TAMIL NADU", code: "33" },
  "62": { name: "TAMIL NADU", code: "33" },
  "63": { name: "TAMIL NADU", code: "33" },
  "64": { name: "TAMIL NADU", code: "33" },
  "67": { name: "KERALA", code: "32" },
  "68": { name: "KERALA", code: "32" },
  "69": { name: "KERALA", code: "32" },
  "70": { name: "WEST BENGAL", code: "19" },
  "71": { name: "WEST BENGAL", code: "19" },
  "72": { name: "WEST BENGAL", code: "19" },
  "73": { name: "WEST BENGAL", code: "19" },
  "74": { name: "WEST BENGAL", code: "19" },
  "75": { name: "ODISHA", code: "21" },
  "76": { name: "ODISHA", code: "21" },
  "77": { name: "ODISHA", code: "21" },
  "78": { name: "ASSAM", code: "18" },
  "80": { name: "BIHAR", code: "10" },
  "81": { name: "BIHAR", code: "10" },
  "82": { name: "BIHAR", code: "10" },
  "83": { name: "JHARKHAND", code: "20" },
  "84": { name: "JHARKHAND", code: "20" },
  "85": { name: "JHARKHAND", code: "20" },
  "90": { name: "ARMY POST OFFICE", code: "00" },
};

export function getStateFromPincode(pincode) {
  if (!pincode || String(pincode).length < 2) {
    return { name: "UTTAR PRADESH", code: "09" };
  }
  const prefix = String(pincode).substring(0, 2);
  return PINCODE_STATE_MAP[prefix] || { name: "UTTAR PRADESH", code: "09" };
}
```

- [ ] **Step 2: Commit**

```bash
git add utils/stateFromPincode.js
git commit -m "feat: add pincode to state mapping utility for GST place of supply"
```

---

## Task 4: Create invoice service

**Files:**
- Create: `services/invoiceService.js`

This is the core PDF builder. It handles GST computation, QR generation, and all pdfkit layout.

- [ ] **Step 1: Write the full invoice service**

```js
// services/invoiceService.js
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { getStateFromPincode } from "../utils/stateFromPincode.js";

// ── GST Computation ──────────────────────────────────────────────────────────

export function computeInvoiceItems(orderItems) {
  return orderItems.map((item, index) => {
    const product = item.product_variants?.products;
    const variant = item.product_variants;

    const name = product?.name || variant?.name || "Unknown Product";
    const hsn = product?.hsn_or_sac_code || "N/A";
    const gstRate = parseFloat(product?.gst_rate ?? 0);
    const cessRate = parseFloat(product?.cess_rate ?? 0);

    // MRP: prefer variant mrp, fall back to item price
    const mrp = parseFloat(variant?.mrp ?? variant?.price ?? item.price ?? 0);
    const rate = parseFloat(item.price ?? 0);
    const qty = parseInt(item.quantity ?? 1, 10);

    // Price stored inclusive of GST — back-compute taxable
    const divisor = 1 + gstRate / 100;
    const taxable = divisor > 0 ? rate / divisor : rate;

    const cgstRate = gstRate / 2;
    const sgstRate = gstRate / 2;
    const cgstAmt = taxable * (cgstRate / 100);
    const sgstAmt = taxable * (sgstRate / 100);
    const cessAmt = taxable * (cessRate / 100);

    const discountPct = mrp > 0 ? ((mrp - rate) / mrp) * 100 : 0;
    const lineTotal = taxable + cgstAmt + sgstAmt + cessAmt;

    return {
      srNo: index + 1,
      name,
      hsn,
      mrp: mrp.toFixed(2),
      qty,
      rate: rate.toFixed(2),
      discountPct: discountPct.toFixed(2),
      taxable: (taxable * qty).toFixed(2),
      cgstRate: cgstRate.toFixed(1),
      sgstRate: sgstRate.toFixed(1),
      cgstAmt: (cgstAmt * qty).toFixed(2),
      sgstAmt: (sgstAmt * qty).toFixed(2),
      cessRate: cessRate.toFixed(1),
      cessAmt: (cessAmt * qty).toFixed(2),
      total: (lineTotal * qty).toFixed(2),
    };
  });
}

export function computeTotals(invoiceItems) {
  const itemTotal = invoiceItems.reduce((s, i) => s + parseFloat(i.total), 0);
  const invoiceValue = Math.round(itemTotal);
  const roundOff = parseFloat((invoiceValue - itemTotal).toFixed(2));
  const totalTaxable = invoiceItems.reduce((s, i) => s + parseFloat(i.taxable), 0);
  const totalCgst = invoiceItems.reduce((s, i) => s + parseFloat(i.cgstAmt), 0);
  const totalSgst = invoiceItems.reduce((s, i) => s + parseFloat(i.sgstAmt), 0);
  const totalCess = invoiceItems.reduce((s, i) => s + parseFloat(i.cessAmt), 0);
  return {
    itemTotal: itemTotal.toFixed(2),
    roundOff: roundOff.toFixed(2),
    invoiceValue: invoiceValue.toFixed(2),
    totalTaxable: totalTaxable.toFixed(2),
    totalCgst: totalCgst.toFixed(2),
    totalSgst: totalSgst.toFixed(2),
    totalCess: totalCess.toFixed(2),
  };
}

// ── QR Generation ────────────────────────────────────────────────────────────

async function generateQRBuffer(order, config) {
  const qrData = JSON.stringify({
    invoiceNo: String(order.id),
    orderNo: String(order.id),
    date: new Date(order.created_at).toLocaleDateString("en-IN"),
    sellerGSTIN: config.seller.gstin,
    buyerName: order.receiver_name || order.users?.name || "",
    total: String(order.total),
  });
  return QRCode.toBuffer(qrData, { type: "png", width: 90, margin: 1 });
}

// ── Table Drawing Helper ──────────────────────────────────────────────────────

function drawTableRow(doc, cols, rowData, rowY, rowHeight, fontSize = 7, bold = false) {
  let x = cols[0].x;
  doc.fontSize(fontSize);
  if (bold) doc.font("Helvetica-Bold");
  else doc.font("Helvetica");

  cols.forEach((col, i) => {
    const val = rowData[i] !== undefined ? String(rowData[i]) : "";
    doc.rect(col.x, rowY, col.w, rowHeight).stroke();
    doc.text(val, col.x + 2, rowY + 3, {
      width: col.w - 4,
      height: rowHeight - 4,
      align: col.align || "left",
      lineBreak: true,
    });
  });
}

function drawHRule(doc, x, y, width) {
  doc.moveTo(x, y).lineTo(x + width, y).stroke();
}

// ── Main PDF Builder ──────────────────────────────────────────────────────────

export async function buildInvoicePDF(order, config) {
  const doc = new PDFDocument({ margin: 28, size: "A4" });
  const buffers = [];
  doc.on("data", (chunk) => buffers.push(chunk));

  const state = getStateFromPincode(order.delivery_pincode);
  const invoiceDate = new Date(order.created_at).toLocaleDateString("en-IN", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });

  const invoiceItems = computeInvoiceItems(
    (order.order_items || []).filter(
      (i) => i.product_variants && i.product_variants.products
    )
  );
  const totals = computeTotals(invoiceItems);
  const qrBuffer = await generateQRBuffer(order, config);

  const pageW = doc.page.width - 56; // usable width
  const startX = 28;
  let y = 28;

  // ── Header ──
  doc.font("Helvetica-Bold").fontSize(9);
  doc.text(`Seller Name: ${config.seller.name}`, startX, y, { width: pageW * 0.65 });
  doc.font("Helvetica").fontSize(8);
  doc.text(config.seller.address, startX, doc.y, { width: pageW * 0.65 });
  doc.text(`GSTIN: ${config.seller.gstin}`, startX, doc.y);
  doc.text(`FSSAI: ${config.seller.fssai}`, startX, doc.y);

  // QR code top-right
  doc.image(qrBuffer, startX + pageW - 90, y, { width: 90, height: 90 });

  y = Math.max(doc.y, y + 95) + 4;

  // Title
  doc.font("Helvetica-Bold").fontSize(11);
  doc.text("TAX INVOICE / BILL OF SUPPLY", startX, y, { width: pageW, align: "center" });
  y = doc.y + 4;

  // ── Meta Table (Invoice No / Place of Supply / Order No / Date) ──
  const metaColW = pageW / 2;
  const metaRowH = 16;
  [
    [`Invoice No.: ${order.id}`, `Place Of Supply: ${state.name} (${state.code})`],
    [`Order No.: ${order.id}`, `Date: ${invoiceDate}`],
  ].forEach((row) => {
    drawTableRow(
      doc,
      [{ x: startX, w: metaColW, align: "left" }, { x: startX + metaColW, w: metaColW, align: "left" }],
      row, y, metaRowH, 8, true
    );
    y += metaRowH;
  });
  y += 4;

  // ── Address Table ──
  const addrColW = pageW / 2;
  const buyerName = order.receiver_name || order.users?.name || "";
  const buyerAddr = order.address || "";

  // Header row
  drawTableRow(
    doc,
    [{ x: startX, w: addrColW }, { x: startX + addrColW, w: addrColW }],
    ["Bill To", "Ship To"], y, 14, 8, true
  );
  y += 14;

  // Address content row — dynamic height
  const addrText = `${buyerName}\n${buyerAddr}`;
  const addrH = Math.max(
    doc.heightOfString(addrText, { width: addrColW - 6 }) + 10,
    36
  );
  doc.rect(startX, y, addrColW, addrH).stroke();
  doc.rect(startX + addrColW, y, addrColW, addrH).stroke();
  doc.font("Helvetica").fontSize(8);
  doc.text(addrText, startX + 3, y + 4, { width: addrColW - 6 });
  doc.text(addrText, startX + addrColW + 3, y + 4, { width: addrColW - 6 });
  y += addrH + 6;

  // ── Items Table ──
  // Columns: SR | Item | MRP | HSN | Qty | Rate | Disc | Taxable | CGST% | SGST% | CGST Amt | SGST Amt | Cess% | Cess Amt | Total
  const cols = [
    { x: startX,         w: 20,  align: "center" }, // SR
    { x: startX + 20,   w: 68,  align: "left"   }, // Item
    { x: startX + 88,   w: 34,  align: "right"  }, // MRP
    { x: startX + 122,  w: 38,  align: "center" }, // HSN
    { x: startX + 160,  w: 18,  align: "center" }, // Qty
    { x: startX + 178,  w: 30,  align: "right"  }, // Rate
    { x: startX + 208,  w: 28,  align: "right"  }, // Disc
    { x: startX + 236,  w: 34,  align: "right"  }, // Taxable
    { x: startX + 270,  w: 22,  align: "center" }, // CGST%
    { x: startX + 292,  w: 22,  align: "center" }, // SGST%
    { x: startX + 314,  w: 28,  align: "right"  }, // CGST Amt
    { x: startX + 342,  w: 28,  align: "right"  }, // SGST Amt
    { x: startX + 370,  w: 22,  align: "center" }, // Cess%
    { x: startX + 392,  w: 28,  align: "right"  }, // Cess Amt
    { x: startX + 420,  w: pageW - 420, align: "right" }, // Total
  ];

  const headers = ["SR", "Item & Description", "Unit MRP", "HSN", "Qty", "Rate",
    "Disc.", "Taxable", "CGST%", "SGST%", "CGST Amt", "SGST Amt", "Cess%", "Cess Amt", "Total"];
  drawTableRow(doc, cols, headers, y, 22, 7, true);
  y += 22;

  invoiceItems.forEach((item) => {
    const rowData = [
      item.srNo, item.name, item.mrp, item.hsn, item.qty,
      item.rate, `${item.discountPct}%`, item.taxable,
      `${item.cgstRate}%`, `${item.sgstRate}%`,
      item.cgstAmt, item.sgstAmt,
      `${item.cessRate}%`, item.cessAmt, item.total,
    ];
    // Dynamic row height based on item name length
    const nameH = doc.heightOfString(item.name, { width: cols[1].w - 4 });
    const rowH = Math.max(nameH + 8, 18);
    drawTableRow(doc, cols, rowData, y, rowH, 7, false);
    y += rowH;
  });

  // Totals row
  const totalsRow = ["", "", "", "", "", "", "Totals",
    totals.totalTaxable, "", "", totals.totalCgst, totals.totalSgst, "", totals.totalCess, totals.itemTotal];
  drawTableRow(doc, cols, totalsRow, y, 16, 7, true);
  y += 16 + 6;

  // ── Summary Table ──
  const summaryW = 180;
  const summaryX = startX + pageW - summaryW;
  [
    ["Item Total", totals.itemTotal],
    ["Round Off", totals.roundOff],
  ].forEach(([label, val]) => {
    doc.rect(summaryX, y, summaryW * 0.6, 14).stroke();
    doc.rect(summaryX + summaryW * 0.6, y, summaryW * 0.4, 14).stroke();
    doc.font("Helvetica").fontSize(8);
    doc.text(label, summaryX + 3, y + 3, { width: summaryW * 0.6 - 4 });
    doc.text(val, summaryX + summaryW * 0.6 + 3, y + 3, { width: summaryW * 0.4 - 4, align: "right" });
    y += 14;
  });
  // Invoice Value (bold)
  doc.rect(summaryX, y, summaryW * 0.6, 14).stroke();
  doc.rect(summaryX + summaryW * 0.6, y, summaryW * 0.4, 14).stroke();
  doc.font("Helvetica-Bold").fontSize(8);
  doc.text("Invoice Value", summaryX + 3, y + 3, { width: summaryW * 0.6 - 4 });
  doc.text(totals.invoiceValue, summaryX + summaryW * 0.6 + 3, y + 3, { width: summaryW * 0.4 - 4, align: "right" });
  y += 14 + 8;

  // ── Notes ──
  doc.font("Helvetica").fontSize(7.5);
  doc.text("Whether GST is payable on reverse-charge: No.", startX, y);
  y = doc.y + 2;
  doc.text("For IMEI / Serial number information, please refer to packaging / warranty slip.", startX, y);
  y = doc.y + 10;

  // ── Footer ──
  doc.font("Helvetica-Bold").fontSize(8);
  doc.text("Order Delivered From:", startX, y);
  doc.font("Helvetica").fontSize(8);
  doc.text(`${config.deliveredFrom.name}`, startX, doc.y);
  doc.text(`${config.deliveredFrom.address}`, startX, doc.y);
  doc.text(`FSSAI: ${config.deliveredFrom.fssai}`, startX, doc.y);
  y = doc.y + 8;

  doc.font("Helvetica-Bold").fontSize(8);
  doc.text("E-commerce Platform (FBO) Information:", startX, y);
  doc.font("Helvetica").fontSize(8);
  doc.text(`${config.platform.name}`, startX, doc.y);
  doc.text(`${config.platform.address}`, startX, doc.y);
  doc.text(`FSSAI Lic. No: ${config.platform.fssai}`, startX, doc.y);
  doc.text(`Email: ${config.platform.email}`, startX, doc.y);

  doc.end();

  return new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add services/invoiceService.js utils/stateFromPincode.js
git commit -m "feat: add invoice PDF service with GST computation and pdfkit layout"
```

---

## Task 5: Create invoice controller

**Files:**
- Create: `controller/invoiceController.js`

- [ ] **Step 1: Write the controller with single + batch handlers**

```js
// controller/invoiceController.js
import prisma from "../config/prisma.js";
import archiver from "archiver";
import invoiceConfig from "../config/invoiceConfig.js";
import { buildInvoicePDF } from "../services/invoiceService.js";

// ── Shared optimized Prisma query ─────────────────────────────────────────────
async function fetchOrderForInvoice(orderId) {
  return prisma.orders.findUnique({
    where: { id: parseInt(orderId, 10) },
    select: {
      id: true,
      receiver_name: true,
      address: true,
      delivery_pincode: true,
      total: true,
      created_at: true,
      user_id: true,
      users: {
        select: { id: true, name: true, email: true, phone: true },
      },
      order_items: {
        select: {
          quantity: true,
          price: true,
          product_variants: {
            select: {
              mrp: true,
              price: true,
              products: {
                select: {
                  name: true,
                  hsn_or_sac_code: true,
                  gst_rate: true,
                  cess_rate: true,
                },
              },
            },
          },
        },
      },
    },
  });
}

// ── GET /orders/:id/invoice ───────────────────────────────────────────────────
export async function getInvoice(req, res) {
  try {
    const orderId = parseInt(req.params.id, 10);
    if (isNaN(orderId)) {
      return res.status(400).json({ success: false, error: "Invalid order ID" });
    }

    const order = await fetchOrderForInvoice(orderId);
    if (!order) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }

    // Users can only download their own orders; admins can download any
    const isAdmin = req.user?.role === "ADMIN";
    const isOwner = String(order.user_id) === String(req.user?.id);
    if (!isAdmin && !isOwner) {
      return res.status(403).json({ success: false, error: "Access denied" });
    }

    if (!order.order_items || order.order_items.length === 0) {
      return res.status(422).json({ success: false, error: "Order has no items" });
    }

    const pdfBuffer = await buildInvoicePDF(order, invoiceConfig);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="invoice-${orderId}.pdf"`,
      "Content-Length": pdfBuffer.length,
    });
    return res.send(pdfBuffer);
  } catch (err) {
    console.error("Invoice generation error:", err);
    return res.status(500).json({ success: false, error: "Failed to generate invoice" });
  }
}

// ── POST /orders/batch/invoice (admin only) ───────────────────────────────────
export async function getBatchInvoice(req, res) {
  try {
    let { orderIds } = req.body;

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ success: false, error: "orderIds array required" });
    }
    if (orderIds.length > 50) {
      return res.status(400).json({ success: false, error: "Maximum 50 orders per batch request" });
    }

    const parsedIds = orderIds
      .map((id) => parseInt(id, 10))
      .filter((id) => !isNaN(id));

    if (parsedIds.length === 0) {
      return res.status(400).json({ success: false, error: "No valid order IDs provided" });
    }

    // Fetch all orders in one query
    const orders = await prisma.orders.findMany({
      where: { id: { in: parsedIds } },
      select: {
        id: true,
        receiver_name: true,
        address: true,
        delivery_pincode: true,
        total: true,
        created_at: true,
        user_id: true,
        users: {
          select: { id: true, name: true, email: true, phone: true },
        },
        order_items: {
          select: {
            quantity: true,
            price: true,
            product_variants: {
              select: {
                mrp: true,
                price: true,
                products: {
                  select: {
                    name: true,
                    hsn_or_sac_code: true,
                    gst_rate: true,
                    cess_rate: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (orders.length === 0) {
      return res.status(404).json({ success: false, error: "No orders found" });
    }

    // Stream ZIP response
    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="invoices-batch.zip"`,
    });

    const archive = archiver("zip", { zlib: { level: 6 } });
    archive.pipe(res);

    archive.on("error", (err) => {
      console.error("Archive error:", err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: "Failed to create archive" });
      }
    });

    for (const order of orders) {
      if (!order.order_items || order.order_items.length === 0) continue;
      try {
        const pdfBuffer = await buildInvoicePDF(order, invoiceConfig);
        archive.append(pdfBuffer, { name: `invoice-${order.id}.pdf` });
      } catch (err) {
        console.error(`Failed to generate PDF for order ${order.id}:`, err);
        // Skip failed invoices, continue with rest
      }
    }

    await archive.finalize();
  } catch (err) {
    console.error("Batch invoice error:", err);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: "Failed to generate batch invoices" });
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add controller/invoiceController.js
git commit -m "feat: add invoice controller with single and batch PDF endpoints"
```

---

## Task 6: Create invoice routes

**Files:**
- Create: `routes/invoiceRoutes.js`

- [ ] **Step 1: Write route file**

```js
// routes/invoiceRoutes.js
import express from "express";
import { authenticateToken } from "../middleware/authenticate.js";
import { requireAdmin } from "../middleware/authorize.js";
import { getInvoice, getBatchInvoice } from "../controller/invoiceController.js";

const router = express.Router();

// User or admin: download single invoice
// GET /api/orders/:id/invoice
router.get("/:id/invoice", authenticateToken, getInvoice);

// Admin only: batch download as ZIP
// POST /api/orders/batch/invoice
router.post("/batch/invoice", authenticateToken, requireAdmin, getBatchInvoice);

export default router;
```

- [ ] **Step 2: Commit**

```bash
git add routes/invoiceRoutes.js
git commit -m "feat: add invoice routes"
```

---

## Task 7: Register invoice routes in server.js

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Add import at the top of server.js with other route imports**

Find the block of route imports (around line 26 where `orderRoutes` is imported) and add:

```js
import invoiceRoutes from "./routes/invoiceRoutes.js";
```

- [ ] **Step 2: Mount the route on the same /api/orders prefix**

Find where `orderRoutes` is mounted (search for `app.use` + `orderRoutes`) and add directly after it:

```js
app.use("/api/orders", invoiceRoutes);
```

- [ ] **Step 3: Verify server starts without error**

```bash
npm run dev
```

Expected: server starts, no import errors.

- [ ] **Step 4: Smoke-test the endpoint**

```bash
# Replace TOKEN and ORDER_ID with real values from your DB
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:8000/api/orders/ORDER_ID/invoice \
  --output /tmp/test-invoice.pdf
# Then open /tmp/test-invoice.pdf to verify layout
```

- [ ] **Step 5: Commit**

```bash
git add server.js
git commit -m "feat: mount invoice routes in server"
```

---

## Task 8: Add frontend invoice download utility

**Files:**
- Create: `src/utils/invoiceApi.js`

- [ ] **Step 1: Write the download helper**

```js
// src/utils/invoiceApi.js
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "https://big-best-backend.vercel.app/api";

export async function downloadInvoice(orderId, token) {
  const res = await fetch(`${API_BASE_URL}/orders/${orderId}/invoice`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to generate invoice");
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `invoice-${orderId}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function downloadBatchInvoices(orderIds, token) {
  const res = await fetch(`${API_BASE_URL}/orders/batch/invoice`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ orderIds }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to generate invoices");
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "invoices-batch.zip";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/utils/invoiceApi.js
git commit -m "feat: add frontend invoice download utility"
```

---

## Task 9: Add Download Invoice button to checkout confirmation

**Files:**
- Modify: `src/components/checkout/WarehouseAwareCheckout.jsx`

- [ ] **Step 1: Add import at the top of the file**

Find the existing imports block and add:

```js
import { downloadInvoice } from "@/utils/invoiceApi";
```

- [ ] **Step 2: Add download state and handler inside WarehouseAwareCheckout, before the return statement**

Find the line `const [showValidationDetails, setShowValidationDetails] = useState(false);` and add below it:

```js
const [invoiceLoading, setInvoiceLoading] = useState(false);

const handleDownloadInvoice = async () => {
  try {
    setInvoiceLoading(true);
    const token = localStorage.getItem("token") || sessionStorage.getItem("token");
    await downloadInvoice(orderId, token);
  } catch (err) {
    console.error("Invoice download failed:", err);
    alert("Could not download invoice. Please try from My Orders.");
  } finally {
    setInvoiceLoading(false);
  }
};
```

- [ ] **Step 3: Replace the renderConfirmation function**

Find the existing `renderConfirmation` function and replace it entirely with:

```js
const renderConfirmation = () => (
  <Card>
    <CardContent sx={{ textAlign: "center" }}>
      <CheckIcon sx={{ fontSize: 80, color: "success.main", mb: 2 }} />
      <Typography variant="h5" gutterBottom>
        Order Confirmed!
      </Typography>
      <Typography variant="body1" sx={{ mb: 2 }}>
        Your order {orderId} has been placed successfully.
      </Typography>
      <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
        You will receive a confirmation email shortly with tracking details.
      </Typography>
      <Box display="flex" gap={2} justifyContent="center" flexWrap="wrap">
        <Button
          variant="outlined"
          onClick={handleDownloadInvoice}
          disabled={invoiceLoading || !orderId}
        >
          {invoiceLoading ? "Generating..." : "Download Invoice"}
        </Button>
        <Button
          variant="contained"
          onClick={() => (window.location.href = "/orders")}
        >
          View Orders
        </Button>
      </Box>
    </CardContent>
  </Card>
);
```

- [ ] **Step 4: Commit**

```bash
git add src/components/checkout/WarehouseAwareCheckout.jsx
git commit -m "feat: add download invoice button to checkout confirmation screen"
```

---

## Task 10: Add Download Invoice button to orders page

**Files:**
- Modify: `src/app/pages/orders/page.jsx`

- [ ] **Step 1: Add import at the top of the file**

Find the existing imports and add:

```js
import { downloadInvoice } from "@/utils/invoiceApi";
```

- [ ] **Step 2: Add download handler inside the OrdersPageInner function**

Find `const [hasLoadedOrders, setHasLoadedOrders] = useState(false);` and add below it:

```js
const [downloadingInvoice, setDownloadingInvoice] = useState(null); // stores orderId being downloaded

const handleDownloadInvoice = async (orderId) => {
  try {
    setDownloadingInvoice(orderId);
    const token =
      localStorage.getItem("token") ||
      sessionStorage.getItem("token") ||
      currentUser?.accessToken;
    await downloadInvoice(orderId, token);
  } catch (err) {
    console.error("Invoice download failed:", err);
    toast.error("Could not download invoice. Please try again.");
  } finally {
    setDownloadingInvoice(null);
  }
};
```

- [ ] **Step 3: Add the Download Invoice button to each order card**

In the orders page, find the section that renders each order card. It contains:
```jsx
<h3 className="font-semibold">Order #{order.id}</h3>
```

Find the `<div className="flex justify-between items-start mb-3">` wrapper for each order and add a download button inside the right-side column (next to the status badge). Replace the right column content with:

```jsx
<div className="flex flex-col items-end gap-2">
  <span
    className={`px-3 py-1 rounded-full text-xs font-medium ${
      order.status === "cancelled"
        ? "bg-red-100 text-red-800"
        : order.status === "delivered"
        ? "bg-green-100 text-green-800"
        : "bg-yellow-100 text-yellow-800"
    }`}
  >
    {order.status.toUpperCase()}
  </span>
  <button
    onClick={() => handleDownloadInvoice(order.id)}
    disabled={downloadingInvoice === order.id}
    className="text-xs text-blue-600 hover:text-blue-800 underline disabled:opacity-50"
  >
    {downloadingInvoice === order.id ? "Generating..." : "Download Invoice"}
  </button>
</div>
```

- [ ] **Step 4: Commit**

```bash
git add src/app/pages/orders/page.jsx
git commit -m "feat: add download invoice button to orders page"
```

---

## Task 11: Add View/Download to admin orders table

**Files:**
- Modify: `src/components/admin/Orders.jsx`

- [ ] **Step 1: Replace the entire Orders.jsx file**

```jsx
// src/components/admin/Orders.jsx
"use client";
import { useState } from "react";
import { FiEdit, FiTrash2, FiDownload } from "react-icons/fi";
import { downloadInvoice, downloadBatchInvoices } from "@/utils/invoiceApi";

function Orders({ orders, openEditOrder, deleteOrder, adminToken }) {
  const [downloadingId, setDownloadingId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [batchDownloading, setBatchDownloading] = useState(false);

  const handleDownload = async (orderId) => {
    try {
      setDownloadingId(orderId);
      await downloadInvoice(orderId, adminToken);
    } catch (err) {
      console.error("Invoice download failed:", err);
      alert("Could not download invoice for order #" + orderId);
    } finally {
      setDownloadingId(null);
    }
  };

  const toggleSelect = (orderId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(orderId) ? next.delete(orderId) : next.add(orderId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === orders.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(orders.map((o) => o.id)));
    }
  };

  const handleBatchDownload = async () => {
    if (selectedIds.size === 0) return;
    try {
      setBatchDownloading(true);
      await downloadBatchInvoices(Array.from(selectedIds), adminToken);
    } catch (err) {
      console.error("Batch invoice download failed:", err);
      alert("Could not download batch invoices. " + err.message);
    } finally {
      setBatchDownloading(false);
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Orders Management</h1>
          <p className="text-gray-600">View and manage customer orders</p>
        </div>
        {selectedIds.size > 0 && (
          <button
            onClick={handleBatchDownload}
            disabled={batchDownloading}
            className="flex items-center gap-2 bg-[#FD5B00] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#e05100] disabled:opacity-50"
          >
            <FiDownload />
            {batchDownloading
              ? "Generating..."
              : `Download ${selectedIds.size} Invoice${selectedIds.size > 1 ? "s" : ""}`}
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === orders.length && orders.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50">
                  <td className="px-4 py-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(order.id)}
                      onChange={() => toggleSelect(order.id)}
                      className="rounded"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    #{order.id}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {order.customer}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {order.date}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        order.status === "Delivered"
                          ? "bg-green-100 text-green-800"
                          : order.status === "Processing"
                          ? "bg-yellow-100 text-yellow-800"
                          : order.status === "Shipped"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {order.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ₹{order.total}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => openEditOrder(order)}
                      className="text-[#FD5B00] hover:text-[#e05100] mr-3"
                      title="Edit order"
                    >
                      <FiEdit />
                    </button>
                    <button
                      onClick={() => deleteOrder(order.id)}
                      className="text-red-500 hover:text-red-700 mr-3"
                      title="Delete order"
                    >
                      <FiTrash2 />
                    </button>
                    <button
                      onClick={() => handleDownload(order.id)}
                      disabled={downloadingId === order.id}
                      className="text-gray-600 hover:text-gray-900 disabled:opacity-40"
                      title="Download invoice"
                    >
                      {downloadingId === order.id ? "..." : <FiDownload />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default Orders;
```

- [ ] **Step 2: Pass adminToken prop from AdminDashboard**

In `src/app/pages/admin/dashboard/page.jsx`, find where `<Orders>` is rendered:

```jsx
<Orders orders={orders} openEditOrder={openEditOrder} deleteOrder={deleteOrder} />
```

Replace with:

```jsx
<Orders
  orders={orders}
  openEditOrder={openEditOrder}
  deleteOrder={deleteOrder}
  adminToken={typeof window !== "undefined"
    ? (localStorage.getItem("adminToken") || localStorage.getItem("token"))
    : ""}
/>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/Orders.jsx src/app/pages/admin/dashboard/page.jsx
git commit -m "feat: add view/download invoice buttons to admin orders table with batch select"
```

---

## Edge Cases Handled

| Scenario | Handling |
|----------|---------|
| Order not found | 404 JSON response |
| Order belongs to different user | 403 JSON response |
| Order has no items | 422 JSON response |
| Item has no product/variant linked | Skip item silently, log warning |
| `gst_rate = 0` (exempt items) | taxable = price, cgst/sgst/cess = 0.00 |
| Missing `hsn_or_sac_code` | Shows "N/A" in HSN column |
| Missing `mrp` on variant | Falls back to `item.price` as MRP; discount shows 0% |
| Pincode not in state map | Defaults to UTTAR PRADESH (09) |
| Batch: invalid IDs in array | Filtered out via `parseInt` + `isNaN` check |
| Batch: order with no items | Skipped in ZIP, does not fail entire batch |
| Batch > 50 orders | 400 error returned before any DB query |
| Archive error mid-stream | Logged, response already started so no JSON fallback |
| PDF generation error for one batch order | Logged and skipped, rest of ZIP continues |
