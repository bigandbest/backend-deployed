// controller/invoiceController.js
import prisma from "../config/prisma.js";
import archiver from "archiver";
import invoiceConfig from "../config/invoiceConfig.js";
import { buildInvoicePDF } from "../services/invoiceService.js";
import { ensureOrderInvoiceIdentity } from "../utils/invoiceIdentity.js";

// Shared optimized Prisma query — minimal select, no unused joins
async function fetchOrderForInvoice(orderId) {
  return prisma.orders.findUnique({
    where: { id: String(orderId) },
    select: {
      id: true,
      receiver_name: true,
      address: true,
      delivery_pincode: true,
      total: true,
      created_at: true,
      user_id: true,
      invoice_number: true,
      irn: true,
      orn: true,
      invoice_generated_at: true,
      users: {
        select: { id: true, name: true, email: true, phone: true },
      },
      order_items: {
        select: {
          quantity: true,
          price: true,
          product_variants: {
            select: {
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

// GET /orders/:id/invoice
export async function getInvoice(req, res) {
  try {
    const orderId = String(req.params.id || "").trim();
    if (!orderId) {
      return res.status(400).json({ success: false, error: "Invalid order ID" });
    }

    let order = await fetchOrderForInvoice(orderId);
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

    // Backfill legacy orders once; keep immutable if already set.
    if (!order.invoice_number || !order.irn || !order.orn || !order.invoice_generated_at) {
      await prisma.$transaction(async (tx) => {
        await ensureOrderInvoiceIdentity(tx, order.id, "QK");
      });
      order = await fetchOrderForInvoice(orderId);
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

// POST /orders/batch/invoice (admin only)
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
      .map((id) => String(id || "").trim())
      .filter(Boolean);

    if (parsedIds.length === 0) {
      return res.status(400).json({ success: false, error: "No valid order IDs provided" });
    }

    // Fetch all orders in one query — no N+1
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
        invoice_number: true,
        irn: true,
        orn: true,
        invoice_generated_at: true,
        users: {
          select: { id: true, name: true, email: true, phone: true },
        },
        order_items: {
          select: {
            quantity: true,
            price: true,
            product_variants: {
              select: {
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

    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="invoices-batch.zip"`,
    });

    const archive = archiver("zip", { zlib: { level: 6 } });
    archive.pipe(res);

    archive.on("error", (err) => {
      console.error("Archive error:", err);
    });

    for (const order of orders) {
      if (!order.order_items || order.order_items.length === 0) continue;
      try {
        if (!order.invoice_number || !order.irn || !order.orn || !order.invoice_generated_at) {
          await prisma.$transaction(async (tx) => {
            await ensureOrderInvoiceIdentity(tx, order.id, "QK");
          });
          const refreshed = await fetchOrderForInvoice(order.id);
          if (refreshed) {
            Object.assign(order, refreshed);
          }
        }

        const pdfBuffer = await buildInvoicePDF(order, invoiceConfig);
        archive.append(pdfBuffer, { name: `invoice-${order.id}.pdf` });
      } catch (err) {
        console.error(`Failed to generate PDF for order ${order.id}:`, err);
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
