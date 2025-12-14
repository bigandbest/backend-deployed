// controllers/bidController.js
import { supabase } from "../config/supabaseClient.js";

/**
 * Create a new bid offer (Admin only)
 * POST /api/bids
 */
export const createBid = async (req, res) => {
  try {
    const {
      enquiry_id,
      products, // Array of {product_id, variant_id, quantity, unit_price}
      validity_hours = 24,
      terms,
      notes,
      created_by,
    } = req.body;

    // Validate required fields
    if (!enquiry_id || !products || products.length === 0) {
      return res.status(400).json({
        success: false,
        error: "enquiry_id and products are required",
      });
    }

    // Verify enquiry exists and is in valid status
    const { data: enquiry, error: enquiryError } = await supabase
      .from("product_enquiries")
      .select("*")
      .eq("id", enquiry_id)
      .single();

    if (enquiryError || !enquiry) {
      return res.status(404).json({
        success: false,
        error: "Enquiry not found",
      });
    }

    if (!["OPEN", "NEGOTIATING"].includes(enquiry.status)) {
      return res.status(400).json({
        success: false,
        error: "Enquiry is not in a valid status for bidding",
      });
    }

    // Determine bid type
    const bid_type = products.length === 1 ? "SINGLE_PRODUCT" : "MULTI_PRODUCT";

    // Calculate total for single product bid
    let base_price = null;
    let quantity = null;
    if (bid_type === "SINGLE_PRODUCT") {
      base_price = products[0].unit_price * products[0].quantity;
      quantity = products[0].quantity;
    }

    // Create bid
    const { data: bid, error: bidError } = await supabase
      .from("enquiry_bids")
      .insert([
        {
          enquiry_id,
          bid_type,
          base_price,
          quantity,
          validity_hours,
          terms: terms || null,
          notes: notes || null,
          created_by: created_by || null,
          status: "ACTIVE",
        },
      ])
      .select()
      .single();

    if (bidError) {
      console.error("Error creating bid:", bidError);
      return res.status(500).json({
        success: false,
        error: bidError.message,
      });
    }

    // Create bid products
    const bidProducts = [];
    for (const product of products) {
      // Get product details
      const { data: productData, error: productError } = await supabase
        .from("products")
        .select("name, gst_percentage")
        .eq("id", product.product_id)
        .single();

      if (productError) {
        console.error("Error fetching product:", productError);
        continue;
      }

      const total_price = product.unit_price * product.quantity;

      bidProducts.push({
        bid_id: bid.id,
        product_id: product.product_id,
        variant_id: product.variant_id || null,
        product_name: productData.name,
        variant_details: product.variant_details || null,
        quantity: product.quantity,
        unit_price: product.unit_price,
        total_price,
        gst_percentage: productData.gst_percentage || 0,
      });
    }

    const { error: productsError } = await supabase
      .from("bid_products")
      .insert(bidProducts);

    if (productsError) {
      console.error("Error creating bid products:", productsError);
      // Rollback bid creation
      await supabase.from("enquiry_bids").delete().eq("id", bid.id);
      return res.status(500).json({
        success: false,
        error: "Failed to create bid products",
      });
    }

    // Send notification to user
    await supabase.from("notifications").insert({
      user_id: enquiry.user_id,
      type: "user",
      title: "New Bid Offer",
      message: `You have received a new bid offer for your enquiry`,
      related_type: "bid",
      related_id: bid.id,
      read: false,
    });

    // Create message in chat
    const totalAmount = bidProducts.reduce((sum, p) => sum + p.total_price, 0);
    await supabase.from("enquiry_messages").insert({
      enquiry_id,
      sender_type: "ADMIN",
      sender_id: created_by || enquiry.user_id,
      sender_name: "Admin",
      message: `New bid offer created: ₹${totalAmount.toFixed(2)} for ${
        bidProducts.length
      } product(s). Valid for ${validity_hours} hours.`,
    });

    return res.status(201).json({
      success: true,
      bid: {
        ...bid,
        products: bidProducts,
      },
    });
  } catch (error) {
    console.error("Unexpected error in createBid:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

/**
 * Lock a bid (Admin only) - Finalizes the bid and adds to cart
 * POST /api/bids/:id/lock
 */
export const lockBid = async (req, res) => {
  try {
    const { id } = req.params; // bid_id
    const { admin_id } = req.body;

    // Get bid details
    const { data: bid, error: bidError } = await supabase
      .from("enquiry_bids")
      .select(
        `
        *,
        product_enquiries!inner(user_id, status)
      `
      )
      .eq("id", id)
      .single();

    if (bidError || !bid) {
      return res.status(404).json({
        success: false,
        error: "Bid not found",
      });
    }

    // Verify bid is accepted
    if (bid.status !== "ACCEPTED") {
      return res.status(400).json({
        success: false,
        error: "Bid must be accepted before locking",
      });
    }

    // Check if bid has expired
    if (new Date(bid.expires_at) < new Date()) {
      await supabase.from("enquiry_bids").update({ status: "EXPIRED" }).eq("id", id);
      return res.status(400).json({
        success: false,
        error: "Bid has expired",
      });
    }

    // Check if user already has an active locked bid
    const { data: existingLockedBid } = await supabase
      .from("locked_bids")
      .select("id")
      .eq("user_id", bid.product_enquiries.user_id)
      .eq("status", "PENDING_PAYMENT")
      .single();

    if (existingLockedBid) {
      return res.status(400).json({
        success: false,
        error: "User already has an active locked bid pending payment",
      });
    }

    // Get bid products
    const { data: bidProducts, error: productsError } = await supabase
      .from("bid_products")
      .select("*")
      .eq("bid_id", id);

    if (productsError || !bidProducts || bidProducts.length === 0) {
      return res.status(500).json({
        success: false,
        error: "Failed to fetch bid products",
      });
    }

    // Reserve stock for all products
    let stockReserved = true;
    for (const product of bidProducts) {
      // Check stock availability
      const { data: productData, error: stockError } = await supabase
        .from("products")
        .select("stock_quantity")
        .eq("id", product.product_id)
        .single();

      if (stockError || !productData) {
        stockReserved = false;
        break;
      }

      if (productData.stock_quantity < product.quantity) {
        return res.status(400).json({
          success: false,
          error: `Insufficient stock for product ${product.product_name}`,
        });
      }

      // Reserve stock (reduce from available)
      const { error: updateError } = await supabase
        .from("products")
        .update({
          stock_quantity: productData.stock_quantity - product.quantity,
        })
        .eq("id", product.product_id);

      if (updateError) {
        console.error("Error reserving stock:", updateError);
        stockReserved = false;
        break;
      }

      // If variant exists, reserve variant stock too
      if (product.variant_id) {
        const { data: variantData } = await supabase
          .from("product_variants")
          .select("stock_quantity")
          .eq("id", product.variant_id)
          .single();

        if (variantData && variantData.stock_quantity >= product.quantity) {
          await supabase
            .from("product_variants")
            .update({
              stock_quantity: variantData.stock_quantity - product.quantity,
            })
            .eq("id", product.variant_id);
        }
      }
    }

    // Calculate pricing using database function
    const { data: pricingData, error: pricingError } = await supabase.rpc(
      "calculate_bid_gst",
      { p_bid_id: id }
    );

    let subtotal = 0;
    let gst_amount = 0;
    let final_amount = 0;

    if (pricingError || !pricingData || pricingData.length === 0) {
      // Fallback calculation
      subtotal = bidProducts.reduce((sum, p) => sum + parseFloat(p.total_price), 0);
      gst_amount = bidProducts.reduce(
        (sum, p) =>
          sum + (parseFloat(p.total_price) * parseFloat(p.gst_percentage)) / 100,
        0
      );
      final_amount = subtotal + gst_amount;
    } else {
      subtotal = parseFloat(pricingData[0].subtotal);
      gst_amount = parseFloat(pricingData[0].gst_amount);
      final_amount = parseFloat(pricingData[0].final_amount);
    }

    // Create locked bid (30 minutes payment deadline)
    const payment_deadline = new Date();
    payment_deadline.setMinutes(payment_deadline.getMinutes() + 30);

    const { data: lockedBid, error: lockedBidError } = await supabase
      .from("locked_bids")
      .insert([
        {
          bid_id: id,
          enquiry_id: bid.enquiry_id,
          user_id: bid.product_enquiries.user_id,
          subtotal,
          gst_amount,
          final_amount,
          stock_reserved: stockReserved,
          stock_reserved_at: new Date().toISOString(),
          payment_deadline: payment_deadline.toISOString(),
          status: "PENDING_PAYMENT",
        },
      ])
      .select()
      .single();

    if (lockedBidError) {
      console.error("Error creating locked bid:", lockedBidError);
      // Rollback stock reservation
      for (const product of bidProducts) {
        await supabase.rpc("increment", {
          table_name: "products",
          column_name: "stock_quantity",
          row_id: product.product_id,
          increment_value: product.quantity,
        });
      }
      return res.status(500).json({
        success: false,
        error: "Failed to lock bid",
      });
    }

    // Update bid status to LOCKED
    await supabase.from("enquiry_bids").update({ status: "LOCKED" }).eq("id", id);

    // Update enquiry status to LOCKED
    await supabase
      .from("product_enquiries")
      .update({ status: "LOCKED" })
      .eq("id", bid.enquiry_id);

    // Add bid products to user's cart
    const cartItems = bidProducts.map((product) => ({
      user_id: bid.product_enquiries.user_id,
      product_id: product.product_id,
      variant_id: product.variant_id,
      quantity: product.quantity,
      is_bid_product: true,
      locked_bid_id: lockedBid.id,
      bid_unit_price: product.unit_price,
    }));

    const { error: cartError } = await supabase.from("cart_items").insert(cartItems);

    if (cartError) {
      console.error("Error adding to cart:", cartError);
      // Don't fail the entire operation for cart error
    }

    // Send notification to user
    await supabase.from("notifications").insert({
      user_id: bid.product_enquiries.user_id,
      type: "user",
      title: "Bid Locked - Ready for Payment",
      message: `Your bid has been locked. Complete payment within 30 minutes. Total: ₹${final_amount.toFixed(
        2
      )}`,
      related_type: "locked_bid",
      related_id: lockedBid.id,
      read: false,
    });

    // Create message in chat
    await supabase.from("enquiry_messages").insert({
      enquiry_id: bid.enquiry_id,
      sender_type: "ADMIN",
      sender_id: admin_id || bid.product_enquiries.user_id,
      sender_name: "Admin",
      message: `Bid locked! Products added to your cart. Please complete payment within 30 minutes. Total: ₹${final_amount.toFixed(
        2
      )} (including GST)`,
    });

    return res.json({
      success: true,
      locked_bid: lockedBid,
      message: "Bid locked successfully and added to cart",
    });
  } catch (error) {
    console.error("Unexpected error in lockBid:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

/**
 * Get bid details
 * GET /api/bids/:id
 */
export const getBidDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const { data: bid, error: bidError } = await supabase
      .from("enquiry_bids")
      .select(
        `
        *,
        bid_products (*),
        product_enquiries (*)
      `
      )
      .eq("id", id)
      .single();

    if (bidError || !bid) {
      return res.status(404).json({
        success: false,
        error: "Bid not found",
      });
    }

    return res.json({
      success: true,
      bid,
    });
  } catch (error) {
    console.error("Unexpected error in getBidDetails:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

/**
 * Validate bid before checkout (Middleware)
 * GET /api/bids/:id/validate
 */
export const validateBid = async (req, res) => {
  try {
    const { id } = req.params; // locked_bid_id
    const { user_id } = req.query;

    const { data: lockedBid, error: bidError } = await supabase
      .from("locked_bids")
      .select(
        `
        *,
        enquiry_bids!inner(status, expires_at)
      `
      )
      .eq("id", id)
      .single();

    if (bidError || !lockedBid) {
      return res.status(404).json({
        success: false,
        valid: false,
        error: "Locked bid not found",
      });
    }

    // Verify bid belongs to user
    if (user_id && lockedBid.user_id !== user_id) {
      return res.status(403).json({
        success: false,
        valid: false,
        error: "Unauthorized access to this bid",
      });
    }

    // Check if bid has expired
    if (new Date(lockedBid.payment_deadline) < new Date()) {
      await supabase
        .from("locked_bids")
        .update({ status: "EXPIRED" })
        .eq("id", id);

      return res.json({
        success: true,
        valid: false,
        error: "Bid has expired",
      });
    }

    // Check if already paid
    if (lockedBid.status === "PAID") {
      return res.json({
        success: true,
        valid: false,
        error: "Bid has already been paid",
      });
    }

    // Check if cancelled
    if (lockedBid.status === "CANCELLED") {
      return res.json({
        success: true,
        valid: false,
        error: "Bid has been cancelled",
      });
    }

    return res.json({
      success: true,
      valid: true,
      locked_bid: lockedBid,
    });
  } catch (error) {
    console.error("Unexpected error in validateBid:", error);
    return res.status(500).json({
      success: false,
      valid: false,
      error: "Internal server error",
    });
  }
};

/**
 * Cancel a locked bid
 * POST /api/bids/:id/cancel
 */
export const cancelLockedBid = async (req, res) => {
  try {
    const { id } = req.params; // locked_bid_id
    const { user_id, reason } = req.body;

    // Get locked bid
    const { data: lockedBid, error: bidError } = await supabase
      .from("locked_bids")
      .select("*, bid_products:enquiry_bids!inner(bid_products(*))")
      .eq("id", id)
      .single();

    if (bidError || !lockedBid) {
      return res.status(404).json({
        success: false,
        error: "Locked bid not found",
      });
    }

    // Verify user owns this bid
    if (lockedBid.user_id !== user_id) {
      return res.status(403).json({
        success: false,
        error: "Unauthorized",
      });
    }

    // Can only cancel if pending payment
    if (lockedBid.status !== "PENDING_PAYMENT") {
      return res.status(400).json({
        success: false,
        error: "Can only cancel bids pending payment",
      });
    }

    // Release stock
    const { data: bidProducts } = await supabase
      .from("bid_products")
      .select("*")
      .eq("bid_id", lockedBid.bid_id);

    if (bidProducts && lockedBid.stock_reserved) {
      for (const product of bidProducts) {
        await supabase
          .from("products")
          .update({
            stock_quantity: supabase.raw(`stock_quantity + ${product.quantity}`),
          })
          .eq("id", product.product_id);
      }
    }

    // Update locked bid status
    await supabase
      .from("locked_bids")
      .update({
        status: "CANCELLED",
        cancelled_reason: reason || "Cancelled by user",
        cancelled_by: "USER",
      })
      .eq("id", id);

    // Remove from cart
    await supabase.from("cart_items").delete().eq("locked_bid_id", id);

    return res.json({
      success: true,
      message: "Bid cancelled successfully",
    });
  } catch (error) {
    console.error("Unexpected error in cancelLockedBid:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};
