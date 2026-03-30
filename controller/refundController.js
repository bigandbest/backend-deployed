import refundRequestDao from "../dao/refundRequest.dao.js";
import orderDao from "../dao/order.dao.js";
import prisma from "../config/prisma.js";
import { notifyRefundCreated, notifyRefundStatusUpdated } from "../services/notificationService.js";

const getRefundPercentage = async () => {
  try {
    const settings = await prisma.charge_settings.findUnique({ where: { id: 1 } });
    return Number(settings?.refund_percentage ?? 0);
  } catch {
    return 0;
  }
};

// Create refund request for a cancelled prepaid order
export const createRefundRequest = async (req, res) => {
  try {
    const { orderId, refundType = "order_cancellation", bankDetails } = req.body;
    const userId = req.user?.id;

    if (!orderId) {
      return res.status(400).json({ success: false, error: "Order ID is required" });
    }

    const order = await orderDao.getById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }

    if (userId && order.user_id !== userId) {
      return res.status(403).json({ success: false, error: "Unauthorized to create refund for this order" });
    }

    if (order.status !== "cancelled") {
      return res.status(400).json({ success: false, error: "Only cancelled orders are eligible for refund" });
    }

    const isCOD = ["cod", "cash", "cash on delivery"].some((m) =>
      order.payment_method?.toLowerCase().includes(m)
    );
    if (isCOD) {
      return res.status(400).json({ success: false, error: "COD orders are not eligible for refunds" });
    }

    const existing = await refundRequestDao.findByOrderId(orderId);
    if (existing) {
      return res.status(400).json({ success: false, error: "Refund request already exists for this order" });
    }

    // Refund = product subtotal only (no shipping/platform/handling charges)
    // + admin-configured refund percentage on top of product subtotal
    const refundPct = await getRefundPercentage();
    const productSubtotal = Number(order.subtotal);
    const refundAmount = parseFloat((productSubtotal * (1 - refundPct / 100)).toFixed(2));

    const refundData = {
      order_id: orderId,
      user_id: order.user_id,
      refund_amount: refundAmount,
      refund_type: refundType,
      payment_method: order.payment_method,
      original_payment_id: order.razorpay_payment_id || null,
      refund_mode: "bank_transfer",
      status: "pending",
      ...(bankDetails && {
        bank_account_holder_name: bankDetails.accountHolderName,
        bank_account_number: bankDetails.accountNumber,
        bank_ifsc_code: bankDetails.ifscCode,
        bank_name: bankDetails.bankName,
      }),
    };

    const refundRequest = await refundRequestDao.create(refundData);

    await notifyRefundCreated({
      userId: order.user_id,
      orderId,
      refundId: refundRequest.id,
      amount: refundAmount,
    });

    return res.json({
      success: true,
      message: "Refund request created successfully",
      refundRequest: {
        id: refundRequest.id,
        orderId,
        amount: refundAmount,
        status: "pending",
        refundMode: "bank_transfer",
      },
    });
  } catch (error) {
    console.error("createRefundRequest error:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Get current user's refund requests
export const getUserRefundRequests = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { page = 1, limit = 10 } = req.query;

    if (!userId) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }

    const { data, total } = await refundRequestDao.listByUser(userId, page, limit);
    const totalPages = Math.ceil(total / limit);

    return res.json({
      success: true,
      refundRequests: data,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages,
    });
  } catch (error) {
    console.error("getUserRefundRequests error:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Get all refund requests (admin)
export const getAllRefundRequests = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, refundType } = req.query;

    const { data, total } = await refundRequestDao.listAll({ status, refundType }, page, limit);
    const totalPages = Math.ceil(total / limit);

    return res.json({
      success: true,
      refundRequests: data,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages,
    });
  } catch (error) {
    console.error("getAllRefundRequests error:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Update refund request status (admin)
export const updateRefundRequestStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNotes } = req.body;
    const adminId = req.user?.id;

    if (!status) {
      return res.status(400).json({ success: false, error: "Status is required" });
    }

    const validStatuses = ["pending", "approved", "processing", "completed", "rejected"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: "Invalid status" });
    }

    const existing = await refundRequestDao.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Refund request not found" });
    }

    const updateData = {
      status,
      admin_notes: adminNotes || existing.admin_notes,
      processed_by: adminId || null,
      ...(["processing", "completed"].includes(status) && { processed_at: new Date() }),
    };

    await refundRequestDao.update(id, updateData);

    await notifyRefundStatusUpdated({
      userId: existing.user_id,
      refundId: id,
      status,
      amount: Number(existing.refund_amount),
    });

    return res.json({ success: true, message: `Refund request ${status} successfully` });
  } catch (error) {
    console.error("updateRefundRequestStatus error:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};
