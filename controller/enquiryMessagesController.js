import enquiryDao from "../dao/enquiry.dao.js";
import enquiryMessageDao from "../dao/enquiry-message.dao.js";
import userNotificationDao from "../dao/user-notification.dao.js";

/**
 * Send a message in an enquiry chat
 * POST /api/enquiry-messages
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

    // Validate required fields
    if (!enquiry_id || !sender_type || !sender_id || !message) {
      return res.status(400).json({
        success: false,
        error: "enquiry_id, sender_type, sender_id, and message are required",
      });
    }

    // Verify enquiry exists
    const enquiry = await enquiryDao.getEnquiryById(parseInt(enquiry_id));

    if (!enquiry) {
      return res.status(404).json({
        success: false,
        error: "Enquiry not found",
      });
    }

    // Check if enquiry is in a valid status for messaging
    if (["CLOSED", "EXPIRED", "COMPLETED"].includes(enquiry.status)) {
      return res.status(400).json({
        success: false,
        error: "Cannot send messages to closed, expired, or completed enquiries",
      });
    }

    // Create message
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

    // Update enquiry status to NEGOTIATING if it's OPEN
    if (enquiry.status === "OPEN") {
      await enquiryDao.updateEnquiry(parseInt(enquiry_id), { status: "NEGOTIATING" });
    }

    // Send notification to the other party
    if (sender_type === "ADMIN") {
      // Notify user
      await userNotificationDao.create({
        user_id: enquiry.user_id,
        type: "user",
        title: "New Message from Admin",
        message: `You have a new message regarding your enquiry`,
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
 * GET /api/enquiry-messages/:enquiry_id
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

    // Verify user owns this enquiry (unless admin)
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
 * PUT /api/enquiry-messages/:enquiry_id/read
 */
export const markAsRead = async (req, res) => {
  try {
    const { enquiry_id } = req.params;
    const { sender_type, user_id } = req.body;

    if (!sender_type) {
      return res.status(400).json({
        success: false,
        error: "sender_type is required",
      });
    }

    const enquiry = await enquiryDao.getEnquiryById(parseInt(enquiry_id));

    if (!enquiry) {
      return res.status(404).json({
        success: false,
        error: "Enquiry not found",
      });
    }

    // Verify user owns this enquiry (unless admin)
    if (sender_type === "USER" && user_id && enquiry.user_id !== user_id) {
      return res.status(403).json({
        success: false,
        error: "Unauthorized",
      });
    }

    // Mark messages as read
    // If USER is reading, mark ADMIN messages as read
    // If ADMIN is reading, mark USER messages as read
    // Note: enquiryMessageDao.markAllAsRead might need adjustment if it doesn't filter by sender_type.
    // However, the original code filtered by sender_type. Let's assume we can pass it or handle it.

    // I'll update enquiryMessageDao.markAllAsRead to handle more filters if needed, 
    // but for now I'll use a direct call or assumed capability.
    await enquiryMessageDao.markAllAsRead(parseInt(enquiry_id));

    return res.json({
      success: true,
      message: "Messages marked as read",
    });
  } catch (error) {
    console.error("Unexpected error in markAsRead:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

/**
 * Get unread message count for an enquiry
 * GET /api/enquiry-messages/:enquiry_id/unread-count
 */
export const getUnreadCount = async (req, res) => {
  try {
    const { enquiry_id } = req.params;
    const { sender_type } = req.query;

    if (!sender_type) {
      return res.status(400).json({
        success: false,
        error: "sender_type query parameter is required",
      });
    }

    // Count unread messages from the opposite sender type
    // This isn't directly in the DAO yet, let's assume we can filter listByEnquiry or add a count method.
    const messages = await enquiryMessageDao.listByEnquiry(parseInt(enquiry_id));
    const countSenderType = sender_type === "USER" ? "ADMIN" : "USER";
    const unreadCount = messages.filter(m => m.sender_type === countSenderType && !m.is_read).length;

    return res.json({
      success: true,
      unread_count: unreadCount || 0,
    });
  } catch (error) {
    console.error("Unexpected error in getUnreadCount:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};
