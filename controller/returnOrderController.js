// controllers/returnOrderController.js
import returnOrderDao from "../dao/returnOrder.dao.js";
import orderDao from "../dao/order.dao.js";
import prisma from "../config/prisma.js"; // For direct checks if needed

// Helper function to calculate days since order delivery
const calculateDaysSinceDelivery = (orderDate, orderStatus) => {
  if (orderStatus?.toLowerCase() !== "delivered") return -1;
  if (!orderDate) return -1; // Handle null/undefined dates

  const deliveryDate = new Date(orderDate);
  const currentDate = new Date();

  // Check if date is valid
  if (isNaN(deliveryDate.getTime())) return -1;

  const diffTime = Math.abs(currentDate - deliveryDate);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  console.log("Date calculation debug:", {
    orderDate,
    deliveryDate: deliveryDate.toISOString(),
    currentDate: currentDate.toISOString(),
    diffTime,
    diffDays,
  });

  return diffDays;
};

// Helper function to generate notification messages
const getNotificationMessage = (status, return_type) => {
  const actionType = return_type === "cancellation" ? "cancellation" : "return";

  switch (status) {
    case "approved":
      return `Your ${actionType} request has been approved. Refund processing will begin shortly.`;
    case "rejected":
      return `Your ${actionType} request has been declined. Please contact support for more details.`;
    case "processing":
      return `Your ${actionType} request is being processed. Refund will be credited soon.`;
    case "completed":
      return `Your ${actionType} has been completed successfully. Refund amount has been credited to your account.`;
    default:
      return `Your ${actionType} request status has been updated to ${status}.`;
  }
};

