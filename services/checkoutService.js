// services/checkoutService.js
// Enhanced checkout service that integrates wallet with existing order flow

import { supabase } from "../config/supabaseClient.js";
import { WalletCheckoutService } from "./walletService.js";
import { executeWalletTransaction } from "../controller/walletController.js";
import { createNotificationHelper } from "../controller/NotificationHelpers.js";

/**
 * Enhanced order creation that supports wallet + Razorpay mixed payments
 */
export const createEnhancedOrder = async (orderData) => {
  const {
    user_id,
    cart_items,
    shipping_address,
    use_wallet = false,
    wallet_amount = 0,
    payment_method = "razorpay",
    razorpay_order_id = null,
    razorpay_payment_id = null,
    razorpay_signature = null,
  } = orderData;

  try {
    // Calculate order totals
    const { subtotal, shipping, total } = await calculateOrderTotals(
      cart_items,
      shipping_address
    );

    // Validate wallet payment if requested
    let walletPaymentResult = null;
    let finalWalletAmount = 0;
    let externalPaymentAmount = total;

    if (use_wallet && wallet_amount > 0) {
      const walletValidation =
        await WalletCheckoutService.validateWalletPayment(
          user_id,
          true,
          wallet_amount,
          total
        );

      if (!walletValidation.success) {
        throw new Error(walletValidation.error);
      }

      finalWalletAmount = Math.min(wallet_amount, total);
      externalPaymentAmount = total - finalWalletAmount;
    }

    // Create order record
    const orderCreateData = {
      user_id,
      subtotal,
      shipping,
      total,
      payment_method:
        use_wallet && externalPaymentAmount === 0 ? "wallet" : payment_method,
      status: "Pending",
      ...shipping_address,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      created_at: new Date().toISOString(),
    };

    // If using mixed payment, add metadata
    if (use_wallet && finalWalletAmount > 0) {
      orderCreateData.payment_method = "mixed";
      orderCreateData.adminnotes = `Wallet: ₹${finalWalletAmount}, External: ₹${externalPaymentAmount}`;
    }

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert([orderCreateData])
      .select()
      .single();

    if (orderError) {
      throw new Error(`Failed to create order: ${orderError.message}`);
    }

    // Create order items
    const orderItems = cart_items.map((item) => ({
      order_id: order.id,
      product_id: item.product_id,
      quantity: item.quantity,
      price: item.price,
    }));

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(orderItems);

    if (itemsError) {
      // Rollback order creation
      await supabase.from("orders").delete().eq("id", order.id);
      throw new Error(`Failed to create order items: ${itemsError.message}`);
    }

    // Process wallet payment if applicable
    if (use_wallet && finalWalletAmount > 0) {
      try {
        walletPaymentResult = await WalletCheckoutService.processWalletPayment(
          user_id,
          order.id,
          finalWalletAmount,
          total
        );

        if (!walletPaymentResult.success) {
          // Rollback order creation
          await supabase.from("order_items").delete().eq("order_id", order.id);
          await supabase.from("orders").delete().eq("id", order.id);
          throw new Error(
            `Wallet payment failed: ${walletPaymentResult.error}`
          );
        }
      } catch (walletError) {
        // Rollback order creation
        await supabase.from("order_items").delete().eq("order_id", order.id);
        await supabase.from("orders").delete().eq("id", order.id);
        throw new Error(
          `Wallet payment processing failed: ${walletError.message}`
        );
      }
    }

    // Clear user's cart
    await supabase.from("cart_items").delete().eq("user_id", user_id);

    // Create success notification
    const paymentDescription =
      use_wallet && externalPaymentAmount === 0
        ? "Paid via wallet"
        : use_wallet && finalWalletAmount > 0
        ? `Wallet: ₹${finalWalletAmount}, Card: ₹${externalPaymentAmount}`
        : `Paid via ${payment_method}`;

    await createNotificationHelper(
      user_id,
      "Order Placed Successfully",
      `Your order #${order.id} has been placed successfully. ${paymentDescription}. Total: ₹${total}`,
      "order",
      order.id,
      "user"
    );

    return {
      success: true,
      order: {
        ...order,
        wallet_amount_used: finalWalletAmount,
        external_amount: externalPaymentAmount,
        remaining_wallet_balance:
          walletPaymentResult?.remaining_balance || null,
      },
    };
  } catch (error) {
    console.error("Error in enhanced order creation:", error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Calculate order totals based on cart items
 */
const calculateOrderTotals = async (cartItems, shippingAddress) => {
  try {
    let subtotal = 0;

    // Calculate subtotal from cart items
    for (const item of cartItems) {
      subtotal += parseFloat(item.price) * parseInt(item.quantity);
    }

    // Calculate shipping based on address (implement your shipping logic)
    const shipping = calculateShipping(subtotal, shippingAddress);

    const total = subtotal + shipping;

    return { subtotal, shipping, total };
  } catch (error) {
    throw new Error(`Failed to calculate order totals: ${error.message}`);
  }
};

/**
 * Calculate shipping cost (implement your business logic)
 */
const calculateShipping = (subtotal, shippingAddress) => {
  // Example shipping calculation - replace with your actual logic
  if (subtotal >= 500) {
    return 0; // Free shipping above ₹500
  }

  return 50; // Standard shipping fee
};

/**
 * Middleware to integrate wallet payment in existing checkout flow
 */
export const enhanceOrderController = (originalOrderController) => {
  return async (req, res) => {
    try {
      const { use_wallet, wallet_amount } = req.body;

      // If wallet payment is not requested, use original controller
      if (!use_wallet || !wallet_amount || wallet_amount <= 0) {
        return await originalOrderController(req, res);
      }

      // Enhanced order creation with wallet support
      const orderResult = await createEnhancedOrder({
        user_id: req.user.id,
        cart_items: req.body.cart_items || [],
        shipping_address: {
          shipping_house_number: req.body.shipping_house_number,
          shipping_street_address: req.body.shipping_street_address,
          shipping_suite_unit_floor: req.body.shipping_suite_unit_floor,
          shipping_locality: req.body.shipping_locality,
          shipping_area: req.body.shipping_area,
          shipping_city: req.body.shipping_city,
          shipping_state: req.body.shipping_state,
          shipping_postal_code: req.body.shipping_postal_code,
          shipping_country: req.body.shipping_country || "India",
          shipping_landmark: req.body.shipping_landmark,
        },
        use_wallet: true,
        wallet_amount: parseFloat(wallet_amount),
        payment_method: req.body.payment_method || "razorpay",
        razorpay_order_id: req.body.razorpay_order_id,
        razorpay_payment_id: req.body.razorpay_payment_id,
        razorpay_signature: req.body.razorpay_signature,
      });

      if (!orderResult.success) {
        return res.status(400).json({
          success: false,
          error: orderResult.error,
        });
      }

      res.json({
        success: true,
        message: "Order created successfully",
        order: orderResult.order,
      });
    } catch (error) {
      console.error("Error in enhanced order controller:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create order",
      });
    }
  };
};

export default {
  createEnhancedOrder,
  enhanceOrderController,
};
