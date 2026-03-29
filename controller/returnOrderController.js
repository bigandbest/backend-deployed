import returnOrderDao from "../dao/returnOrder.dao.js";
import orderDao from "../dao/order.dao.js";
import prisma from "../config/prisma.js";
import {
  notifyReturnCreated,
  notifyReturnStatusUpdated,
} from "../services/notificationService.js";

// ---------------------------------------------------------------------------
// Load refund percentage from charge_settings (0–100, default 0)
// ---------------------------------------------------------------------------
const getRefundPercentage = async () => {
  try {
    const settings = await prisma.charge_settings.findUnique({ where: { id: 1 } });
    return Number(settings?.refund_percentage ?? 0);
  } catch {
    return 0;
  }
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const daysSince = (date) => {
  if (!date) return -1;
  const d = new Date(date);
  if (isNaN(d.getTime())) return -1;
  return Math.ceil(Math.abs(Date.now() - d) / (1000 * 60 * 60 * 24));
};

const isCOD = (paymentMethod) =>
  ["cod", "cash", "cash on delivery"].some((m) =>
    paymentMethod?.toLowerCase().includes(m)
  );

// ---------------------------------------------------------------------------
// Test DB connection
// ---------------------------------------------------------------------------
export const testDatabase = async (req, res) => {
  try {
    const count = await prisma.return_orders.count();
    return res.json({ success: true, message: "DB OK", return_orders_count: count });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ---------------------------------------------------------------------------
// Check return / cancellation eligibility
// ---------------------------------------------------------------------------
export const checkReturnEligibility = async (req, res) => {
  const { order_id } = req.params;
  try {
    const order = await orderDao.getById(order_id);
    if (!order) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }

    // Already-returned item ids
    const returnedRows = await prisma.return_order_items.findMany({
      where: { return_orders: { order_id } },
      select: { order_item_id: true },
    });
    const returnedItemIds = returnedRows.map((r) => r.order_item_id);

    const eligibility = { can_return: false, can_cancel: false, reason: "", days_since_delivery: 0 };
    const item_eligibility = {};

    if (isCOD(order.payment_method)) {
      eligibility.reason = "COD orders cannot be cancelled or returned as per policy.";
      order.order_items?.forEach((item) => {
        item_eligibility[item.id] = { is_eligible: false, reason: "COD orders are non-returnable", return_days: 0, remaining_days: 0 };
      });
    } else if (order.status?.toLowerCase() === "delivered") {
      const days = daysSince(order.updated_at || order.created_at);
      eligibility.days_since_delivery = days;
      let anyEligible = false;

      order.order_items?.forEach((item) => {
        const returnDays = item.variant?.product?.return_days || 7;
        const alreadyReturned = returnedItemIds.includes(item.id);
        const inWindow = days <= returnDays && days >= 0;
        const eligible = !alreadyReturned && inWindow;
        if (eligible) anyEligible = true;

        item_eligibility[item.id] = {
          is_eligible: eligible,
          reason: alreadyReturned ? "Already returned" : inWindow ? `Eligible (${returnDays}-day window)` : `Return window expired (${returnDays} days)`,
          return_days: returnDays,
          remaining_days: Math.max(0, returnDays - days),
        };
      });

      eligibility.can_return = anyEligible;
      if (!anyEligible) eligibility.reason = "Return window has expired for all items.";
    } else if (["pending", "confirmed", "processing", "shipped"].includes(order.status?.toLowerCase())) {
      eligibility.can_cancel = true;
      eligibility.reason = "Order can be cancelled as it hasn't been delivered yet.";
    } else {
      eligibility.reason = "This order is not eligible for return or cancellation.";
    }

    return res.json({
      success: true,
      order_status: order.status,
      eligibility: { ...eligibility, item_eligibility },
      returned_item_ids: returnedItemIds,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ---------------------------------------------------------------------------
// Create return / cancellation request
// ---------------------------------------------------------------------------
export const createReturnRequest = async (req, res) => {
  const {
    order_id, user_id, return_type, reason, additional_details,
    refund_mode = "bank_transfer",
    bank_account_holder_name, bank_account_number, bank_ifsc_code, bank_name,
    items = [],
  } = req.body;

  const isWallet = refund_mode === "wallet";

  try {
    if (!order_id || !user_id || !return_type || !reason) {
      return res.status(400).json({ success: false, error: "order_id, user_id, return_type and reason are required" });
    }

    const order = await orderDao.getById(order_id);
    if (!order || order.user_id !== user_id) {
      return res.status(404).json({ success: false, error: "Order not found or doesn't belong to user" });
    }

    // COD: no cancellation, no return
    if (isCOD(order.payment_method)) {
      return res.status(400).json({ success: false, error: "COD orders cannot be cancelled or returned as per policy." });
    }

    // Bank details required only for bank_transfer refund mode
    if (!isWallet && (!bank_account_holder_name || !bank_account_number || !bank_ifsc_code || !bank_name)) {
      return res.status(400).json({ success: false, error: "Bank details are required for bank transfer refunds" });
    }

    const orderStatus = order.status?.toLowerCase();
    let isEligible = false;

    if (return_type === "return") {
      if (orderStatus !== "delivered") {
        return res.status(400).json({ success: false, error: "Only delivered orders can be returned" });
      }
      if (items.length === 0) {
        return res.status(400).json({ success: false, error: "Select at least one item to return" });
      }

      const days = daysSince(order.updated_at || order.created_at);
      const expired = [];
      items.forEach((ri) => {
        const oi = order.order_items?.find((o) => o.id === ri.order_item_id);
        if (oi) {
          const window = oi.variant?.product?.return_days || 7;
          if (days > window) expired.push(oi.variant?.product?.name || ri.order_item_id);
        }
      });
      if (expired.length > 0) {
        return res.status(400).json({ success: false, error: `Return window expired for: ${expired.join(", ")}` });
      }

      // Check for already-returned items
      const alreadyReturned = await prisma.return_order_items.findFirst({
        where: { order_item_id: { in: items.map((i) => i.order_item_id) } },
      });
      if (alreadyReturned) {
        return res.status(400).json({ success: false, error: "One or more selected items have already been returned." });
      }
      isEligible = true;
    } else if (return_type === "cancellation") {
      isEligible = ["pending", "confirmed", "processing", "shipped"].includes(orderStatus);
    }

    if (!isEligible) {
      return res.status(400).json({ success: false, error: "Order is not eligible for this request type" });
    }

    // Calculate refund amount — product price only (no shipping/platform/handling charges)
    // + optional admin-configured refund percentage bonus on top of product subtotal
    const refundPct = await getRefundPercentage();
    let refund_amount = 0;

    if (return_type === "cancellation") {
      // Use order.subtotal (product-only amount) — excludes shipping, handling, platform, surge charges
      const productSubtotal = Number(order.subtotal);
      refund_amount = parseFloat((productSubtotal * (1 - refundPct / 100)).toFixed(2));
    } else {
      const orderItemIds = items.map((i) => i.order_item_id);
      const orderItems = await prisma.order_items.findMany({ where: { id: { in: orderItemIds } } });
      const itemSubtotal = orderItems.reduce((sum, oi) => {
        const qty = items.find((i) => i.order_item_id === oi.id)?.quantity || 0;
        return sum + Number(oi.price) * qty;
      }, 0);
      refund_amount = parseFloat((itemSubtotal * (1 - refundPct / 100)).toFixed(2));
    }

    const returnOrder = await returnOrderDao.create(
      {
        order_id, user_id, return_type, reason, additional_details,
        refund_mode,
        ...(!isWallet && { bank_account_holder_name, bank_account_number, bank_ifsc_code, bank_name }),
        refund_amount,
        status: "pending",
      },
      items
    );

    // Update order status immediately for cancellations
    if (return_type === "cancellation") {
      await orderDao.update(order_id, { status: "cancelled" });
    }

    await notifyReturnCreated({ userId: user_id, orderId: order_id, returnId: returnOrder.id, returnType: return_type });

    return res.json({ success: true, return_order: returnOrder, message: "Return request created successfully" });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ---------------------------------------------------------------------------
// Get user's return requests
// ---------------------------------------------------------------------------
export const getUserReturnRequests = async (req, res) => {
  const { user_id } = req.params;
  const { limit = 10, offset = 0 } = req.query;
  try {
    const data = await returnOrderDao.listByUser(user_id, limit, offset);
    return res.json({ success: true, return_requests: data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ---------------------------------------------------------------------------
// Get all return requests (admin)
// ---------------------------------------------------------------------------
export const getAllReturnRequests = async (req, res) => {
  const { limit = 50, offset = 0, status } = req.query;
  try {
    const data = await returnOrderDao.listAll({ status }, limit, offset);
    return res.json({ success: true, return_requests: data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ---------------------------------------------------------------------------
// Update return status (admin)
// ---------------------------------------------------------------------------
export const updateReturnRequestStatus = async (req, res) => {
  const { id } = req.params;
  const { status, admin_notes, admin_id } = req.body;
  try {
    if (!id || !status) {
      return res.status(400).json({ success: false, error: "id and status are required" });
    }

    const valid = ["pending", "approved", "rejected", "processing", "completed"];
    if (!valid.includes(status)) {
      return res.status(400).json({ success: false, error: "Invalid status" });
    }

    const existing = await returnOrderDao.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Return order not found" });
    }

    const updateData = {
      status,
      admin_notes: admin_notes || existing.admin_notes,
      ...(admin_id && { admin_id }),
      ...(status === "completed" && { processed_at: new Date() }),
    };

    const updated = await returnOrderDao.update(id, updateData);

    await notifyReturnStatusUpdated({
      userId: existing.user_id,
      returnId: id,
      status,
      returnType: existing.return_type,
    });

    return res.json({ success: true, return_request: updated, message: "Return request updated successfully", notification_sent: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ---------------------------------------------------------------------------
// Get return request details
// ---------------------------------------------------------------------------
export const getReturnRequestDetails = async (req, res) => {
  const { id } = req.params;
  try {
    const data = await returnOrderDao.findById(id);
    if (!data) {
      return res.status(404).json({ success: false, error: "Return request not found" });
    }

    const return_items = data.return_order_items?.map((item) => ({
      ...item,
      order_items: { ...item.order_items, products: item.order_items?.product_variants?.product },
    })) || [];

    return res.json({ success: true, return_request: { ...data, return_items } });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ---------------------------------------------------------------------------
// Delete return request (admin)
// ---------------------------------------------------------------------------
export const deleteReturnRequest = async (req, res) => {
  const { id } = req.params;
  try {
    await returnOrderDao.delete(id);
    return res.json({ success: true, message: "Return request deleted successfully" });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