// Test database connection and tables
export const testDatabase = async (req, res) => {
  try {
    // Test if return_orders table exists via Prisma
    const returnOrdersCount = await prisma.return_orders.count();

    // Notifications check skipped (Supabase dependent)

    return res.json({
      success: true,
      message: "Database connection test (Prisma)",
      tables: {
        return_orders: {
          exists: true,
          count: returnOrdersCount,
        },
        notifications: {
          exists: "unknown (Prisma)",
          count: 0,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// Check if order is eligible for return/cancellation
export const checkReturnEligibility = async (req, res) => {
  const { order_id } = req.params;

  try {
    const order = await orderDao.getById(order_id);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: "Order not found",
      });
    }

    // Check for existing return items to mark them as ineligible
    const existingReturnItems = await prisma.return_order_items.findMany({
      where: {
        return_order: {
          order_id: order_id
        }
      },
      select: {
        order_item_id: true
      }
    });

    const returnedItemIds = existingReturnItems.map(item => item.order_item_id);

    // If all items are returned, then can_return might be false, but for now we let the frontend handle the disabling
    // We just pass returnedItemIds to the frontend


    let eligibility = {
      can_return: false,
      can_cancel: false,
      reason: "",
      days_since_delivery: 0,
    };

    let item_eligibility = {};
    let atLeastOneEligible = false;

    const isCODOrder = ["cod", "cash", "cash on delivery"].some(method =>
      order.payment_method?.toLowerCase().includes(method)
    );

    if (isCODOrder) {
      eligibility.can_return = false;
      eligibility.can_cancel = false;
      eligibility.reason = "COD orders cannot be cancelled or returned as per policy.";

      // Also mark all items as ineligible for COD
      order.order_items.forEach(item => {
        item_eligibility[item.id] = {
          is_eligible: false,
          reason: "COD orders are non-returnable",
          return_days: 0,
          remaining_days: 0
        };
      });

      eligibility.item_eligibility = item_eligibility;
    } else if (order.status?.toLowerCase() === "delivered") {
      const deliveryDate = order.updated_at || order.created_at;
      const daysSinceDelivery = calculateDaysSinceDelivery(deliveryDate, order.status);

      order.order_items.forEach(item => {
        const productReturnDays = item.variant?.product?.return_days || 7;
        const isAlreadyReturned = returnedItemIds.includes(item.id);
        const isWindowValid = daysSinceDelivery <= productReturnDays && daysSinceDelivery >= 0;

        const eligible = !isAlreadyReturned && isWindowValid;
        if (eligible) atLeastOneEligible = true;

        item_eligibility[item.id] = {
          is_eligible: eligible,
          reason: isAlreadyReturned
            ? "Already returned"
            : isWindowValid
              ? `Eligible for return (Window: ${productReturnDays} days)`
              : `Return window expired (${productReturnDays} days)`,
          return_days: productReturnDays,
          remaining_days: Math.max(0, productReturnDays - daysSinceDelivery)
        };
      });

      eligibility.can_return = atLeastOneEligible;
      eligibility.days_since_delivery = daysSinceDelivery;
      eligibility.item_eligibility = item_eligibility;

    } else if (["pending", "confirmed", "processing", "shipped"].includes(order.status?.toLowerCase())) {
      eligibility.can_cancel = true;
      eligibility.reason = "Order can be cancelled as it hasn't been delivered yet.";
    } else {
      eligibility.reason = "This order is not eligible for return or cancellation.";
    }

    return res.json({
      success: true,
      order_status: order.status,
      eligibility,
      returned_item_ids: returnedItemIds,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// Create return/cancellation request
export const createReturnRequest = async (req, res) => {
  const {
    order_id,
    user_id,
    return_type, // 'return' or 'cancellation'
    reason,
    additional_details,
    bank_account_holder_name,
    bank_account_number,
    bank_ifsc_code,
    bank_name,
    items = [], // For partial returns
  } = req.body;

  try {
    // 1. Basic Validation
    if (!order_id || !user_id || !return_type || !reason) {
      return res.status(400).json({
        success: false,
        error: "Order ID, User ID, Return Type, and Reason are required",
      });
    }

    // 2. Fetch Order
    // Assuming getById returns order even if user_id doesn't match?
    // Ideally check user_id. OrderDAO doesn't enforce user_id check in getById.
    const order = await orderDao.getById(order_id);

    if (!order || order.user_id !== user_id) {
      return res.status(404).json({
        success: false,
        error: "Order not found or doesn't belong to user",
      });
    }

    // 3. Bank Details are ALWAYS required for refunds
    if (
      !bank_account_holder_name ||
      !bank_account_number ||
      !bank_ifsc_code ||
      !bank_name
    ) {
      return res.status(400).json({
        success: false,
        error: "Bank details are required for processing refunds",
      });
    }

    // 4. Check Eligibility
    let isEligible = false;
    const orderStatus = order.status?.toLowerCase();

    // Block COD orders from cancellation and return
    const isCODOrder = ["cod", "cash", "cash on delivery"].some(method =>
      order.payment_method?.toLowerCase().includes(method)
    );

    if (isCODOrder) {
      return res.status(400).json({
        success: false,
        error: "COD orders cannot be cancelled or returned as per policy.",
      });
    }

    if (return_type === "return") {
      if (orderStatus === "delivered") {
        const daysSince = calculateDaysSinceDelivery(
          order.updated_at || order.created_at,
          order.status,
        );

        // Validate each item's return window
        if (items && items.length > 0) {
          const ineligibleItems = [];

          items.forEach(requestedItem => {
            const orderItem = order.order_items.find(oi => oi.id === requestedItem.order_item_id);
            if (orderItem) {
              const productReturnDays = orderItem.variant?.product?.return_days || 7;
              if (daysSince > productReturnDays) {
                ineligibleItems.push(orderItem.variant?.product?.name || "Unknown Item");
              }
            }
          });

          if (ineligibleItems.length > 0) {
            return res.status(400).json({
              success: false,
              error: `Return window expired for: ${ineligibleItems.join(", ")}`
            });
          }
          isEligible = true;
        } else {
          // Fallback for full order return legacy support (assume 7 days if no items specified, though strict item mode is preferred)
          isEligible = daysSince <= 7 && daysSince >= 0;
        }

      }
    } else if (return_type === "cancellation") {
      isEligible = ["pending", "confirmed", "processing", "shipped"].includes(orderStatus);
    }

    // 4.1 Check if Items are already returned
    if (items && items.length > 0) {
      const itemIds = items.map(item => item.order_item_id);

      const alreadyReturned = await prisma.return_order_items.findFirst({
        where: {
          order_item_id: { in: itemIds }
        }
      });

      if (alreadyReturned) {
        return res.status(400).json({
          success: false,
          error: "One or more items in this request have already been returned/requested."
        });
      }
    }

    if (!isEligible) {
      return res.status(400).json({
        success: false,
        error: "Order is not eligible for this type of request",
      });
    }

    // 5. Calculate Refund Amount & Initial Status
    let refund_amount = 0;
    let initial_status = "pending";
    let processed_at = null;

    // Determine if it's a COD order
    const isCOD = ["cod", "cash", "cash on delivery"].some(method =>
      order.payment_method?.toLowerCase().includes(method)
    );

    if (return_type === "cancellation") {
      if (isCOD) {
        refund_amount = 0;
        initial_status = "completed";
        processed_at = new Date();
      } else {
        refund_amount = Number(order.total);
        initial_status = "pending";
      }
    } else {
      // Calculate refund based on items
      if (items && items.length > 0) {
        // Fetch order items to calculate refund for the selected items
        const orderItems = await prisma.order_items.findMany({
          where: { id: { in: items.map(i => i.order_item_id) } }
        });

        const itemsTotal = orderItems.reduce((sum, item) => {
          const requestedQty = items.find(i => i.order_item_id === item.id)?.quantity || 0;
          return sum + (Number(item.price) * requestedQty);
        }, 0);

        refund_amount = itemsTotal;
      } else {
        // Fallback if no items provided (shouldn't happen for valid return)
        refund_amount = Number(order.total) - (Number(order.shipping) || 0);
      }
      initial_status = "pending";
    }

    // 6. Create return request via DAO
    const returnOrder = await returnOrderDao.create(
      {
        order_id,
        user_id,
        return_type,
        reason,
        additional_details,
        bank_account_holder_name: bank_account_holder_name,
        bank_account_number: bank_account_number,
        bank_ifsc_code: bank_ifsc_code,
        bank_name: bank_name,
        refund_amount,
        status: initial_status,
      },
      items,
    );

    // 8. Notifications (Skipped/To-do)

    // 9. Update Order Status
    if (return_type === "cancellation") {
      await orderDao.update(order_id, { status: "cancelled" });
    }

    return res.json({
      success: true,
      return_order: returnOrder,
      message: "Return request created successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// Get user's return requests
export const getUserReturnRequests = async (req, res) => {
  const { user_id } = req.params;
  const { limit = 10, offset = 0 } = req.query;

  try {
    const data = await returnOrderDao.listByUser(user_id, limit, offset);

    return res.json({
      success: true,
      return_requests: data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// Get all return requests (admin)
export const getAllReturnRequests = async (req, res) => {
  const { limit = 50, offset = 0, status } = req.query;

  try {
    const data = await returnOrderDao.listAll({ status }, limit, offset);

    return res.json({
      success: true,
      return_requests: data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// Update return request status (admin)
export const updateReturnRequestStatus = async (req, res) => {
  const { id } = req.params;
  const { status, admin_notes, admin_id } = req.body;

  try {
    if (!id || !status) {
      return res
        .status(400)
        .json({ success: false, error: "ID and Status required" });
    }

    const validStatuses = [
      "pending",
      "approved",
      "rejected",
      "processing",
      "completed",
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: "Invalid status" });
    }

    const existingReturn = await returnOrderDao.findById(id);
    if (!existingReturn) {
      return res
        .status(404)
        .json({ success: false, error: "Return order not found" });
    }

    const updateData = {
      status,
      admin_notes,
    };

    if (admin_id && admin_id !== "admin-user-id") {
      // Validate UUID if necessary or trust the input if authenticated admin
      updateData.admin_id = admin_id;
    }

    if (status === "completed") {
      updateData.processed_at = new Date();
    }

    const updatedReturn = await returnOrderDao.update(id, updateData);

    // Notifications (Skipped)

    return res.json({
      success: true,
      return_request: updatedReturn,
      message: "Return request updated successfully",
      notification_sent: false,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// Get return request details
export const getReturnRequestDetails = async (req, res) => {
  const { id } = req.params;

  try {
    const data = await returnOrderDao.findById(id);

    if (!data) {
      return res.status(404).json({
        success: false,
        error: "Return request not found",
      });
    }

    // Data already has includes structure from DAO
    // Map existing structure if frontend expects `return_items` at top level
    const return_items =
      data.return_order_items?.map((item) => ({
        ...item,
        order_items: {
          ...item.order_item,
          products: item.order_item?.product_variants?.product, // Approximate mapping
        },
      })) || [];

    return res.json({
      success: true,
      return_request: {
        ...data,
        return_items,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// Delete return request (admin only)
export const deleteReturnRequest = async (req, res) => {
  const { id } = req.params;

  try {
    await returnOrderDao.delete(id);

    return res.json({
      success: true,
      message: "Return request deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
