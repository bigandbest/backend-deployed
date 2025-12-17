// controllers/cartController.js
import { supabase } from "../config/supabaseClient.js";
import * as deliveryValidationService from "./deliveryValidationService.js";

/**
 * @description Get all cart items for a specific user, joining product details.
 * @route GET /api/cart/:user_id
 */
export const getCartItems = async (req, res) => {
  try {
    const { user_id } = req.params;

    if (!user_id) {
      return res
        .status(400)
        .json({ success: false, error: "User ID is required" });
    }

    const { data, error } = await supabase
      .from("cart_items")
      .select(`
        id, 
        product_id, 
        quantity, 
        added_at, 
        variant_id,
        is_bid_product,
        locked_bid_id,
        bid_unit_price,
        products(*),
        product_variants(*),
        locked_bids:locked_bid_id(
          id,
          payment_deadline,
          status,
          final_amount,
          subtotal,
          gst_amount
        )
      `)
      .eq("user_id", user_id);

    if (error) {
      console.error("Error fetching cart items:", error.message);
      return res.status(500).json({ success: false, error: error.message });
    }

    // Check for expired bid products and remove them
    const expiredBidItems = [];
    const validItems = [];

    for (const item of data) {
      if (item.is_bid_product && item.locked_bids) {
        const paymentDeadline = new Date(item.locked_bids.payment_deadline);
        const now = new Date();

        if (paymentDeadline < now || item.locked_bids.status !== "PENDING_PAYMENT") {
          // Bid has expired or is no longer pending
          expiredBidItems.push(item.id);

          // Update locked bid status if not already expired
          if (item.locked_bids.status === "PENDING_PAYMENT") {
            await supabase
              .from("locked_bids")
              .update({ status: "EXPIRED" })
              .eq("id", item.locked_bid_id);
          }
        } else {
          validItems.push(item);
        }
      } else {
        validItems.push(item);
      }
    }

    // Remove expired bid items from cart
    if (expiredBidItems.length > 0) {
      await supabase
        .from("cart_items")
        .delete()
        .in("id", expiredBidItems);
    }

    // Restructure the data to be more convenient on the client-side
    const cartItems = validItems.map((item) => {
      const product = item.products;
      const variant = item.product_variants;
      const lockedBid = item.locked_bids;

      return {
        ...product, // Spread product details
        cart_item_id: item.id,
        quantity: item.quantity,
        added_at: item.added_at,
        variant_id: item.variant_id,
        variant: variant, // Include variant details
        is_bid_product: item.is_bid_product || false,
        locked_bid_id: item.locked_bid_id,
        // Use bid price if it's a bid product, otherwise use variant/product price
        price: item.is_bid_product
          ? item.bid_unit_price
          : (variant ? variant.variant_price : product.price),
        oldPrice: variant ? variant.variant_old_price : product.old_price,
        weight: variant ? variant.variant_weight : (product.uom || "1 Unit"),
        // Add bid details if it's a bid product
        bid_details: lockedBid ? {
          payment_deadline: lockedBid.payment_deadline,
          status: lockedBid.status,
          final_amount: lockedBid.final_amount,
          subtotal: lockedBid.subtotal,
          gst_amount: lockedBid.gst_amount,
        } : null,
      };
    });

    return res.json({
      success: true,
      cartItems,
      expired_bid_items: expiredBidItems.length,
    });
  } catch (error) {
    console.error("Unexpected error in getCartItems:", error);
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  }
};

/**
 * @description Add a product to the cart. If it already exists, increment the quantity.
 * @route POST /api/cart/add
 */
