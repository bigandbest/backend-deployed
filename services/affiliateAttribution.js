import { reconcileAffiliateReturns } from "./affiliateReturnService.js";
import { Prisma } from "@prisma/client";
import prisma from "../config/prisma.js";
import { processAffiliateOrder, onOrderDelivered } from "./affiliateService.js";
import { isCancelledStatus, isDeliveredStatus } from "../utils/orderStatus.js";

// Store only known fields. Ownership and click expiry are validated against the actual order
// by processAffiliateOrder, never trusted from client-supplied customer IDs or timestamps.
export const normalizeAffiliateAttribution = (input) => {
  if (!input || typeof input.affiliate_code !== "string") return null;
  const code = input.affiliate_code.trim();
  if (!/^[a-zA-Z0-9]{1,64}$/.test(code)) return null;
  if (input.click_id != null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(input.click_id))) return null;
  return { affiliate_code: code, click_id: input.click_id || null };
};

// Orders are the durable queue. A crash after commission creation is safe: the unique
// affiliate_orders.order_id plus atomic profile accounting make reconciliation idempotent.
export const reconcileAffiliateAttribution = async () => {
  const orders = await prisma.orders.findMany({
    where: { affiliate_attribution: { not: Prisma.DbNull }, affiliate_attribution_processed_at: null,
      created_at: { lt: new Date(Date.now() - 60000) } },
    orderBy: [{ affiliate_attribution_attempts: "asc" }, { created_at: "asc" }], take: 100,
  });
  let processed = 0, failed = 0;
  for (const order of orders) {
    try {
      const terminal = isCancelledStatus(order.status) || ["canceled", "failed", "returned", "refunded"].includes(String(order.status || "").trim().toLowerCase());
      if (terminal) await reconcileAffiliateReturns(order.id, { full: true });
      if (!terminal) {
        // Wallet orders exist briefly before their debit commits; never attribute an unpaid one.
        if (String(order.payment_method).toLowerCase().includes("wallet")) {
          const debit = await prisma.wallet_transactions.findFirst({ where: { reference_id: order.id, reference_type: "ORDER", transaction_type: "SPEND", status: "COMPLETED" } });
          if (!debit) continue;
        }
        const itemCount = await prisma.order_items.count({ where: { order_id: order.id } });
        if (!itemCount) throw new Error("Order items are not ready");
        const attribution = normalizeAffiliateAttribution(order.affiliate_attribution);
        if (attribution) {
          const result = await processAffiliateOrder(order.id, attribution.affiliate_code, { clickId: attribution.click_id, retryOnError: true });
          if (result) await reconcileAffiliateReturns(order.id);
          if (result && isDeliveredStatus(order.status)) {
            // Prefer the recorded delivery event; updated_at is conservative when tracking is absent.
            const tracking = await prisma.order_tracking.findFirst({ where: { order_id: order.id, status: { in: ["Delivered", "delivered", "DELIVERED"] } }, orderBy: { timestamp: "asc" } });
            await onOrderDelivered(order.id, tracking?.timestamp || order.updated_at || new Date());
          }
        }
      }
      await prisma.orders.update({ where: { id: order.id }, data: { affiliate_attribution_processed_at: new Date(), affiliate_attribution_error: null, affiliate_attribution_attempts: { increment: 1 } } });
      processed++;
    } catch (err) {
      failed++;
      await prisma.orders.update({ where: { id: order.id }, data: { affiliate_attribution_attempts: { increment: 1 }, affiliate_attribution_error: String(err.message).slice(0, 1000) } });
      console.error(`[affiliate-attribution] order ${order.id} will retry:`, err.message);
    }
  }
  return { scanned: orders.length, processed, failed };
};
