import { supabase } from '../config/supabaseClient.js';

// Get product variants
const getProductVariants = async (req, res) => {
  try {
    const { productId } = req.params;

    const { data, error } = await supabase
      .from('product_variants')
      .select('*')
      .eq('product_id', productId)
      .eq('is_active', true)
      .order('price', { ascending: true });

    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Error fetching variants',
        error: error.message
      });
    }

    res.json({
      success: true,
      data: data || []
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Add product variant (Admin)
// CRITICAL: This function should ONLY manage variant prices
// It should NEVER update main product prices (price, old_price, discount)
// PRICE ISOLATION: Variant prices are completely separate from main product pricing
const addProductVariant = async (req, res) => {
  try {
    const {
      product_id,
      variant_name,
      variant_value,
      price,
      mrp,
      stock_quantity,
      sku,
      weight,
      dimensions
    } = req.body;

    // Validate required fields
    if (!product_id || !variant_name || !variant_value || !price) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: product_id, variant_name, variant_value, price'
      });
    }

    // IMPORTANT: Only insert into product_variants table
    // This operation must NOT affect main products table pricing
    const { data, error } = await supabase
      .from('product_variants')
      .insert([{
        product_id: String(product_id),
        variant_name,
        variant_value,
        price: parseFloat(price),
        mrp: mrp ? parseFloat(mrp) : null,
        stock_quantity: stock_quantity ? parseInt(stock_quantity) : 0,
        sku,
        weight: weight ? parseFloat(weight) : null,
        dimensions,
        is_active: true,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) {
      console.error('Error adding variant:', error);
      return res.status(500).json({
        success: false,
        message: 'Error adding variant',
        error: error.message
      });
    }

    // SUCCESS: Variant added without touching main product pricing
    res.json({
      success: true,
      message: 'Variant added successfully. Main product pricing preserved.',
      data
    });
  } catch (error) {
    console.error('Server error in addProductVariant:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Update product variant (Admin) 
// CRITICAL: This function should ONLY update variant prices
// It should NEVER modify main product prices (price, old_price, discount)
// PRICE ISOLATION: Variant updates must not affect main product pricing
const updateProductVariant = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // SECURITY: Sanitize update data to prevent main product pricing changes
    const sanitizedData = { ...updateData };
    
    // Remove any main product pricing fields that might accidentally be included
    delete sanitizedData.product_price; // Remove main product price references
    delete sanitizedData.product_old_price; // Remove main product old_price references
    delete sanitizedData.product_discount; // Remove main product discount references
    delete sanitizedData.product_id; // Prevent product_id changes
    
    // Ensure proper data types for variant fields
    if (sanitizedData.price) {
      sanitizedData.price = parseFloat(sanitizedData.price);
    }
    if (sanitizedData.mrp) {
      sanitizedData.mrp = parseFloat(sanitizedData.mrp);
    }
    if (sanitizedData.stock_quantity) {
      sanitizedData.stock_quantity = parseInt(sanitizedData.stock_quantity);
    }
    if (sanitizedData.weight) {
      sanitizedData.weight = parseFloat(sanitizedData.weight);
    }

    // Add update timestamp
    sanitizedData.updated_at = new Date().toISOString();

    // IMPORTANT: Only update product_variants table
    const { data, error } = await supabase
      .from('product_variants')
      .update(sanitizedData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating variant:', error);
      return res.status(500).json({
        success: false,
        message: 'Error updating variant',
        error: error.message
      });
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        message: 'Variant not found'
      });
    }

    // SUCCESS: Variant updated without affecting main product pricing
    res.json({
      success: true,
      message: 'Variant updated successfully. Main product pricing preserved.',
      data
    });
  } catch (error) {
    console.error('Server error in updateProductVariant:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Delete product variant (Admin)
const deleteProductVariant = async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('product_variants')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Error deleting variant',
        error: error.message
      });
    }

    res.json({
      success: true,
      message: 'Variant deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

export {
  getProductVariants,
  addProductVariant,
  updateProductVariant,
  deleteProductVariant
};