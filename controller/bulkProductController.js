import { supabase } from "../config/supabaseClient.js";

// Get single product with bulk settings (including variants)
export const getProductBulkSettings = async (req, res) => {
  try {
    const { product_id } = req.params;
    const { variant_id } = req.query;
    
    console.log('Getting bulk settings for product:', product_id, 'variant:', variant_id);
    
    // Get product data
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id, name, price')
      .eq('id', product_id)
      .single();

    if (productError) {
      console.error('Product fetch error:', productError);
      return res.status(500).json({ success: false, error: productError.message });
    }

    // Get bulk settings for product or variant
    let bulkQuery = supabase
      .from('bulk_product_settings')
      .select('*')
      .eq('product_id', product_id);

    if (variant_id) {
      bulkQuery = bulkQuery.eq('variant_id', variant_id);
    } else {
      bulkQuery = bulkQuery.is('variant_id', null);
    }

    const { data: bulkSettings, error: bulkError } = await bulkQuery;

    // Don't fail if table structure is incomplete
    if (bulkError && !bulkError.message.includes('does not exist')) {
      console.error('Bulk settings fetch error:', bulkError);
      return res.status(500).json({ success: false, error: bulkError.message });
    }

    console.log('Found bulk settings:', bulkSettings);

    return res.json({ 
      success: true, 
      product: {
        ...product,
        bulk_product_settings: bulkSettings || []
      }
    });
  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// Get all products with bulk settings (including variants)
export const getBulkProducts = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select(`
        id,
        name,
        image,
        price,
        bulk_product_settings (
          id,
          variant_id,
          min_quantity,
          max_quantity,
          bulk_price,
          discount_percentage,
          is_bulk_enabled,
          is_variant_bulk,
          tier_name
        ),
        product_variants (
          id,
          variant_name,
          variant_price,
          variant_weight,
          variant_unit
        )
      `)
      .order('name');

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    return res.json({ success: true, products: data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// Get variant bulk settings
export const getVariantBulkSettings = async (req, res) => {
  try {
    const { variant_id } = req.params;
    
    const { data, error } = await supabase
      .from('bulk_product_settings')
      .select(`
        *,
        product_variants (
          id,
          variant_name,
          variant_price,
          variant_weight,
          variant_unit,
          variant_stock
        )
      `)
      .eq('variant_id', variant_id)
      .single();

    if (error && error.code !== 'PGRST116') {
      return res.status(500).json({ success: false, error: error.message });
    }

    return res.json({ 
      success: true, 
      settings: data,
      hasBulkPricing: !!data && data.is_bulk_enabled
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// Update bulk settings for a product or variant
export const updateBulkSettings = async (req, res) => {
  try {
    const { product_id } = req.params;
    const { variant_id, min_quantity, max_quantity, bulk_price, discount_percentage, is_bulk_enabled } = req.body;

    // Check if bulk settings exist
    let existingQuery = supabase
      .from('bulk_product_settings')
      .select('id')
      .eq('product_id', product_id);

    if (variant_id) {
      existingQuery = existingQuery.eq('variant_id', variant_id);
    } else {
      existingQuery = existingQuery.is('variant_id', null);
    }

    const { data: existing } = await existingQuery.maybeSingle();

    const settingsData = {
      min_quantity: parseInt(min_quantity),
      max_quantity: max_quantity ? parseInt(max_quantity) : null,
      bulk_price: parseFloat(bulk_price),
      discount_percentage: parseFloat(discount_percentage) || 0,
      is_bulk_enabled: Boolean(is_bulk_enabled),
      is_variant_bulk: !!variant_id,
      updated_at: new Date().toISOString()
    };

    let result;
    if (existing) {
      // Update existing
      const { data, error } = await supabase
        .from('bulk_product_settings')
        .update(settingsData)
        .eq('id', existing.id)
        .select()
        .single();
      
      result = { data, error };
    } else {
      // Create new
      const { data, error } = await supabase
        .from('bulk_product_settings')
        .insert([{
          product_id,
          variant_id: variant_id || null,
          ...settingsData
        }])
        .select()
        .single();
      
      result = { data, error };
    }

    if (result.error) {
      return res.status(500).json({ success: false, error: result.error.message });
    }

    return res.json({ success: true, settings: result.data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};