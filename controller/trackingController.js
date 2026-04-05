import TrackingDAO from "../dao/tracking.dao.js";
import prisma from "../config/prisma.js";

/**
 * Tracking Controller - Routes for order tracking operations
 * Updated to use tracking.dao.js
 */

// Get order tracking by order ID
export const getOrderTracking = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await TrackingDAO.getOrderWithTracking(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Sort tracking by timestamp
    const tracking =
      order.tracking?.sort(
        (a, b) => new Date(a.timestamp) - new Date(b.timestamp),
      ) || [];

    // Include delivery OTP from confirmed sub-orders
    const subOrdersWithOtp = await prisma.sub_orders.findMany({
      where: { parent_order_id: orderId, fulfillment_status: { not: 'cancelled' } },
      select: { id: true, fulfillment_status: true, pickup_sequence: true },
    });

    const deliveryOtps = subOrdersWithOtp
      .filter(so => {
        const meta = typeof so.pickup_sequence === 'object' && !Array.isArray(so.pickup_sequence)
          ? so.pickup_sequence : null;
        return meta?.otp;
      })
      .map(so => {
        const meta = so.pickup_sequence;
        return { sub_order_id: so.id, otp: meta.otp, status: so.fulfillment_status };
      });

    res.json({
      success: true,
      order,
      tracking,
      delivery_otps: deliveryOtps,
    });
  } catch (error) {
    console.error("Error fetching order tracking:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch tracking information",
    });
  }
};

// Add tracking update (Admin only)
export const addTrackingUpdate = async (req, res) => {
  try {
    const { orderId, status, location, description } = req.body;

    // Validate required fields
    if (!orderId || !status || !location) {
      return res.status(400).json({
        success: false,
        message: "Order ID, status, and location are required",
      });
    }

    const tracking = await TrackingDAO.addTrackingUpdate({
      order_id: orderId,
      status,
      location,
      description: description || `Order ${status.toLowerCase()}`,
    });

    res.json({
      success: true,
      tracking,
    });
  } catch (error) {
    console.error("Error adding tracking update:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add tracking update",
    });
  }
};

// Search order by tracking number
export const searchByTrackingNumber = async (req, res) => {
  try {
    const { trackingNumber } = req.params;

    if (!trackingNumber) {
      return res.status(400).json({
        success: false,
        message: "Tracking number is required",
      });
    }

    const order = await TrackingDAO.getByTrackingNumber(trackingNumber);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found with this tracking number",
      });
    }

    // Sort tracking by timestamp
    const tracking =
      order.tracking?.sort(
        (a, b) => new Date(a.timestamp) - new Date(b.timestamp),
      ) || [];

    res.json({
      success: true,
      order,
      tracking,
    });
  } catch (error) {
    console.error("Error searching by tracking number:", error);
    res.status(500).json({
      success: false,
      message: "Failed to search order",
    });
  }
};