export const addToCart = async (req, res) => {
  try {
    const { user_id, product_id, quantity = 1, variant_id } = req.body;

    // Validate input
    if (!user_id || !product_id) {
      return res
        .status(400)
        .json({
          success: false,
          error: "user_id and product_id are required.",
        });
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return res
        .status(400)
        .json({
          success: false,
          error: "Quantity must be a positive integer.",
        });
    }

    let currentStock = 0;
    let newStock = 0;

    if (variant_id) {
      // Handle Variant Logic
      const { data: variant, error: variantError } = await supabase
        .from("product_variants")
        .select("id, variant_stock, variant_price")
        .eq("id", variant_id)
        .single();

      if (variantError) {
        console.error("Error fetching variant:", variantError.message);
        return res.status(500).json({ success: false, error: variantError.message });
      }

      if (!variant) {
        return res.status(404).json({ success: false, error: "Variant not found." });
      }

      currentStock = variant.variant_stock || 0;

      if (currentStock < quantity) {
        return res.status(400).json({
          success: false,
          error: `Insufficient variant stock. Available: ${currentStock}, Requested: ${quantity}`,
        });
      }

      // Check if item exists in cart
      const { data: existingItem, error: findError } = await supabase
        .from("cart_items")
        .select("id, quantity")
        .eq("user_id", user_id)
        .eq("product_id", product_id)
        .eq("variant_id", variant_id)
        .single();

      if (findError && findError.code !== "PGRST116") {
        return res.status(500).json({ success: false, error: findError.message });
      }

      if (existingItem) {
        const totalQuantity = existingItem.quantity + quantity;
        if (currentStock < totalQuantity) {
          return res.status(400).json({
            success: false,
            error: `Insufficient variant stock. Available: ${currentStock}, Total requested: ${totalQuantity}`,
          });
        }
      }

      // Reduce stock from variant
      newStock = currentStock - quantity;
      const { error: stockError } = await supabase
        .from("product_variants")
        .update({ variant_stock: newStock })
        .eq("id", variant_id);

      if (stockError) {
        return res.status(500).json({ success: false, error: stockError.message });
      }

      // Update or Insert Cart Item
      if (existingItem) {
        const { data: updatedItem, error: updateError } = await supabase
          .from("cart_items")
          .update({ quantity: existingItem.quantity + quantity })
          .eq("id", existingItem.id)
          .select()
          .single();

        if (updateError) return res.status(500).json({ success: false, error: updateError.message });

        return res.status(200).json({
          success: true,
          cartItem: updatedItem,
          message: `Added ${quantity} items to cart. Variant stock reduced from ${currentStock} to ${newStock}`,
        });
      } else {
        const { data: newItem, error: insertError } = await supabase
          .from("cart_items")
          .insert([{ user_id, product_id, quantity, variant_id }])
          .select()
          .single();

        if (insertError) return res.status(500).json({ success: false, error: insertError.message });

        return res.status(201).json({
          success: true,
          cartItem: newItem,
          message: `Added ${quantity} items to cart. Variant stock reduced from ${currentStock} to ${newStock}`,
        });
      }

    } else {
      // Handle Regular Product Logic (No Variant)
      const { data: product, error: productError } = await supabase
        .from("products")
        .select("id, name, stock_quantity, stock, in_stock")
        .eq("id", product_id)
        .eq("active", true)
        .single();

      if (productError) {
        console.error("Error fetching product:", productError.message);
        return res.status(500).json({ success: false, error: productError.message });
      }

      if (!product) {
        return res.status(404).json({ success: false, error: "Product not found or inactive." });
      }

      currentStock = product.stock_quantity || product.stock || 0;

      if (currentStock < quantity) {
        return res.status(400).json({
          success: false,
          error: `Insufficient stock. Available: ${currentStock}, Requested: ${quantity}`,
        });
      }

      // Check if item exists in cart (without variant)
      const { data: existingItem, error: findError } = await supabase
        .from("cart_items")
        .select("id, quantity")
        .eq("user_id", user_id)
        .eq("product_id", product_id)
        .is("variant_id", null) // Ensure we match items without variant
        .single();

      if (findError && findError.code !== "PGRST116") {
        return res.status(500).json({ success: false, error: findError.message });
      }

      if (existingItem) {
        const totalQuantity = existingItem.quantity + quantity;
        if (currentStock < totalQuantity) {
          return res.status(400).json({
            success: false,
            error: `Insufficient stock. Available: ${currentStock}, Total requested: ${totalQuantity}`,
          });
        }
      }

      // Reduce stock from product
      newStock = currentStock - quantity;
      const { error: stockError } = await supabase
        .from("products")
        .update({
          stock_quantity: newStock,
          stock: newStock,
          in_stock: newStock > 0,
        })
        .eq("id", product_id);

      if (stockError) {
        return res.status(500).json({ success: false, error: stockError.message });
      }

      // Update or Insert Cart Item
      if (existingItem) {
        const { data: updatedItem, error: updateError } = await supabase
          .from("cart_items")
          .update({ quantity: existingItem.quantity + quantity })
          .eq("id", existingItem.id)
          .select()
          .single();

        if (updateError) return res.status(500).json({ success: false, error: updateError.message });

        return res.status(200).json({
          success: true,
          cartItem: updatedItem,
          message: `Added ${quantity} items to cart. Stock reduced from ${currentStock} to ${newStock}`,
        });
      } else {
        const { data: newItem, error: insertError } = await supabase
          .from("cart_items")
          .insert([{ user_id, product_id, quantity, variant_id: null }])
          .select()
          .single();

        if (insertError) return res.status(500).json({ success: false, error: insertError.message });

        return res.status(201).json({
          success: true,
          cartItem: newItem,
          message: `Added ${quantity} items to cart. Stock reduced from ${currentStock} to ${newStock}`,
        });
      }
    }
  } catch (error) {
    console.error("Unexpected error in addToCart:", error);
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  }
};

