// controllers/enquiryController.js
import { supabase } from "../config/supabaseClient.js";

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
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, name, stock_quantity")
      .eq("id", product_id)
      .single();

    if (productError || !product) {
      return res.status(404).json({
        success: false,
        error: "Product not found",
      });
    }

    // Create enquiry
    const { data: enquiry, error: enquiryError } = await supabase
      .from("product_enquiries")
      .insert([
        {
          user_id,
          product_id,
          variant_id: variant_id || null,
          quantity,
          message: message || null,
          expected_price: expected_price || null,
          status: "OPEN",
        },
      ])
      .select()
      .single();

    if (enquiryError) {
      console.error("Error creating enquiry:", enquiryError);
      return res.status(500).json({
        success: false,
        error: enquiryError.message,
      });
    }

    // Create admin notification
    await supabase.from("notifications").insert({
      type: "admin",
      title: "New Product Enquiry",
      message: `New enquiry for ${product.name} - Quantity: ${quantity}`,
      related_type: "enquiry",
      related_id: enquiry.id,
      read: false,
    });

    // Send initial auto-message to user
    await supabase.from("enquiry_messages").insert({
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
    const { user_id } = req.query;
    const { status, page = 1, limit = 10 } = req.query;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        error: "user_id is required",
      });
    }

    const offset = (page - 1) * limit;

    let query = supabase
      .from("product_enquiries")
      .select(
        `
        *,
        products:product_id (id, name, image_url, price)
      `,
        { count: "exact" }
      )
      .eq("user_id", user_id)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error, count } = await query.range(offset, offset + limit - 1);

    if (error) {
      console.error("Error fetching user enquiries:", error);
      return res.status(500).json({
        success: false,
        error: error.message,
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

    // Get enquiry
    const { data: enquiry, error: enquiryError } = await supabase
      .from("product_enquiries")
      .select(
        `
        *,
        products:product_id (id, name, image_url, price, gst_percentage)
      `
      )
      .eq("id", id)
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
      .eq("enquiry_id", id)
      .order("created_at", { ascending: true });

    if (messagesError) {
      console.error("Error fetching messages:", messagesError);
    }

    // Get bids
    const { data: bids, error: bidsError } = await supabase
      .from("enquiry_bids")
      .select(
        `
        *,
        bid_products (*)
      `
      )
      .eq("enquiry_id", id)
      .order("created_at", { ascending: false });

    if (bidsError) {
      console.error("Error fetching bids:", bidsError);
    }

    return res.json({
      success: true,
      enquiry,
      messages: messages || [],
      bids: bids || [],
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

    // Verify enquiry belongs to user
    const { data: enquiry, error: enquiryError } = await supabase
      .from("product_enquiries")
      .select("*")
      .eq("id", id)
      .eq("user_id", user_id)
      .single();

    if (enquiryError || !enquiry) {
      return res.status(404).json({
        success: false,
        error: "Enquiry not found or unauthorized",
      });
    }

    // Verify bid exists and is active
    const { data: bid, error: bidError } = await supabase
      .from("enquiry_bids")
      .select("*")
      .eq("id", bid_id)
      .eq("enquiry_id", id)
      .single();

    if (bidError || !bid) {
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

    // Check if bid has expired
    if (new Date(bid.expires_at) < new Date()) {
      await supabase
        .from("enquiry_bids")
        .update({ status: "EXPIRED" })
        .eq("id", bid_id);

      return res.status(400).json({
        success: false,
        error: "Bid has expired",
      });
    }

    // Update bid status to ACCEPTED
    const { error: updateBidError } = await supabase
      .from("enquiry_bids")
      .update({ status: "ACCEPTED" })
      .eq("id", bid_id);

    if (updateBidError) {
      console.error("Error updating bid:", updateBidError);
      return res.status(500).json({
        success: false,
        error: updateBidError.message,
      });
    }

    // Update enquiry status to NEGOTIATING
    const { error: updateEnquiryError } = await supabase
      .from("product_enquiries")
      .update({ status: "NEGOTIATING" })
      .eq("id", id);

    if (updateEnquiryError) {
      console.error("Error updating enquiry:", updateEnquiryError);
    }

    // Create notification message
    await supabase.from("enquiry_messages").insert({
      enquiry_id: id,
      sender_type: "USER",
      sender_id: user_id,
      sender_name: "User",
      message: "I accept this bid offer.",
    });

    // Create admin notification
    await supabase.from("notifications").insert({
      type: "admin",
      title: "Bid Accepted",
      message: `User accepted bid for enquiry #${id}`,
      related_type: "bid",
      related_id: bid_id,
      read: false,
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
    const offset = (page - 1) * limit;

    let query = supabase
      .from("product_enquiries")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    if (search) {
      query = query.or(
        `message.ilike.%${search}%,admin_notes.ilike.%${search}%`
      );
    }

    const { data, error, count } = await query.range(offset, offset + limit - 1);

    if (error) {
      console.error("Error fetching all enquiries:", error);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    // Fetch related products and users separately
    if (data && data.length > 0) {
      const productIds = [...new Set(data.map(e => e.product_id).filter(Boolean))];
      const userIds = [...new Set(data.map(e => e.user_id).filter(Boolean))];

      // Fetch products
      if (productIds.length > 0) {
        const { data: products } = await supabase
          .from("products")
          .select("id, name, image, price")
          .in("id", productIds);

        if (products) {
          const productMap = {};
          products.forEach(p => { productMap[p.id] = p; });
          data.forEach(enquiry => {
            enquiry.products = productMap[enquiry.product_id] || null;
          });
        }
      }

      // Fetch users
      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from("users")
          .select("id, name, email, phone")
          .in("id", userIds);

        if (users) {
          const userMap = {};
          users.forEach(u => { userMap[u.id] = u; });
          data.forEach(enquiry => {
            enquiry.users = userMap[enquiry.user_id] || null;
          });
        }
      }
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

    const updateData = { status };
    if (admin_notes) {
      updateData.admin_notes = admin_notes;
    }

    const { error } = await supabase
      .from("product_enquiries")
      .update(updateData)
      .eq("id", id);

    if (error) {
      console.error("Error updating enquiry status:", error);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

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

    const { error } = await supabase
      .from("product_enquiries")
      .update({
        status: "CLOSED",
        closed_reason: reason || "Closed by admin",
        closed_by: "ADMIN",
      })
      .eq("id", id);

    if (error) {
      console.error("Error closing enquiry:", error);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

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
