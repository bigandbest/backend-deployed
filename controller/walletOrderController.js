import { supabase } from "../config/supabaseClient.js";
import { executeWalletTransaction } from "./walletController.js";
import { createNotificationHelper } from "./NotificationHelpers.js";

// Create Wallet Order (prepaid via wallet balance)
export const createWalletOrder = async (req, res) => {
  try {
    console.log('Wallet Order Creation Request:', req.body);
    
    const {
      user_id,
      product_id,
      user_name,
      user_email,
      product_name,
      product_total_price,
      user_address,
      user_location,
      quantity = 1,
      items = [],
      delivery_address,
      mobile
    } = req.body;

    // Validate required fields
    if (!user_id || !product_name || !product_total_price || !user_address) {
      console.log('Validation Error: Missing required fields');
      return res.status(400).json({
        success: false,
        error: "Missing required fields: user_id, product_name, product_total_price, user_address"
      });
    }

    const totalPrice = parseFloat(product_total_price);

    // Check wallet balance
    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("balance, is_frozen")
      .eq("user_id", user_id)
      .single();

    if (walletError || !wallet) {
      return res.status(404).json({
        success: false,
        error: "Wallet not found"
      });
    }

    if (wallet.is_frozen) {
      return res.status(400).json({
        success: false,
        error: "Wallet is frozen. Please contact support."
      });
    }

    const walletBalance = parseFloat(wallet.balance || 0);
    if (walletBalance < totalPrice) {
      return res.status(400).json({
        success: false,
        error: `Insufficient wallet balance. Required: ₹${totalPrice}, Available: ₹${walletBalance}`
      });
    }

    // Create order data
    const orderData = {
      user_id: String(user_id),
      user_name: String(user_name),
      user_email: user_email ? String(user_email) : null,
      user_location: user_location ? String(user_location) : null,
      product_name: String(product_name),
      product_total_price: totalPrice,
      address: String(user_address),
      payment_method: 'wallet', // Mark as wallet order
      status: 'pending',
      total: totalPrice,
      subtotal: totalPrice,
      shipping: 0
    };

    console.log('Inserting wallet order into orders table:', orderData);

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert([orderData])
      .select()
      .single();

    if (orderError) {
      console.error('Database Error:', orderError);
      return res.status(500).json({
        success: false,
        error: orderError.message
      });
    }

    // Create order items
    if (items && items.length > 0) {
      const orderItems = items.map(item => ({
        order_id: order.id,
        product_id: String(item.product_id),
        quantity: parseInt(item.quantity),
        price: parseFloat(item.price)
      }));

      const { error: itemsError } = await supabase
        .from("order_items")
        .insert(orderItems);

      if (itemsError) {
        console.error('Order Items Error:', itemsError);
        // Rollback order if items creation fails
        await supabase.from("orders").delete().eq("id", order.id);
        return res.status(500).json({
          success: false,
          error: itemsError.message
        });
      }
    } else if (product_id) {
      // Fallback to single product
      const orderItemData = {
        order_id: order.id,
        product_id: String(product_id),
        quantity: parseInt(quantity),
        price: totalPrice / parseInt(quantity)
      };

      const { error: itemError } = await supabase
        .from("order_items")
        .insert([orderItemData]);

      if (itemError) {
        console.error('Order Item Error:', itemError);
        await supabase.from("orders").delete().eq("id", order.id);
        return res.status(500).json({
          success: false,
          error: itemError.message
        });
      }
    }

    // Deduct from wallet using executeWalletTransaction
    try {
      const idempotencyKey = `wallet_order_${order.id}_${Date.now()}`;
      
      const { wallet: updatedWallet, transaction } = await executeWalletTransaction(
        user_id,
        "SPEND",
        totalPrice,
        "ORDER",
        order.id,
        `Payment for order #${order.id}`,
        { order_id: order.id, payment_method: 'wallet' },
        null,
        null,
        null,
        idempotencyKey
      );

      // Create notification
      await createNotificationHelper(
        user_id,
        "Order Placed Successfully",
        `Order #${order.id} placed successfully. ₹${totalPrice} debited from wallet. Remaining balance: ₹${updatedWallet.balance}`,
        "order_placed",
        order.id,
        "user"
      );

      console.log('Wallet Order Created Successfully:', order);
      return res.status(201).json({
        success: true,
        message: "Wallet order created successfully",
        order: order,
        wallet_balance: parseFloat(updatedWallet.balance),
        transaction_id: transaction.id
      });
    } catch (walletError) {
      console.error('Wallet Deduction Error:', walletError);
      // Rollback order if wallet deduction fails
      await supabase.from("orders").delete().eq("id", order.id);
      await supabase.from("order_items").delete().eq("order_id", order.id);
      
      return res.status(400).json({
        success: false,
        error: walletError.message || "Failed to deduct from wallet"
      });
    }
  } catch (error) {
    console.error('Server Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Get all wallet orders
export const getAllWalletOrders = async (req, res) => {
  try {
    const { data: orders, error } = await supabase
      .from("orders")
      .select("*")
      .eq("payment_method", "wallet")
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json({ success: true, orders });
  } catch (error) {
    console.error("Error fetching wallet orders:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get user's wallet orders
export const getUserWalletOrders = async (req, res) => {
  try {
    const { user_id } = req.params;

    const { data: orders, error } = await supabase
      .from("orders")
      .select("*")
      .eq("user_id", user_id)
      .eq("payment_method", "wallet")
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json({ success: true, orders });
  } catch (error) {
    console.error("Error fetching user wallet orders:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};
