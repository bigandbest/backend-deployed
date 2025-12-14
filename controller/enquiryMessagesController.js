// controllers/enquiryMessagesController.js
import { supabase } from "../config/supabaseClient.js";

/**
 * Send a message in an enquiry chat
 * POST /api/enquiry-messages
 */
export const sendMessage = async (req, res) => {
  try {
    const { enquiry_id, sender_type, sender_id, sender_name, message } = req.body;

    // Validate required fields
    if (!enquiry_id || !sender_type || !sender_id || !message) {
      return res.status(400).json({
        success: false,
        error: "enquiry_id, sender_type, sender_id, and message are required",
      });
    }

    // Validate sender_type
    if (!["USER", "ADMIN"].includes(sender_type)) {
      return res.status(400).json({
        success: false,
        error: "sender_type must be USER or ADMIN",
      });
    }

    // Verify enquiry exists
    const { data: enquiry, error: enquiryError } = await supabase
      .from("product_enquiries")
      .select("*, users:user_id (id, name, email)")
      .eq("id", enquiry_id)
      .single();

    if (enquiryError || !enquiry) {
      return res.status(404).json({
        success: false,
        error: "Enquiry not found",
      });
    }

    // Verify sender has access to this enquiry
    if (sender_type === "USER" && enquiry.user_id !== sender_id) {
      return res.status(403).json({
        success: false,
        error: "Unauthorized access to this enquiry",
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
          sender_name: sender_name || (sender_type === "USER" ? "User" : "Admin"),
          message,
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

    // Create notification for recipient
    if (sender_type === "USER") {
      // Notify admin
      await supabase.from("notifications").insert({
        type: "admin",
        title: "New Enquiry Message",
        message: `New message from user in enquiry #${enquiry_id}`,
        related_type: "enquiry",
        related_id: enquiry_id,
        read: false,
      });
    } else {
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
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    // Verify enquiry exists
    const { data: enquiry, error: enquiryError } = await supabase
      .from("product_enquiries")
      .select("id")
      .eq("id", enquiry_id)
      .single();

    if (enquiryError || !enquiry) {
      return res.status(404).json({
        success: false,
        error: "Enquiry not found",
      });
    }

    // Get messages
    const { data: messages, error: messagesError, count } = await supabase
      .from("enquiry_messages")
      .select("*", { count: "exact" })
      .eq("enquiry_id", enquiry_id)
      .order("created_at", { ascending: true })
      .range(offset, offset + limit - 1);

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
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
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
 * PUT /api/enquiry-messages/read
 */
export const markMessagesAsRead = async (req, res) => {
  try {
    const { message_ids, enquiry_id, sender_type } = req.body;

    if (!message_ids && !enquiry_id) {
      return res.status(400).json({
        success: false,
        error: "Either message_ids or enquiry_id is required",
      });
    }

    let query = supabase
      .from("enquiry_messages")
      .update({ is_read: true });

    if (message_ids && message_ids.length > 0) {
      query = query.in("id", message_ids);
    } else if (enquiry_id) {
      query = query.eq("enquiry_id", enquiry_id);
      
      // If sender_type is provided, only mark messages from opposite sender as read
      if (sender_type) {
        const oppositeSender = sender_type === "USER" ? "ADMIN" : "USER";
        query = query.eq("sender_type", oppositeSender);
      }
    }

    const { error } = await query;

    if (error) {
      console.error("Error marking messages as read:", error);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    return res.json({
      success: true,
      message: "Messages marked as read",
    });
  } catch (error) {
    console.error("Unexpected error in markMessagesAsRead:", error);
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
    const { sender_type } = req.query; // USER or ADMIN

    let query = supabase
      .from("enquiry_messages")
      .select("*", { count: "exact", head: true })
      .eq("enquiry_id", enquiry_id)
      .eq("is_read", false);

    // Count unread messages from opposite sender
    if (sender_type) {
      const oppositeSender = sender_type === "USER" ? "ADMIN" : "USER";
      query = query.eq("sender_type", oppositeSender);
    }

    const { count, error } = await query;

    if (error) {
      console.error("Error getting unread count:", error);
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
