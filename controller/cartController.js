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
      .select("id, product_id, quantity, added_at, products(*)")
      .eq("user_id", user_id);

    if (error) {
      console.error("Error fetching cart items:", error.message);
      return res.status(500).json({ success: false, error: error.message });
    }

    // Restructure the data to be more convenient on the client-side
    const cartItems = data.map((item) => ({
      ...item.products, // Spread product details (name, price, etc.)
      cart_item_id: item.id,
      quantity: item.quantity,
      added_at: item.added_at,
    }));

    return res.json({ success: true, cartItems });
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
    const { user_id, product_id, quantity = 1 } = req.body;

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

    // Check product stock availability
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, name, stock_quantity, stock, in_stock")
      .eq("id", product_id)
      .eq("active", true)
      .single();

    if (productError) {
      console.error("Error fetching product:", productError.message);
      return res
        .status(500)
        .json({ success: false, error: productError.message });
    }

    if (!product) {
      return res
        .status(404)
        .json({ success: false, error: "Product not found or inactive." });
    }

    const currentStock = product.stock_quantity || product.stock || 0;

    if (currentStock < quantity) {
      return res.status(400).json({
        success: false,
        error: `Insufficient stock. Available: ${currentStock}, Requested: ${quantity}`,
      });
    }

    // Check if the item already exists in the cart
    const { data: existingItem, error: findError } = await supabase
      .from("cart_items")
      .select("id, quantity")
      .eq("user_id", user_id)
      .eq("product_id", product_id)
      .single();

    // Handle errors, but ignore PGRST116 which means "no rows found" - this is expected
    if (findError && findError.code !== "PGRST116") {
      console.error("Error finding cart item:", findError.message);
      return res.status(500).json({ success: false, error: findError.message });
    }

    // Check total quantity if item exists
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
    const newStock = currentStock - quantity;
    const { error: stockError } = await supabase
      .from("products")
      .update({
        stock_quantity: newStock,
        stock: newStock,
        in_stock: newStock > 0,
      })
      .eq("id", product_id);

    if (stockError) {
      console.error("Error updating product stock:", stockError.message);
      return res
        .status(500)
        .json({ success: false, error: stockError.message });
    }

    // If item exists, update its quantity
    if (existingItem) {
      const { data: updatedItem, error: updateError } = await supabase
        .from("cart_items")
        .update({ quantity: existingItem.quantity + quantity })
        .eq("id", existingItem.id)
        .select()
        .single();

      if (updateError) {
        console.error(
          "Error updating cart item quantity:",
          updateError.message
        );
        return res
          .status(500)
          .json({ success: false, error: updateError.message });
      }
      return res.status(200).json({
        success: true,
        cartItem: updatedItem,
        message: `Added ${quantity} items to cart. Stock reduced from ${currentStock} to ${newStock}`,
      });
    }

    // If item does not exist, insert a new row
    else {
      const { data: newItem, error: insertError } = await supabase
        .from("cart_items")
        .insert([{ user_id, product_id, quantity }])
        .select()
        .single();

      if (insertError) {
        console.error("Error inserting new cart item:", insertError.message);
        return res
          .status(500)
          .json({ success: false, error: insertError.message });
      }
      return res.status(201).json({
        success: true,
        cartItem: newItem,
        message: `Added ${quantity} items to cart. Stock reduced from ${currentStock} to ${newStock}`,
      });
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
      .select("product_id, quantity")
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

    // Get current product stock
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

    const currentStock = product.stock_quantity || product.stock || 0;
    const currentCartQuantity = currentCartItem.quantity;
    const quantityDifference = quantity - currentCartQuantity;

    // Check if we have enough stock for increase
    if (quantityDifference > 0 && currentStock < quantityDifference) {
      return res.status(400).json({
        success: false,
        error: `Insufficient stock. Available: ${currentStock}, Additional needed: ${quantityDifference}`,
      });
    }

    // Update product stock
    const newStock = currentStock - quantityDifference;
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
      .select("product_id, quantity")
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

    // Get current product stock
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

    // Restore stock
    const currentStock = product.stock_quantity || product.stock || 0;
    const newStock = currentStock + cartItem.quantity;

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

    // Remove cart item
    const { error, count } = await supabase
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
      .select("product_id, quantity")
      .eq("user_id", user_id);

    if (fetchError) {
      console.error("Error fetching cart items:", fetchError.message);
      return res
        .status(500)
        .json({ success: false, error: fetchError.message });
    }

    // Restore stock for each item
    for (const item of cartItems) {
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
