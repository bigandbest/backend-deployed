import { supabase } from "../config/supabaseClient.js";

// Create COD Order
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

    const orderData = {
      user_id: String(user_id), // UUID from Supabase auth
      product_id: String(product_id),
      user_name: String(user_name),
      user_email: user_email ? String(user_email) : null,
      product_name: String(product_name),
      product_total_price: parseFloat(product_total_price),
      user_address: String(user_address),
      user_location: user_location ? String(user_location) : null,
      quantity: parseInt(quantity),
      status: 'pending'
    };

    console.log('Inserting COD order:', orderData);

    const { data, error } = await supabase
      .from("cod_orders")
      .insert([orderData])
      .select()
      .single();

    if (error) {
      console.error('Database Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    console.log('COD Order Created Successfully:', data);
    return res.status(201).json({
      success: true,
      message: "COD order created successfully",
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

// Get all COD orders (Admin)
export const getAllCodOrders = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    console.log('Fetching all COD orders - Page:', page, 'Limit:', limit, 'Status:', status);

    let query = supabase
      .from("cod_orders")
      .select("*", { count: 'exact' })
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
    
    return res.json({
      success: true,
      cod_orders: data || [],
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

// Update COD order status
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
      .from("cod_orders")
      .update({ 
        status, 
        updated_at: new Date().toISOString() 
      })
      .eq("id", parseInt(id))
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

// Get COD order by ID
export const getCodOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    console.log('Fetching COD order by ID:', id);

    const { data, error } = await supabase
      .from("cod_orders")
      .select("*")
      .eq("id", parseInt(id))
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

    return res.json({
      success: true,
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

// Delete COD order
export const deleteCodOrder = async (req, res) => {
  try {
    const { id } = req.params;
    console.log('Deleting COD order:', id);

    const { error } = await supabase
      .from("cod_orders")
      .delete()
      .eq("id", parseInt(id));

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

// Get COD orders statistics
export const getCodOrdersStats = async (req, res) => {
  try {
    console.log('Fetching COD orders statistics');

    const { data, error } = await supabase
      .from("cod_orders")
      .select("status, product_total_price");

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
      total_amount: data.reduce((sum, o) => sum + parseFloat(o.product_total_price || 0), 0)
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

// Get user's COD orders
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
      .from("cod_orders")
      .select("*")
      .eq("user_id", String(user_id))
      .order("created_at", { ascending: false });

    if (error) {
      console.error('Database Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    console.log(`Found ${data.length} COD orders for user ${user_id}`);
    return res.json({
      success: true,
      cod_orders: data || [],
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