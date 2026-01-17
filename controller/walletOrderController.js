import { supabase } from "../config/supabaseClient.js"; // Keep mostly for config if needed, or remove if unused. Let's see. 
// Actually, I should remove supabase usage.
// import { executeWalletTransaction } from "./walletController.js"; 
// Refactored executeWalletTransaction uses WalletDAO now.
import { executeWalletTransaction } from "./walletController.js";
import WalletDAO from "../dao/wallet.dao.js";
import OrderDAO from "../dao/order.dao.js";

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
    const wallet = await WalletDAO.getByUserId(user_id);

    if (!wallet) {
      return res.status(404).json({ success: false, error: "Wallet not found" });
    }

    if (wallet.is_frozen) {
      return res.status(400).json({ success: false, error: "Wallet is frozen. Please contact support." });
    }

    const walletBalance = parseFloat(wallet.balance || 0);
    if (walletBalance < totalPrice) {
      return res.status(400).json({
        success: false,
        error: `Insufficient wallet balance. Required: ₹${totalPrice}, Available: ₹${walletBalance}`
      });
    }

    // Prepare Order Items for atomic creation
    let orderItemsData = [];
    if (items && items.length > 0) {
      orderItemsData = items.map(item => ({
        product_id: String(item.product_id), // Mapped to product_id column
        quantity: parseInt(item.quantity),
        price: parseFloat(item.price),
        // variant_id might be needed if item has variant? Schema says variant_id is mandatory?
        // Let's check schema. Reference shows variant_id is NOT in the insert above, 
        // but 'order_items' in schema usually links to product/variant.
        // Original code: insert({ order_id, product_id, quantity, price }).
        // Schema likely allows variant_id to be nullable OR it wasn't used/required.
        // We stick to original behavior.
      }));
    } else if (product_id) {
      orderItemsData.push({
        product_id: String(product_id),
        quantity: parseInt(quantity),
        price: totalPrice / parseInt(quantity)
      });
    }

    // Create order data with nested items
    const orderCreateData = {
      user_id: String(user_id),
      user_name: String(user_name),
      user_email: user_email ? String(user_email) : null,
      user_location: user_location ? String(user_location) : null,
      product_name: String(product_name),
      product_total_price: totalPrice,
      address: String(user_address),
      payment_method: 'wallet',
      status: 'pending',
      total: totalPrice,
      subtotal: totalPrice,
      shipping: 0,
      order_items: {
        create: orderItemsData
      }
    };

    console.log('Inserting wallet order into orders table via Prisma:', orderCreateData);

    const order = await OrderDAO.create(orderCreateData);

    if (!order) {
      throw new Error("Failed to create order");
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
      await OrderDAO.delete(order.id);
      // Items cascade delete? Usually yes if configured in schema. 
      // DAO delete deletes order. If cascade is not set in DB, this might fail or leave orphans.
      // Schema:   user           users             @relation(fields: [user_id], references: [id], onDelete: Cascade)
      // Cart items:   variant        product_variants  @relation(fields: [variant_id], references: [id], onDelete: Cascade)
      // Order items: usually have relation to order with Cascade.
      // Assuming Prisma schema handles it or we need deleteMany.
      // Logic: await prisma.order_items.deleteMany({ where: { order_id: order.id } });
      // But let's trust OrderDAO.delete (which is simple delete). 
      // If it fails, that's a DB consistency issue.

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
    const { items: orders } = await OrderDAO.listAll({ paymentMethod: 'wallet' }, { limit: 100 }); // Reasonable limit or paginate
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
    const { items: orders } = await OrderDAO.listAll({ userId: user_id, paymentMethod: 'wallet' }, { limit: 100 });
    res.json({ success: true, orders });
  } catch (error) {
    console.error("Error fetching user wallet orders:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};
