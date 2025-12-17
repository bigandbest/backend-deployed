// controller/enquiryMessagesController.js
import { supabase } from "../config/supabaseClient.js";

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
    const { data: enquiry, error: enquiryError } = await supabase
      .from("product_enquiries")
      .select("id, user_id, status")
      .eq("id", enquiry_id)
      .single();

    if (enquiryError || !enquiry) {
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
    const { data: newMessage, error: messageError } = await supabase
      .from("enquiry_messages")
      .insert([
        {
          enquiry_id,
          sender_type,
          sender_id,
          sender_name: sender_name || (sender_type === "ADMIN" ? "Admin" : "User"),
          message,
          attachment_url: attachment_url || null,
          attachment_type: attachment_type || null,
          is_read: false,
        },
      ])
      .select()
      .single();

    if (messageError) {
      console.error("Error creating message:", messageError);
      return res.status(500).json({
        success: false,
        error: messageError.message,
      });
    }

    // Update enquiry status to NEGOTIATING if it's OPEN
    if (enquiry.status === "OPEN") {
      await supabase
        .from("product_enquiries")
        .update({ status: "NEGOTIATING" })
        .eq("id", enquiry_id);
    }

    // Send notification to the other party
    if (sender_type === "ADMIN") {
      // Notify user
      await supabase.from("notifications").insert({
        user_id: enquiry.user_id,
        type: "user",
        title: "New Message from Admin",
        message: `You have a new message regarding your enquiry`,
        related_type: "enquiry",
        related_id: enquiry_id,
        read: false,
      });
    } else {
      // Notify admin
      await supabase.from("notifications").insert({
        type: "admin",
        title: "New Message from User",
        message: `User sent a message in enquiry #${enquiry_id}`,
        related_type: "enquiry",
        related_id: enquiry_id,
        read: false,
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

    // Verify enquiry exists and user has access
    const { data: enquiry, error: enquiryError } = await supabase
      .from("product_enquiries")
      .select("id, user_id")
      .eq("id", enquiry_id)
      .single();

    if (enquiryError || !enquiry) {
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

    // Get messages
    const { data: messages, error: messagesError } = await supabase
      .from("enquiry_messages")
      .select("*")
      .eq("enquiry_id", enquiry_id)
      .order("created_at", { ascending: true });

    if (messagesError) {
      console.error("Error fetching messages:", messagesError);
      return res.status(500).json({
        success: false,
        error: messagesError.message,
      });
    }

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

    // Verify enquiry exists and user has access
    const { data: enquiry, error: enquiryError } = await supabase
      .from("product_enquiries")
      .select("id, user_id")
      .eq("id", enquiry_id)
      .single();

    if (enquiryError || !enquiry) {
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
    const markSenderType = sender_type === "USER" ? "ADMIN" : "USER";

    const { error: updateError } = await supabase
      .from("enquiry_messages")
      .update({ is_read: true })
      .eq("enquiry_id", enquiry_id)
      .eq("sender_type", markSenderType)
      .eq("is_read", false);

    if (updateError) {
      console.error("Error marking messages as read:", updateError);
      return res.status(500).json({
        success: false,
        error: updateError.message,
      });
    }

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
    const countSenderType = sender_type === "USER" ? "ADMIN" : "USER";

    const { count, error } = await supabase
      .from("enquiry_messages")
      .select("*", { count: "exact", head: true })
      .eq("enquiry_id", enquiry_id)
      .eq("sender_type", countSenderType)
      .eq("is_read", false);

    if (error) {
      console.error("Error counting unread messages:", error);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    return res.json({
      success: true,
      unread_count: count || 0,
    });
  } catch (error) {
    console.error("Unexpected error in getUnreadCount:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};
