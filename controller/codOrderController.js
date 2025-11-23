import { supabase } from "../config/supabaseClient.js";

// Create COD Order (using unified orders table)
export const createCodOrder = async (req, res) => {
  try {
    console.log('COD Order Creation Request:', req.body);
    
    const {
      user_id,
      product_id,
      user_name,
      user_email,
      product_name,
      product_total_price,
      user_address,
      user_location,
      quantity = 1
    } = req.body;

    // Validate required fields
    if (!user_id || !product_id || !user_name || !product_name || !product_total_price || !user_address) {
      console.log('Validation Error: Missing required fields');
      return res.status(400).json({
        success: false,
        error: "Missing required fields: user_id, product_id, user_name, product_name, product_total_price, user_address"
      });
    }

    // Check if total price is < 1000
    if (parseFloat(product_total_price) >= 1000) {
      console.log('Validation Error: Amount above maximum');
      return res.status(400).json({
        success: false,
        error: "COD is only available for orders below ₹1000"
      });
    }

    const totalPrice = parseFloat(product_total_price);
    const orderData = {
      user_id: String(user_id),
      user_name: String(user_name),
      user_email: user_email ? String(user_email) : null,
      user_location: user_location ? String(user_location) : null,
      product_name: String(product_name),
      product_total_price: totalPrice,
      address: String(user_address),
      payment_method: 'cod', // Mark as COD order
      status: 'pending',
      total: totalPrice,
      subtotal: totalPrice,
      shipping: 0
    };

    console.log('Inserting COD order into unified orders table:', orderData);

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

    // Create order item entry
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
      // Rollback order if item creation fails
      await supabase.from("orders").delete().eq("id", order.id);
      return res.status(500).json({
        success: false,
        error: itemError.message
      });
    }

    console.log('COD Order Created Successfully:', order);
    return res.status(201).json({
      success: true,
      message: "COD order created successfully",
      cod_order: order
    });
  } catch (error) {
    console.error('Server Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Get all COD orders (Admin) - using unified orders table
export const getAllCodOrders = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    console.log('Fetching all COD orders - Page:', page, 'Limit:', limit, 'Status:', status);

    let query = supabase
      .from("orders")
      .select("*, order_items(id, product_id, quantity, price)", { count: 'exact' })
      .eq('payment_method', 'cod') // Filter for COD orders only
      .order("created_at", { ascending: false });

    // Filter by status if provided
    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query
      .range(offset, offset + parseInt(limit) - 1);

    if (error) {
      console.error('Database Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    console.log(`Found ${count} total COD orders, returning ${data.length} for page ${page}`);
    
    // Transform data to match old COD order format for backward compatibility
    const transformedOrders = data.map(order => ({
      id: order.id,
      user_id: order.user_id,
      user_name: order.user_name,
      user_email: order.user_email,
      user_location: order.user_location,
      product_name: order.product_name,
      product_total_price: order.product_total_price || order.total,
      user_address: order.address,
      quantity: order.order_items?.[0]?.quantity || 1,
      product_id: order.order_items?.[0]?.product_id || '',
      status: order.status,
      created_at: order.created_at,
      updated_at: order.updated_at
    }));
    
    return res.json({
      success: true,
      cod_orders: transformedOrders,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Server Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Update COD order status - using unified orders table
export const updateCodOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    console.log(`Updating COD order ${id} status to:`, status);

    // Validate status
    const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Valid statuses: ${validStatuses.join(', ')}`
      });
    }

    const { data, error } = await supabase
      .from("orders")
      .update({ 
        status, 
        updated_at: new Date().toISOString() 
      })
      .eq("id", id)
      .eq("payment_method", "cod") // Ensure we only update COD orders
      .select()
      .single();

    if (error) {
      console.error('Database Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        error: "COD order not found"
      });
    }

    console.log('COD order status updated successfully:', data);
    return res.json({
      success: true,
      message: "COD order status updated successfully",
      cod_order: data
    });
  } catch (error) {
    console.error('Server Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Get COD order by ID - using unified orders table
export const getCodOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    console.log('Fetching COD order by ID:', id);

    const { data, error } = await supabase
      .from("orders")
      .select("*, order_items(id, product_id, quantity, price)")
      .eq("id", id)
      .eq("payment_method", "cod")
      .single();

    if (error) {
      console.error('Database Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        error: "COD order not found"
      });
    }

    // Transform to match old format
    const transformedOrder = {
      id: data.id,
      user_id: data.user_id,
      user_name: data.user_name,
      user_email: data.user_email,
      user_location: data.user_location,
      product_name: data.product_name,
      product_total_price: data.product_total_price || data.total,
      user_address: data.address,
      quantity: data.order_items?.[0]?.quantity || 1,
      product_id: data.order_items?.[0]?.product_id || '',
      status: data.status,
      created_at: data.created_at,
      updated_at: data.updated_at
    };

    return res.json({
      success: true,
      cod_order: transformedOrder
    });
  } catch (error) {
    console.error('Server Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Delete COD order - using unified orders table
export const deleteCodOrder = async (req, res) => {
  try {
    const { id } = req.params;
    console.log('Deleting COD order:', id);

    // First delete order items
    const { error: itemsError } = await supabase
      .from("order_items")
      .delete()
      .eq("order_id", id);

    if (itemsError) {
      console.error('Error deleting order items:', itemsError);
      return res.status(500).json({
        success: false,
        error: itemsError.message
      });
    }

    // Then delete the order
    const { error } = await supabase
      .from("orders")
      .delete()
      .eq("id", id)
      .eq("payment_method", "cod");

    if (error) {
      console.error('Database Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    return res.json({
      success: true,
      message: "COD order deleted successfully"
    });
  } catch (error) {
    console.error('Server Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Get COD orders statistics - using unified orders table
export const getCodOrdersStats = async (req, res) => {
  try {
    console.log('Fetching COD orders statistics');

    const { data, error } = await supabase
      .from("orders")
      .select("status, total, product_total_price")
      .eq("payment_method", "cod");

    if (error) {
      console.error('Database Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    const stats = {
      total_orders: data.length,
      pending: data.filter(o => o.status === 'pending').length,
      processing: data.filter(o => o.status === 'processing').length,
      shipped: data.filter(o => o.status === 'shipped').length,
      delivered: data.filter(o => o.status === 'delivered').length,
      cancelled: data.filter(o => o.status === 'cancelled').length,
      total_amount: data.reduce((sum, o) => sum + parseFloat(o.product_total_price || o.total || 0), 0)
    };

    return res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Server Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Get user's COD orders - using unified orders table
export const getUserCodOrders = async (req, res) => {
  try {
    const { user_id } = req.params;
    console.log('Fetching COD orders for user:', user_id);

    if (!user_id) {
      return res.status(400).json({
        success: false,
        error: "User ID is required"
      });
    }

    const { data, error } = await supabase
      .from("orders")
      .select("*, order_items(id, product_id, quantity, price)")
      .eq("user_id", String(user_id))
      .eq("payment_method", "cod")
      .order("created_at", { ascending: false });

    if (error) {
      console.error('Database Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    // Transform to match old format
    const transformedOrders = data.map(order => ({
      id: order.id,
      user_id: order.user_id,
      user_name: order.user_name,
      user_email: order.user_email,
      user_location: order.user_location,
      product_name: order.product_name,
      product_total_price: order.product_total_price || order.total,
      user_address: order.address,
      quantity: order.order_items?.[0]?.quantity || 1,
      product_id: order.order_items?.[0]?.product_id || '',
      status: order.status,
      created_at: order.created_at,
      updated_at: order.updated_at
    }));

    console.log(`Found ${data.length} COD orders for user ${user_id}`);
    return res.json({
      success: true,
      cod_orders: transformedOrders,
      total: data.length
    });
  } catch (error) {
    console.error('Server Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};