/**
 * @description Update the quantity of a specific item in the cart.
 * @route PUT /api/cart/:cart_item_id
 */
export const updateCartItem = async (req, res) => {
  try {
    const { cart_item_id } = req.params;
    const { quantity } = req.body;

    // Validate input: quantity must be a positive integer
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return res
        .status(400)
        .json({
          success: false,
          error: "Quantity must be a positive integer.",
        });
    }

    // Get current cart item
    const { data: currentCartItem, error: fetchError } = await supabase
      .from("cart_items")
      .select("product_id, quantity, variant_id, is_bid_product, locked_bid_id")
      .eq("id", cart_item_id)
      .single();

    if (fetchError) {
      if (fetchError.code === "PGRST116") {
        return res
          .status(404)
          .json({ success: false, error: "Cart item not found." });
      }
      console.error("Error fetching cart item:", fetchError.message);
      return res
        .status(500)
        .json({ success: false, error: fetchError.message });
    }

    // Prevent quantity changes for bid products
    if (currentCartItem.is_bid_product) {
      return res.status(400).json({
        success: false,
        error: "Cannot modify quantity of bid products. Bid quantities are locked.",
        is_bid_product: true,
      });
    }

    const currentCartQuantity = currentCartItem.quantity;
    const quantityDifference = quantity - currentCartQuantity;
    let currentStock = 0;
    let newStock = 0;

    if (currentCartItem.variant_id) {
      // Handle Variant Logic
      const { data: variant, error: variantError } = await supabase
        .from("product_variants")
        .select("variant_stock")
        .eq("id", currentCartItem.variant_id)
        .single();

      if (variantError) {
        return res.status(500).json({ success: false, error: variantError.message });
      }

      currentStock = variant.variant_stock || 0;

      // Check if we have enough stock for increase
      if (quantityDifference > 0 && currentStock < quantityDifference) {
        return res.status(400).json({
          success: false,
          error: `Insufficient variant stock. Available: ${currentStock}, Additional needed: ${quantityDifference}`,
        });
      }

      // Update variant stock
      newStock = currentStock - quantityDifference;
      const { error: stockError } = await supabase
        .from("product_variants")
        .update({ variant_stock: newStock })
        .eq("id", currentCartItem.variant_id);

      if (stockError) {
        return res.status(500).json({ success: false, error: stockError.message });
      }

    } else {
      // Handle Regular Product Logic
      const { data: product, error: productError } = await supabase
        .from("products")
        .select("stock_quantity, stock")
        .eq("id", currentCartItem.product_id)
        .single();

      if (productError) {
        console.error("Error fetching product:", productError.message);
        return res
          .status(500)
          .json({ success: false, error: productError.message });
      }

      currentStock = product.stock_quantity || product.stock || 0;

      // Check if we have enough stock for increase
      if (quantityDifference > 0 && currentStock < quantityDifference) {
        return res.status(400).json({
          success: false,
          error: `Insufficient stock. Available: ${currentStock}, Additional needed: ${quantityDifference}`,
        });
      }

      // Update product stock
      newStock = currentStock - quantityDifference;
      const { error: stockError } = await supabase
        .from("products")
        .update({
          stock_quantity: newStock,
          stock: newStock,
          in_stock: newStock > 0,
        })
        .eq("id", currentCartItem.product_id);

      if (stockError) {
        console.error("Error updating product stock:", stockError.message);
        return res
          .status(500)
          .json({ success: false, error: stockError.message });
      }
    }

    // Update cart item quantity
    const { data, error } = await supabase
      .from("cart_items")
      .update({ quantity })
      .eq("id", cart_item_id)
      .select()
      .single();

    if (error) {
      // If the error indicates no rows were found, return a 404
      if (error.code === "PGRST116") {
        return res
          .status(404)
          .json({ success: false, error: "Cart item not found." });
      }
      console.error("Error updating cart item:", error.message);
      return res.status(500).json({ success: false, error: error.message });
    }

    return res.status(200).json({
      success: true,
      cartItem: data,
      message: `Cart updated. Stock adjusted from ${currentStock} to ${newStock}`,
    });
  } catch (error) {
    console.error("Unexpected error in updateCartItem:", error);
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  }
};

