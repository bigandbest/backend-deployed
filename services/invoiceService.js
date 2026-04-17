import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { getStateFromPincode } from "../utils/stateFromPincode.js";

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

function drawTableRow(doc, cols, rowData, rowY, rowHeight, fontSize = 7, bold = false) {
  if (bold) doc.font("Helvetica-Bold");
  else doc.font("Helvetica");
  doc.fontSize(fontSize);

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

  const pageW = doc.page.width - 56;
  const startX = 28;
  let y = 28;

  // Header
  doc.font("Helvetica-Bold").fontSize(9);
  doc.text(`Seller Name: ${config.seller.name}`, startX, y, { width: pageW * 0.65 });
  doc.font("Helvetica").fontSize(8);
  doc.text(config.seller.address, startX, doc.y, { width: pageW * 0.65 });
  doc.text(`GSTIN: ${config.seller.gstin}`, startX, doc.y);
  doc.text(`FSSAI: ${config.seller.fssai}`, startX, doc.y);
  doc.image(qrBuffer, startX + pageW - 90, y, { width: 90, height: 90 });
  y = Math.max(doc.y, y + 95) + 4;

  // Title
  doc.font("Helvetica-Bold").fontSize(11);
  doc.text("TAX INVOICE / BILL OF SUPPLY", startX, y, { width: pageW, align: "center" });
  y = doc.y + 4;

  // Meta table (2x2)
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

  // Address table
  const addrColW = pageW / 2;
  const buyerName = order.receiver_name || order.users?.name || "";
  const buyerAddr = order.address || "";
  drawTableRow(
    doc,
    [{ x: startX, w: addrColW }, { x: startX + addrColW, w: addrColW }],
    ["Bill To", "Ship To"], y, 14, 8, true
  );
  y += 14;
  const addrText = `${buyerName}\n${buyerAddr}`;
  const addrH = Math.max(
    doc.heightOfString(addrText, { width: addrColW - 6 }) + 10, 36
  );
  doc.rect(startX, y, addrColW, addrH).stroke();
  doc.rect(startX + addrColW, y, addrColW, addrH).stroke();
  doc.font("Helvetica").fontSize(8);
  doc.text(addrText, startX + 3, y + 4, { width: addrColW - 6 });
  doc.text(addrText, startX + addrColW + 3, y + 4, { width: addrColW - 6 });
  y += addrH + 6;

  // Items table — 15 columns
  const cols = [
    { x: startX,         w: 20,  align: "center" },
    { x: startX + 20,   w: 68,  align: "left"   },
    { x: startX + 88,   w: 34,  align: "right"  },
    { x: startX + 122,  w: 38,  align: "center" },
    { x: startX + 160,  w: 18,  align: "center" },
    { x: startX + 178,  w: 30,  align: "right"  },
    { x: startX + 208,  w: 28,  align: "right"  },
    { x: startX + 236,  w: 34,  align: "right"  },
    { x: startX + 270,  w: 22,  align: "center" },
    { x: startX + 292,  w: 22,  align: "center" },
    { x: startX + 314,  w: 28,  align: "right"  },
    { x: startX + 342,  w: 28,  align: "right"  },
    { x: startX + 370,  w: 22,  align: "center" },
    { x: startX + 392,  w: 28,  align: "right"  },
    { x: startX + 420,  w: pageW - 420, align: "right" },
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

  // Summary table
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
  doc.rect(summaryX, y, summaryW * 0.6, 14).stroke();
  doc.rect(summaryX + summaryW * 0.6, y, summaryW * 0.4, 14).stroke();
  doc.font("Helvetica-Bold").fontSize(8);
  doc.text("Invoice Value", summaryX + 3, y + 3, { width: summaryW * 0.6 - 4 });
  doc.text(totals.invoiceValue, summaryX + summaryW * 0.6 + 3, y + 3, { width: summaryW * 0.4 - 4, align: "right" });
  y += 14 + 8;

  // Notes
  doc.font("Helvetica").fontSize(7.5);
  doc.text("Whether GST is payable on reverse-charge: No.", startX, y);
  y = doc.y + 2;
  doc.text("For IMEI / Serial number information, please refer to packaging / warranty slip.", startX, y);
  y = doc.y + 10;

  // Footer
  doc.font("Helvetica-Bold").fontSize(8);
  doc.text("Order Delivered From:", startX, y);
  doc.font("Helvetica").fontSize(8);
  doc.text(config.deliveredFrom.name, startX, doc.y);
  doc.text(config.deliveredFrom.address, startX, doc.y);
  doc.text(`FSSAI: ${config.deliveredFrom.fssai}`, startX, doc.y);
  y = doc.y + 8;

  doc.font("Helvetica-Bold").fontSize(8);
  doc.text("E-commerce Platform (FBO) Information:", startX, y);
  doc.font("Helvetica").fontSize(8);
  doc.text(config.platform.name, startX, doc.y);
  doc.text(config.platform.address, startX, doc.y);
  doc.text(`FSSAI Lic. No: ${config.platform.fssai}`, startX, doc.y);
  doc.text(`Email: ${config.platform.email}`, startX, doc.y);

  doc.end();

  return new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);
  });
}
