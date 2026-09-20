import { onOrderPlaced as referralOnOrderPlaced, onOrderDelivered as referralOnOrderDelivered, onOrderReturned as referralOnOrderReturned } from "./referralService.js";
import { onOrderDelivered as affiliateOnOrderDelivered, onOrderReturned as affiliateOnOrderReturned } from "./affiliateService.js";
import { calculateEligibleOrderBase } from "./rewardCalculation.js";
import { isDeliveredStatus, isCancelledStatus } from "../utils/orderStatus.js";

// Called right after a new order is created. Errors are swallowed so a growth-program bug
// never blocks order placement — missed attribution is reconcilable, a failed order isn't.
export const onOrderCreated = async (order) => {
  if (!order?.user_id) return;
  try {
    await referralOnOrderPlaced(order.user_id, order.id, order.invoice_number || order.id, calculateEligibleOrderBase(order));
  } catch (err) {
    console.error(`[orderLifecycleHooks] onOrderCreated failed for order ${order?.id}:`, err.message);
  }
};

// Called with whatever status string was actually persisted — normalized here so every
// call site (which write "Delivered"/"DELIVERED"/"delivered") is handled consistently.
export const onOrderStatusChanged = async (orderId, newStatus) => {
  if (!orderId || !newStatus) return;
  try {
    if (isDeliveredStatus(newStatus)) {
      const deliveredAt = new Date();
      // Independent tables (referral_transactions vs affiliate_orders) — run concurrently so a
      // throw on one side doesn't skip the other, and so the request path isn't serialized on both.
      await Promise.all([
        referralOnOrderDelivered(orderId, deliveredAt),
        affiliateOnOrderDelivered(orderId, deliveredAt),
      ]);
    } else if (isCancelledStatus(newStatus)) {
      await Promise.all([
        referralOnOrderReturned(orderId, "FULL", null),
        affiliateOnOrderReturned(orderId, "FULL", null),
      ]);
    }
  } catch (err) {
    console.error(`[orderLifecycleHooks] onOrderStatusChanged failed for order ${orderId} -> ${newStatus}:`, err.message);
  }
};

// Called when an admin approves a partial item return (not a full cancellation).
export const onOrderPartiallyReturned = async (orderId, returnAmount) => {
  if (!orderId) return;
  try {
    await Promise.all([
      referralOnOrderReturned(orderId, "PARTIAL", returnAmount),
      affiliateOnOrderReturned(orderId, "PARTIAL", returnAmount),
    ]);
  } catch (err) {
    console.error(`[orderLifecycleHooks] onOrderPartiallyReturned failed for order ${orderId}:`, err.message);
  }
};