/**
 * @description Remove a single item from the cart.
 * @route DELETE /api/cart/:cart_item_id
 */
export const removeCartItem = async (req, res) => {
  try {
    const { cart_item_id } = req.params;

    // First get the cart item details to restore stock
    const { data: cartItem, error: fetchError } = await supabase
      .from("cart_items")
      .select("product_id, quantity, variant_id, is_bid_product, locked_bid_id")
      .eq("id", cart_item_id)
      .single();

    if (fetchError) {
      if (fetchError.code === "PGRST116") {
        return res
          .status(404)
          .json({ success: false, error: "Cart item not found." });
      }
      console.error("Error fetching cart item:", fetchError.message);
      return res
        .status(500)
        .json({ success: false, error: fetchError.message });
    }

    // Prevent removal of bid products
    if (cartItem.is_bid_product) {
      return res.status(400).json({
        success: false,
        error: "Cannot remove bid products from cart. Bid products will be automatically removed when they expire.",
        is_bid_product: true,
      });
    }

    let currentStock = 0;
    let newStock = 0;

    if (cartItem.variant_id) {
      // Handle Variant Logic
      const { data: variant, error: variantError } = await supabase
        .from("product_variants")
        .select("variant_stock")
        .eq("id", cartItem.variant_id)
        .single();

      if (variantError) {
        return res.status(500).json({ success: false, error: variantError.message });
      }

      currentStock = variant.variant_stock || 0;
      newStock = currentStock + cartItem.quantity;

      const { error: stockError } = await supabase
        .from("product_variants")
        .update({ variant_stock: newStock })
        .eq("id", cartItem.variant_id);

      if (stockError) {
        return res.status(500).json({ success: false, error: stockError.message });
      }

    } else {
      // Handle Regular Product Logic
      const { data: product, error: productError } = await supabase
        .from("products")
        .select("stock_quantity, stock")
        .eq("id", cartItem.product_id)
        .single();

      if (productError) {
        console.error("Error fetching product:", productError.message);
        return res
          .status(500)
          .json({ success: false, error: productError.message });
      }

      currentStock = product.stock_quantity || product.stock || 0;
      newStock = currentStock + cartItem.quantity;

      const { error: stockError } = await supabase
        .from("products")
        .update({
          stock_quantity: newStock,
          stock: newStock,
          in_stock: newStock > 0,
        })
        .eq("id", cartItem.product_id);

      if (stockError) {
        console.error("Error restoring product stock:", stockError.message);
        return res
          .status(500)
          .json({ success: false, error: stockError.message });
      }
    }

    // Remove cart item
    const { error } = await supabase
      .from("cart_items")
      .delete()
      .eq("id", cart_item_id);

    if (error) {
      console.error("Error removing cart item:", error.message);
      return res.status(500).json({ success: false, error: error.message });
    }

    return res.status(200).json({
      success: true,
      message: `Item removed successfully. Stock restored from ${currentStock} to ${newStock}`,
    });
  } catch (error) {
    console.error("Unexpected error in removeCartItem:", error);
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  }
};

