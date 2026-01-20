import prisma from "../config/prisma.js";
import OrderDAO from "./order.dao.js";
import OrderTrackingDAO from "./order-tracking.dao.js";

/**
 * Tracking DAO - Wrapper for order tracking operations
 * Combines OrderDAO and OrderTrackingDAO for complete tracking functionality
 */
class TrackingDAO {
  /**
   * Get order with complete tracking history and items
   * @param {string} orderId - Order ID
   * @returns {Promise<Object>} Order with tracking history
   */
  async getOrderWithTracking(orderId) {
    return await prisma.orders.findUnique({
      where: { id: orderId },
      include: {
        order_items: {
          include: {
            variant: {
              include: {
                product: {
                  select: {
                    name: true,
                    images: true,
                  },
                },
              },
            },
          },
        },
        order_tracking: {
          orderBy: {
            timestamp: "asc",
          },
        },
      },
    });
  }

  /**
   * Get order by tracking number with full details
   * @param {string} trackingNumber - Tracking number
   * @returns {Promise<Object>} Order with tracking history
   */
  async getByTrackingNumber(trackingNumber) {
    return await prisma.orders.findFirst({
      where: { tracking_number: trackingNumber },
      include: {
        order_items: {
          include: {
            variant: {
              include: {
                product: {
                  select: {
                    name: true,
                    images: true,
                  },
                },
              },
            },
          },
        },
        order_tracking: {
          orderBy: {
            timestamp: "asc",
          },
        },
      },
    });
  }

  /**
   * Add tracking update and update order status
   * @param {Object} trackingData - Tracking update data
   * @param {string} trackingData.order_id - Order ID
   * @param {string} trackingData.status - Status
   * @param {string} trackingData.location - Location
   * @param {string} trackingData.description - Description
   * @returns {Promise<Object>} Created tracking entry
   */
  async addTrackingUpdate(trackingData) {
    const { order_id, status, location, description } = trackingData;

    // Create tracking entry
    const tracking = await OrderTrackingDAO.create({
      order_id,
      status,
      location,
      description,
      timestamp: new Date(),
    });

    // Update order status and location
    await OrderDAO.update(order_id, {
      status,
      current_location: location,
    });

    return tracking;
  }

  /**
   * Update order status and location
   * @param {string} orderId - Order ID
   * @param {string} status - New status
   * @param {string} location - Current location
   * @returns {Promise<Object>} Updated order
   */
  async updateOrderStatus(orderId, status, location) {
    return await OrderDAO.update(orderId, {
      status,
      current_location: location,
    });
  }

  /**
   * Get tracking history for an order
   * @param {string} orderId - Order ID
   * @returns {Promise<Array>} Tracking history
   */
  async getTrackingHistory(orderId) {
    return await OrderTrackingDAO.getTrackingHistory(orderId);
  }
}

export default new TrackingDAO();
