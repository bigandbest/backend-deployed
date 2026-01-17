import ProductDAO from "../dao/product.dao.js";
import BulkProductSettingsDAO from "../dao/bulk-product-settings.dao.js";

// Get single product with bulk settings (including variants)
export const getProductBulkSettings = async (req, res) => {
  try {
    const { product_id } = req.params;
    const { variant_id } = req.query;

    console.log('Getting bulk settings for product:', product_id, 'variant:', variant_id);

    // Get product data using DAO
    const product = await ProductDAO.getProductById(product_id);

    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    // Get bulk settings for product or variant using DAO
    const bulkSettings = await BulkProductSettingsDAO.getSettings(product_id, variant_id);

    console.log('Found bulk settings:', bulkSettings);

    return res.json({
      success: true,
      product: {
        id: product.id,
        name: product.name,
        price: product.price,
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
    const data = await BulkProductSettingsDAO.listAllWithProducts();

    return res.json({ success: true, products: data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// Get variant bulk settings
export const getVariantBulkSettings = async (req, res) => {
  try {
    const { variant_id } = req.params;

    const data = await BulkProductSettingsDAO.getByVariantId(variant_id);

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

    // Check if bulk settings exist using DAO
    const existing = await BulkProductSettingsDAO.findExisting(product_id, variant_id);

    const settingsData = {
      min_quantity: parseInt(min_quantity),
      max_quantity: max_quantity ? parseInt(max_quantity) : null,
      bulk_price: parseFloat(bulk_price),
      discount_percentage: parseFloat(discount_percentage) || 0,
      is_bulk_enabled: Boolean(is_bulk_enabled),
      is_variant_bulk: !!variant_id,
      updated_at: new Date().toISOString()
    };

    let data;
    if (existing) {
      // Update existing using DAO
      data = await BulkProductSettingsDAO.update(existing.id, settingsData);
    } else {
      // Create new using DAO
      data = await BulkProductSettingsDAO.create({
        product_id,
        variant_id: variant_id || null,
        ...settingsData
      });
    }

    return res.json({ success: true, settings: data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};