/**
 * @description Remove all items from a user's cart.
 * @route DELETE /api/cart/clear/:user_id
 */
export const clearCart = async (req, res) => {
  try {
    const { user_id } = req.params;

    // Get all cart items to restore stock
    const { data: cartItems, error: fetchError } = await supabase
      .from("cart_items")
      .select("product_id, quantity, variant_id")
      .eq("user_id", user_id);

    if (fetchError) {
      console.error("Error fetching cart items:", fetchError.message);
      return res
        .status(500)
        .json({ success: false, error: fetchError.message });
    }

    // Restore stock for each item
    for (const item of cartItems) {
      if (item.variant_id) {
        // Restore variant stock
        const { data: variant, error: variantError } = await supabase
          .from("product_variants")
          .select("variant_stock")
          .eq("id", item.variant_id)
          .single();

        if (!variantError && variant) {
          const currentStock = variant.variant_stock || 0;
          const newStock = currentStock + item.quantity;

          await supabase
            .from("product_variants")
            .update({ variant_stock: newStock })
            .eq("id", item.variant_id);
        }
      } else {
        // Restore product stock
        const { data: product, error: productError } = await supabase
          .from("products")
          .select("stock_quantity, stock")
          .eq("id", item.product_id)
          .single();

        if (!productError && product) {
          const currentStock = product.stock_quantity || product.stock || 0;
          const newStock = currentStock + item.quantity;

          await supabase
            .from("products")
            .update({
              stock_quantity: newStock,
              stock: newStock,
              in_stock: newStock > 0,
            })
            .eq("id", item.product_id);
        }
      }
    }

    // Clear cart
    const { error } = await supabase
      .from("cart_items")
      .delete()
      .eq("user_id", user_id);

    if (error) {
      console.error("Error clearing cart:", error.message);
      return res.status(500).json({ success: false, error: error.message });
    }

    return res.status(200).json({
      success: true,
      message: `Cart cleared successfully. Stock restored for ${cartItems.length} items.`,
    });
  } catch (error) {
    console.error("Unexpected error in clearCart:", error);
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  }
};

/**
 * @description Validate cart items for delivery to specific pincode using warehouse logic
 * @route POST /api/cart/validate-delivery
 */
