import { supabase } from '../config/supabaseClient.js';

// Get bulk wholesale settings for a product (all tiers)
export const getBulkWholesaleSettings = async (req, res) => {
  try {
    const { productId } = req.params;

    const { data, error } = await supabase
      .from('bulk_wholesale_settings')
      .select('*')
      .eq('product_id', String(productId))
      .eq('is_bulk_enabled', true)
      .order('sort_order', { ascending: true });

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    if (!data || data.length === 0) {
      return res.status(200).json({
        success: true,
        hasBulkPricing: false,
        message: 'No bulk pricing available for this product'
      });
    }

    res.status(200).json({
      success: true,
      hasBulkPricing: true,
      bulkSettings: data, // Now returns array of all tiers
      totalTiers: data.length
    });

  } catch (error) {
    console.error('Error fetching bulk wholesale settings:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// Save bulk wholesale settings (supports multiple tiers)
// CRITICAL: This function manages ONLY bulk pricing settings
// It must NEVER update main product prices (price, old_price, discount)
// PRICE ISOLATION: Bulk pricing is completely separate from main product pricing
export const saveBulkWholesaleSettings = async (req, res) => {
  try {
    const { product_id, tiers } = req.body;

    if (!product_id || !tiers || !Array.isArray(tiers)) {
      return res.status(400).json({
        success: false,
        error: 'Product ID and tiers array are required'
      });
    }

    // Validate tiers data
    for (let i = 0; i < tiers.length; i++) {
      const tier = tiers[i];
      if (!tier.min_quantity || !tier.bulk_price) {
        return res.status(400).json({
          success: false,
          error: `Tier ${i + 1}: min_quantity and bulk_price are required`
        });
      }
    }

    // IMPORTANT: First delete existing bulk settings for this product
    // This operation must NOT affect main products table
    await supabase
      .from('bulk_wholesale_settings')
      .delete()
      .eq('product_id', String(product_id));

    // Insert new tiers - ONLY in bulk_wholesale_settings table
    const insertData = tiers.map((tier, index) => ({
      product_id: String(product_id),
      tier_name: tier.tier_name || `Tier ${index + 1}`,
      min_quantity: parseInt(tier.min_quantity),
      max_quantity: tier.max_quantity ? parseInt(tier.max_quantity) : null,
      bulk_price: parseFloat(tier.bulk_price),
      discount_percentage: tier.discount_percentage ? parseFloat(tier.discount_percentage) : 0,
      sort_order: index + 1,
      is_bulk_enabled: true,
      created_at: new Date().toISOString()
    }));

    const { data, error } = await supabase
      .from('bulk_wholesale_settings')
      .insert(insertData)
      .select();

    if (error) {
      console.error('Error saving bulk wholesale settings:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    // SUCCESS: Bulk settings saved without affecting main product pricing
    res.status(200).json({
      success: true,
      message: `${tiers.length} bulk wholesale tiers saved successfully. Main product pricing preserved.`,
      data: data,
      note: "Bulk pricing is independent from main product pricing"
    });

  } catch (error) {
    console.error('Error saving bulk wholesale settings:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// Get all products with bulk settings
export const getAllProductsWithBulkSettings = async (req, res) => {
  try {
    // Get products first
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('*')
      .eq('active', true);

    if (productsError) {
      return res.status(500).json({
        success: false,
        error: productsError.message
      });
    }

    // Get bulk settings for all products
    const { data: bulkSettings, error: bulkError } = await supabase
      .from('bulk_wholesale_settings')
      .select('*')
      .eq('is_bulk_enabled', true)
      .order('product_id')
      .order('sort_order');

    if (bulkError) {
      return res.status(500).json({
        success: false,
        error: bulkError.message
      });
    }

    // Combine products with their bulk settings
    const productsWithBulk = products.map(product => ({
      ...product,
      bulk_wholesale_settings: bulkSettings.filter(setting => 
        setting.product_id === String(product.id)
      )
    }));

    res.status(200).json({
      success: true,
      products: productsWithBulk
    });

  } catch (error) {
    console.error('Error fetching products with bulk settings:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};