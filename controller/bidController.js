// controllers/bidController.js
import EnquiryBidDAO from "../dao/enquiry-bid.dao.js";
import EnquiryDAO from "../dao/enquiry.dao.js";
import EnquiryMessageDAO from "../dao/enquiry-message.dao.js";
import UserDAO from "../dao/user.dao.js";
import ProductDAO from "../dao/product.dao.js";
import BidProductDAO from "../dao/bid-product.dao.js";
import LockedBidDAO from "../dao/locked-bid.dao.js";
import CartDAO from "../dao/cart.dao.js";

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

    // Verify enquiry exists and is in valid status using DAO
    const enquiry = await EnquiryDAO.getEnquiryById(enquiry_id);

    if (!enquiry) {
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

    // Create bid using DAO
    const bid = await EnquiryBidDAO.create({
      enquiry_id: enquiry_id,
      bid_type,
      base_price,
      quantity,
      validity_hours,
      terms: terms || null,
      notes: notes || null,
      created_by: created_by || null,
      status: "ACTIVE",
    });

    // Create bid products using DAO
    const bidProducts = [];
    for (const product of products) {
      // Get product details using DAO
      const productData = await ProductDAO.getProductById(product.product_id);

      if (!productData) {
        console.error(`Product not found: ${product.product_id}`);
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

    await BidProductDAO.createBulk(bidProducts);

    // Send notification to user using DAO
    await UserDAO.createNotification({
      user_id: enquiry.user_id,
      type: "user",
      title: "New Bid Offer",
      message: `You have received a new bid offer for your enquiry`,
      related_type: "bid",
      related_id: bid.id,
      is_read: false,
    });

    // Create message in chat using DAO
    const totalAmount = bidProducts.reduce((sum, p) => sum + p.total_price, 0);
    await EnquiryMessageDAO.create({
      enquiry_id: parseInt(enquiry_id),
      sender_type: "ADMIN",
      sender_id: created_by || enquiry.user_id,
      sender_name: "Admin",
      message: `New bid offer created: ₹${totalAmount.toFixed(2)} for ${bidProducts.length
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

    // Get bid details using DAO
    const bid = await EnquiryBidDAO.getById(id);

    if (!bid) {
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
      await EnquiryBidDAO.updateStatus(id, "EXPIRED");
      return res.status(400).json({
        success: false,
        error: "Bid has expired",
      });
    }

    // Check if user already has an active locked bid using DAO
    const existingLockedBid = await LockedBidDAO.getActiveByUser(bid.enquiry.user_id);

    if (existingLockedBid) {
      return res.status(400).json({
        success: false,
        error: "User already has an active locked bid pending payment",
      });
    }

    // Get bid products using DAO
    const bidProducts = await BidProductDAO.listByBidId(id);

    if (!bidProducts || bidProducts.length === 0) {
      return res.status(500).json({
        success: false,
        error: "Failed to fetch bid products",
      });
    }

    // Reserve stock for all products
    let stockReserved = true;
    for (const product of bidProducts) {
      // Check stock availability using ProductDAO
      const productData = await ProductDAO.getProductById(product.product_id);

      if (!productData) {
        stockReserved = false;
        break;
      }

      if (productData.stock_quantity < product.quantity) {
        return res.status(400).json({
          success: false,
          error: `Insufficient stock for product ${product.product_name}`,
        });
      }

      // Reserve stock (reduce from available) using ProductDAO
      await ProductDAO.updateProduct(product.product_id, {
        stock_quantity: productData.stock_quantity - product.quantity,
      });

      // If variant exists, reserve variant stock too using ProductDAO
      if (product.variant_id) {
        const variants = await ProductDAO.getVariantsByProductId(product.product_id);
        const variant = variants.find(v => v.id === product.variant_id);

        if (variant && variant.stock_quantity >= product.quantity) {
          await ProductDAO.updateVariant(product.variant_id, {
            stock_quantity: variant.stock_quantity - product.quantity,
          });
        }
      }
    }

    // Calculate pricing using DAO method (which calls RPC)
    const pricingData = await EnquiryBidDAO.calculateGST(id);

    let subtotal = 0;
    let gst_amount = 0;
    let final_amount = 0;

    if (!pricingData || pricingData.length === 0) {
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

    // Create locked bid (30 minutes payment deadline) using DAO
    const payment_deadline = new Date();
    payment_deadline.setMinutes(payment_deadline.getMinutes() + 30);

    const lockedBid = await LockedBidDAO.create({
      bid_id: id,
      enquiry_id: bid.enquiry_id,
      user_id: bid.enquiry.user_id,
      subtotal,
      gst_amount,
      final_amount,
      stock_reserved: stockReserved,
      stock_reserved_at: new Date().toISOString(),
      payment_deadline: payment_deadline.toISOString(),
      status: "PENDING_PAYMENT",
    });

    // Update bid status to LOCKED using DAO
    await EnquiryBidDAO.updateStatus(id, "LOCKED");

    // Update enquiry status to LOCKED using DAO
    await EnquiryDAO.updateEnquiry(bid.enquiry_id, { status: "LOCKED" });

    // Add bid products to user's cart using DAO
    for (const product of bidProducts) {
      await CartDAO.addToCart(bid.enquiry.user_id, product.variant_id || null, product.quantity, {
        isBidProduct: true,
        lockedBidId: lockedBid.id,
        bidUnitPrice: product.unit_price
      });
    }

    // Send notification to user using DAO
    await UserDAO.createNotification({
      user_id: bid.enquiry.user_id,
      type: "user",
      title: "Bid Locked - Ready for Payment",
      message: `Your bid has been locked. Complete payment within 30 minutes. Total: ₹${final_amount.toFixed(
        2
      )}`,
      related_type: "locked_bid",
      related_id: lockedBid.id,
      is_read: false,
    });

    // Create message in chat using DAO
    await EnquiryMessageDAO.create({
      enquiry_id: bid.enquiry_id,
      sender_type: "ADMIN",
      sender_id: admin_id || bid.enquiry.user_id,
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

    // Get bid using DAO
    const bid = await EnquiryBidDAO.getById(id);

    if (!bid) {
      return res.status(404).json({
        success: false,
        error: "Bid not found",
      });
    }

    // Fetch bid products using DAO
    const products = await BidProductDAO.listByBidId(id);

    return res.json({
      success: true,
      bid: {
        ...bid,
        products: products || [],
      },
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

    // Get locked bid using DAO
    const lockedBid = await LockedBidDAO.getById(id);

    if (!lockedBid) {
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
      await LockedBidDAO.updateStatus(id, "EXPIRED");

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

    // Get locked bid using DAO
    const lockedBid = await LockedBidDAO.getById(id);

    if (!lockedBid) {
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
    const bidProducts = await BidProductDAO.listByBidId(lockedBid.bid_id);

    if (bidProducts && lockedBid.stock_reserved) {
      for (const product of bidProducts) {
        // Use ProductDAO to update stock
        const pData = await ProductDAO.getProductById(product.product_id);
        if (pData) {
          await ProductDAO.updateProduct(product.product_id, {
            stock_quantity: pData.stock_quantity + product.quantity
          });
        }
      }
    }

    // Update locked bid status using DAO
    await LockedBidDAO.updateStatus(id, "CANCELLED", {
      cancelled_reason: reason || "Cancelled by user",
      cancelled_by: "USER"
    });

    // Remove from cart using DAO
    await CartDAO.removeByLockedBid(id);

    // Reopen bid and enquiry using DAOs
    await EnquiryBidDAO.updateStatus(lockedBid.bid_id, "ACCEPTED");
    await EnquiryDAO.updateEnquiry(lockedBid.enquiry_id, { status: "NEGOTIATING" });

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

/**
 * Reject a bid (Admin only)
 * POST /api/bids/:id/reject
 */
export const rejectBid = async (req, res) => {
  try {
    const { id } = req.params; // bid_id
    const { reason } = req.body;

    // Update bid status using DAO
    const bid = await EnquiryBidDAO.updateStatus(id, "REJECTED");

    if (!bid) {
      return res.status(404).json({
        success: false,
        error: "Bid not found",
      });
    }

    // Get enquiry details for notification using DAO
    const enquiry = await EnquiryDAO.getEnquiryById(bid.enquiry_id);

    // Notify user using DAO
    if (enquiry) {
      await UserDAO.createNotification({
        user_id: enquiry.user_id,
        type: "user",
        title: "Bid Rejected",
        message: reason || "Your bid has been rejected by admin",
        related_type: "bid",
        related_id: id,
        is_read: false,
      });
    }

    return res.json({
      success: true,
      message: "Bid rejected successfully",
    });
  } catch (error) {
    console.error("Unexpected error in rejectBid:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

/**
 * Update a bid (Admin only) - Only before it's locked
 * PUT /api/bids/:id
 */
export const updateBid = async (req, res) => {
  try {
    const { id } = req.params; // bid_id
    const { products, validity_hours, terms, notes } = req.body;

    // Get bid using DAO
    const bid = await EnquiryBidDAO.getById(id);

    if (!bid) {
      return res.status(404).json({
        success: false,
        error: "Bid not found",
      });
    }

    // Can only update if ACTIVE
    if (bid.status !== "ACTIVE") {
      return res.status(400).json({
        success: false,
        error: "Can only update active bids",
      });
    }

    // Update bid details using DAO
    const updateData = {};
    if (validity_hours) updateData.validity_hours = parseInt(validity_hours);
    if (terms) updateData.terms = terms;
    if (notes) updateData.notes = notes;

    if (Object.keys(updateData).length > 0) {
      await EnquiryBidDAO.update(id, updateData);
    }

    // Update products if provided using DAO
    if (products && products.length > 0) {
      // Delete existing products
      await BidProductDAO.deleteByBidId(id);

      // Insert new products
      const bidProducts = [];
      for (const product of products) {
        const productData = await ProductDAO.getProductById(product.product_id);

        if (productData) {
          bidProducts.push({
            bid_id: id,
            product_id: product.product_id,
            variant_id: product.variant_id || null,
            product_name: productData.name,
            quantity: product.quantity,
            unit_price: product.unit_price,
            total_price: product.unit_price * product.quantity,
            gst_percentage: productData.gst_percentage || 0,
          });
        }
      }

      await BidProductDAO.createBulk(bidProducts);

      // Update bid type and pricing using DAO
      const bid_type = bidProducts.length === 1 ? "SINGLE_PRODUCT" : "MULTI_PRODUCT";
      const base_price = bid_type === "SINGLE_PRODUCT"
        ? bidProducts[0].total_price
        : null;
      const quantity = bid_type === "SINGLE_PRODUCT"
        ? bidProducts[0].quantity
        : null;

      await EnquiryBidDAO.update(id, {
        bid_type,
        base_price,
        quantity
      });
    }

    return res.json({
      success: true,
      message: "Bid updated successfully",
    });
  } catch (error) {
    console.error("Unexpected error in updateBid:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};