export const validateCartDelivery = async (req, res) => {
  try {
    const { user_id, pincode } = req.body;

    if (!user_id || !pincode) {
      return res.status(400).json({
        success: false,
        error: "User ID and pincode are required",
      });
    }

    // Get cart items
    const { data: cartItems, error: cartError } = await supabase
      .from("cart_items")
      .select("product_id, quantity")
      .eq("user_id", user_id);

    if (cartError) {
      return res.status(500).json({
        success: false,
        error: "Failed to fetch cart items",
      });
    }

    if (!cartItems || cartItems.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Cart is empty",
      });
    }

    // Use delivery validation service for batch check
    const validationResult =
      await deliveryValidationService.checkMultipleProductsDelivery(
        cartItems,
        pincode
      );

    res.status(200).json({
      success: true,
      ...validationResult,
      cart_summary: {
        total_items: cartItems.length,
        user_id,
        pincode,
      },
    });
  } catch (error) {
    console.error("Error in validateCartDelivery:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

/**
 * @description Reserve stock for cart items during checkout
 * @route POST /api/cart/reserve-stock
 */
export const reserveCartStock = async (req, res) => {
  try {
    const { user_id, pincode, order_id } = req.body;

    if (!user_id || !pincode || !order_id) {
      return res.status(400).json({
        success: false,
        error: "User ID, pincode, and order ID are required",
      });
    }

    // Get cart items with product details
    const { data: cartItems, error: cartError } = await supabase
      .from("cart_items")
      .select(
        `
        product_id, 
        quantity,
        products!inner(id, name, delivery_type)
      `
      )
      .eq("user_id", user_id);

    if (cartError || !cartItems || cartItems.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Cart is empty or failed to fetch items",
      });
    }

    const reservationResults = [];

    // Process each cart item for stock reservation
    for (const item of cartItems) {
      try {
        // First check delivery availability to get warehouse info
        const deliveryCheck =
          await deliveryValidationService.checkProductDelivery(
            item.product_id,
            pincode,
            item.quantity
          );

        if (!deliveryCheck.deliverable) {
          reservationResults.push({
            product_id: item.product_id,
            product_name: item.products.name,
            success: false,
            error: "Product not deliverable to this pincode",
          });
          continue;
        }

        // Reserve stock from the identified warehouse
        const reservationResult =
          await deliveryValidationService.reserveProductStock(
            item.product_id,
            deliveryCheck.source_warehouse.id,
            item.quantity,
            order_id
          );

        reservationResults.push({
          product_id: item.product_id,
          product_name: item.products.name,
          warehouse_id: deliveryCheck.source_warehouse.id,
          warehouse_name: deliveryCheck.source_warehouse.name,
          quantity: item.quantity,
          ...reservationResult,
        });
      } catch (error) {
        console.error(
          `Error reserving stock for product ${item.product_id}:`,
          error
        );
        reservationResults.push({
          product_id: item.product_id,
          product_name: item.products.name,
          success: false,
          error: "Failed to reserve stock",
        });
      }
    }

    const allReserved = reservationResults.every((result) => result.success);

    res.status(200).json({
      success: true,
      all_reserved: allReserved,
      reservation_results: reservationResults,
      order_id,
      message: allReserved
        ? "All items reserved successfully"
        : "Some items could not be reserved",
    });
  } catch (error) {
    console.error("Error in reserveCartStock:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

/**
 * @description Confirm stock deduction after successful payment
 * @route POST /api/cart/confirm-stock-deduction
 */
export const confirmCartStockDeduction = async (req, res) => {
  try {
    const { order_id, warehouse_assignments } = req.body;

    if (!order_id || !warehouse_assignments) {
      return res.status(400).json({
        success: false,
        error: "Order ID and warehouse assignments are required",
      });
    }

    const deductionResults = [];

    // Process each warehouse assignment for stock deduction
    for (const assignment of warehouse_assignments) {
      try {
        const deductionResult =
          await deliveryValidationService.confirmStockDeduction(
            assignment.product_id,
            assignment.warehouse_id,
            assignment.quantity,
            order_id
          );

        deductionResults.push({
          ...assignment,
          ...deductionResult,
        });
      } catch (error) {
        console.error(
          `Error deducting stock for product ${assignment.product_id}:`,
          error
        );
        deductionResults.push({
          ...assignment,
          success: false,
          error: "Failed to deduct stock",
        });
      }
    }

    const allDeducted = deductionResults.every((result) => result.success);

    res.status(200).json({
      success: true,
      all_deducted: allDeducted,
      deduction_results: deductionResults,
      order_id,
      message: allDeducted
        ? "All stock deducted successfully"
        : "Some stock deductions failed",
    });
  } catch (error) {
    console.error("Error in confirmCartStockDeduction:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

/**
 * @description Check if cart contains any bid products
 * @route GET /api/cart/:user_id/has-bid-products
 */
export const checkCartHasBidProducts = async (req, res) => {
  try {
    const { user_id } = req.params;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        error: "User ID is required",
      });
    }

    // Check if any cart items are bid products
    const { data, error, count } = await supabase
      .from("cart_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user_id)
      .eq("is_bid_product", true);

    if (error) {
      console.error("Error checking bid products:", error.message);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    const hasBidProducts = count > 0;

    return res.json({
      success: true,
      has_bid_products: hasBidProducts,
      bid_product_count: count || 0,
      cod_allowed: !hasBidProducts, // COD not allowed if cart has bid products
    });
  } catch (error) {
    console.error("Unexpected error in checkCartHasBidProducts:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};
