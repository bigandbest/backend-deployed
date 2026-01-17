// controllers/enquiryController.js
import enquiryDao from "../dao/enquiry.dao.js";
import productDao from "../dao/product.dao.js";
import userNotificationDao from "../dao/user-notification.dao.js";
import enquiryMessageDao from "../dao/enquiry-message.dao.js";
import generalEnquiryDao from "../dao/general-enquiry.dao.js";
// import notificationDao from "../dao/notification.dao.js";
import userDAO from "../dao/user.dao.js";

// --- Product Enquiry Controllers ---

/**
 * Create a new product enquiry
 * POST /api/enquiries
 */
export const createEnquiry = async (req, res) => {
  try {
    const { user_id, product_id, variant_id, quantity, message, expected_price } = req.body;

    // Validate required fields
    if (!user_id || !product_id || !quantity) {
      return res.status(400).json({
        success: false,
        error: "user_id, product_id, and quantity are required",
      });
    }

    // Verify product exists
    const product = await productDao.getProductById(product_id);

    if (!product) {
      return res.status(404).json({
        success: false,
        error: "Product not found",
      });
    }

    // Create enquiry
    const enquiry = await enquiryDao.createEnquiry({
      user_id,
      product_id,
      variant_id: variant_id || null,
      quantity: parseInt(quantity),
      message: message || null,
      expected_price: expected_price ? parseFloat(expected_price) : null,
      status: "OPEN",
    });

    // Create admin notification
    await userNotificationDao.create({
      type: "admin",
      title: "New Product Enquiry",
      message: `New enquiry for ${product.name} - Quantity: ${quantity}`,
      related_type: "enquiry",
      related_id: enquiry.id.toString(),
      is_read: false,
    });

    // Send initial auto-message to user
    await enquiryMessageDao.create({
      enquiry_id: enquiry.id,
      sender_type: "ADMIN",
      sender_id: user_id, // System message
      sender_name: "System",
      message: "Thank you for your enquiry. Our team will review and respond shortly.",
    });

    return res.status(201).json({
      success: true,
      enquiry,
    });
  } catch (error) {
    console.error("Unexpected error in createEnquiry:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

/**
 * Get all enquiries for logged-in user
 * GET /api/enquiries/my
 */
export const getUserEnquiries = async (req, res) => {
  try {
    const { user_id, status, page = 1, limit = 10 } = req.query;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        error: "user_id is required",
      });
    }

    const { data, count } = await enquiryDao.listEnquiries(
      { user_id, status },
      { page: parseInt(page), limit: parseInt(limit) }
    );

    return res.json({
      success: true,
      enquiries: data || [],
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Unexpected error in getUserEnquiries:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

/**
 * Get single enquiry details with messages and bids
 * GET /api/enquiries/:id
 */
export const getEnquiryDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.query;

    const enquiry = await enquiryDao.getEnquiryById(parseInt(id));

    if (!enquiry) {
      return res.status(404).json({
        success: false,
        error: "Enquiry not found",
      });
    }

    // Verify user owns this enquiry (unless admin)
    if (user_id && enquiry.user_id !== user_id) {
      return res.status(403).json({
        success: false,
        error: "Unauthorized access to this enquiry",
      });
    }

    return res.json({
      success: true,
      enquiry,
      messages: enquiry.messages || [],
      bids: enquiry.bids || [],
    });
  } catch (error) {
    console.error("Unexpected error in getEnquiryDetails:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

/**
 * Accept a bid offer
 * POST /api/enquiries/:id/accept-bid
 */
export const acceptBid = async (req, res) => {
  try {
    const { id } = req.params; // enquiry_id
    const { bid_id, user_id } = req.body;

    if (!bid_id || !user_id) {
      return res.status(400).json({
        success: false,
        error: "bid_id and user_id are required",
      });
    }

    const enquiry = await enquiryDao.getEnquiryById(parseInt(id));

    if (!enquiry || enquiry.user_id !== user_id) {
      return res.status(404).json({
        success: false,
        error: "Enquiry not found or unauthorized",
      });
    }

    const bid = enquiry.bids.find(b => b.id === parseInt(bid_id));

    if (!bid) {
      return res.status(404).json({
        success: false,
        error: "Bid not found",
      });
    }

    if (bid.status !== "ACTIVE") {
      return res.status(400).json({
        success: false,
        error: "Bid is no longer active",
      });
    }

    if (new Date(bid.expires_at) < new Date()) {
      return res.status(400).json({
        success: false,
        error: "Bid has expired",
      });
    }

    // Update bid and enquiry status (Should ideally be a transaction in DAO)
    await enquiryDao.updateEnquiry(parseInt(id), { status: "NEGOTIATING" });

    await enquiryMessageDao.create({
      enquiry_id: parseInt(id),
      sender_type: "USER",
      sender_id: user_id,
      sender_name: "User",
      message: "I accept this bid offer.",
    });

    await userNotificationDao.create({
      type: "admin",
      title: "Bid Accepted",
      message: `User accepted bid for enquiry #${id}`,
      related_type: "bid",
      related_id: bid_id.toString(),
      is_read: false,
    });

    return res.json({
      success: true,
      message: "Bid accepted successfully",
    });
  } catch (error) {
    console.error("Unexpected error in acceptBid:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

/**
 * Get all enquiries (Admin only)
 * GET /api/enquiries/admin/all
 */
export const getAllEnquiries = async (req, res) => {
  try {
    const { status, page = 1, limit = 20, search } = req.query;

    const { data, count } = await enquiryDao.listAll(
      { status, search },
      { page: parseInt(page), limit: parseInt(limit) }
    );

    const userIds = [...new Set(data.map(e => e.user_id).filter(Boolean))];
    if (userIds.length > 0) {
      const users = await userDAO.getUsersByIds(userIds);
      const userMap = {};
      users.forEach(u => { userMap[u.id] = u; });
      data.forEach(enquiry => {
        enquiry.users = userMap[enquiry.user_id] || null;
        enquiry.products = enquiry.product;
      });
    }

    return res.json({
      success: true,
      enquiries: data || [],
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Unexpected error in getAllEnquiries:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

/**
 * Update enquiry status (Admin only)
 * PUT /api/enquiries/:id/status
 */
export const updateEnquiryStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, admin_notes } = req.body;

    const validStatuses = ["OPEN", "NEGOTIATING", "LOCKED", "COMPLETED", "EXPIRED", "CLOSED"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: "Invalid status",
      });
    }

    await enquiryDao.updateEnquiry(parseInt(id), {
      status,
      ...(admin_notes && { admin_notes })
    });

    return res.json({
      success: true,
      message: "Enquiry status updated successfully",
    });
  } catch (error) {
    console.error("Unexpected error in updateEnquiryStatus:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

/**
 * Close enquiry (Admin only)
 * POST /api/enquiries/:id/close
 */
export const closeEnquiry = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    await enquiryDao.updateEnquiry(parseInt(id), {
      status: "CLOSED",
      closed_reason: reason || "Closed by admin",
      closed_by: "ADMIN",
    });

    return res.json({
      success: true,
      message: "Enquiry closed successfully",
    });
  } catch (error) {
    console.error("Unexpected error in closeEnquiry:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

/**
 * Get enquiries count (Legacy)
 */
export const getEnquiriesCount = async (req, res) => {
  try {
    const { status } = req.query;
    const filters = {
      ...(status && { status }),
      OR: [
        { type: null },
        { type: { not: "custom_printing" } }
      ]
    };
    const count = await generalEnquiryDao.count(filters);
    res.status(200).json({
      success: true,
      count: count || 0,
    });
  } catch (err) {
    console.error("Unexpected error in getEnquiriesCount:", err);
    res.status(500).json({
      success: false,
      error: "An unexpected error occurred",
    });
  }
};

// --- Enquiry Message Controllers ---

/**
 * Send a message in an enquiry chat
 * POST /api/enquiries/messages
 */
export const sendMessage = async (req, res) => {
  try {
    const {
      enquiry_id,
      sender_type, // 'USER' or 'ADMIN'
      sender_id,
      sender_name,
      message,
      attachment_url,
      attachment_type,
    } = req.body;

    if (!enquiry_id || !sender_type || !sender_id || !message) {
      return res.status(400).json({
        success: false,
        error: "enquiry_id, sender_type, sender_id, and message are required",
      });
    }

    const enquiry = await enquiryDao.getEnquiryById(parseInt(enquiry_id));
    if (!enquiry) {
      return res.status(404).json({
        success: false,
        error: "Enquiry not found",
      });
    }

    if (["CLOSED", "EXPIRED", "COMPLETED"].includes(enquiry.status)) {
      return res.status(400).json({
        success: false,
        error: "Cannot send messages to closed, expired, or completed enquiries",
      });
    }

    const newMessage = await enquiryMessageDao.create({
      enquiry_id: parseInt(enquiry_id),
      sender_type,
      sender_id,
      sender_name: sender_name || (sender_type === "ADMIN" ? "Admin" : "User"),
      message,
      attachment_url: attachment_url || null,
      attachment_type: attachment_type || null,
      is_read: false,
    });

    if (enquiry.status === "OPEN") {
      await enquiryDao.updateEnquiry(parseInt(enquiry_id), { status: "NEGOTIATING" });
    }

    if (sender_type === "ADMIN") {
      // Notify user
      await userNotificationDao.create({
        user_id: enquiry.user_id,
        type: "enquiry_update",
        title: "New Message on Enquiry",
        message: `You have a new message regarding your enquiry for ${enquiry.product.name}`,
        related_type: "enquiry",
        related_id: enquiry_id.toString(),
        is_read: false,
      });
    } else {
      // Notify admin
      await userNotificationDao.create({
        type: "admin",
        title: "New Message from User",
        message: `User sent a message in enquiry #${enquiry_id}`,
        related_type: "enquiry",
        related_id: enquiry_id.toString(),
        is_read: false,
      });
    }

    return res.status(201).json({
      success: true,
      message: newMessage,
    });
  } catch (error) {
    console.error("Unexpected error in sendMessage:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

/**
 * Get all messages for an enquiry
 * GET /api/enquiries/:enquiry_id/messages
 */
export const getMessages = async (req, res) => {
  try {
    const { enquiry_id } = req.params;
    const { user_id } = req.query;

    const enquiry = await enquiryDao.getEnquiryById(parseInt(enquiry_id));
    if (!enquiry) {
      return res.status(404).json({
        success: false,
        error: "Enquiry not found",
      });
    }

    if (user_id && enquiry.user_id !== user_id) {
      return res.status(403).json({
        success: false,
        error: "Unauthorized access to this enquiry",
      });
    }

    const messages = await enquiryMessageDao.listByEnquiry(parseInt(enquiry_id));
    return res.json({
      success: true,
      messages: messages || [],
    });
  } catch (error) {
    console.error("Unexpected error in getMessages:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

/**
 * Mark messages as read
 * PUT /api/enquiries/:enquiry_id/messages/read
 */
export const markAsRead = async (req, res) => {
  try {
    const { enquiry_id } = req.params;
    const { sender_type, user_id } = req.body;

    if (!sender_type) {
      return res.status(400).json({ success: false, error: "sender_type is required" });
    }

    const enquiry = await enquiryDao.getEnquiryById(parseInt(enquiry_id));
    if (!enquiry) {
      return res.status(404).json({ success: false, error: "Enquiry not found" });
    }

    if (sender_type === "USER" && user_id && enquiry.user_id !== user_id) {
      return res.status(403).json({ success: false, error: "Unauthorized" });
    }

    await enquiryMessageDao.markAllAsRead(parseInt(enquiry_id));
    return res.json({
      success: true,
      message: "Messages marked as read",
    });
  } catch (error) {
    console.error("Unexpected error in markAsRead:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

/**
 * Get unread message count for an enquiry
 * GET /api/enquiries/:enquiry_id/messages/unread-count
 */
export const getUnreadCount = async (req, res) => {
  try {
    const { enquiry_id } = req.params;
    const { sender_type } = req.query;

    if (!sender_type) {
      return res.status(400).json({ success: false, error: "sender_type query parameter is required" });
    }

    const messages = await enquiryMessageDao.listByEnquiry(parseInt(enquiry_id));
    const countSenderType = sender_type === "USER" ? "ADMIN" : "USER";
    const unreadCount = messages.filter(m => m.sender_type === countSenderType && !m.is_read).length;

    return res.json({
      success: true,
      unread_count: unreadCount || 0,
    });
  } catch (error) {
    console.error("Unexpected error in getUnreadCount:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};
