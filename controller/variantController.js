import ProductVariantDAO from "../dao/product-variant.dao.js";

/**
 * Variant Controller - Routes for product variants
 * Updated to use product-variant.dao.js
 */

// Get product variants
export const getProductVariants = async (req, res) => {
  try {
    const { productId } = req.params;

    const variants = await ProductVariantDAO.listByProduct(productId);

    res.json({
      success: true,
      data: variants || [],
    });
  } catch (error) {
    console.error("Error fetching variants:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// Add product variant (Admin)
// CRITICAL: This function should ONLY manage variant prices
// It should NEVER update main product prices (price, old_price, discount)
// PRICE ISOLATION: Variant prices are completely separate from main product pricing
export const addProductVariant = async (req, res) => {
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
      dimensions,
    } = req.body;

    // Validate required fields
    if (!product_id || !variant_name || !variant_value || !price) {
      return res.status(400).json({
        success: false,
        message:
          "Missing required fields: product_id, variant_name, variant_value, price",
      });
    }

    const variantData = {
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
    };

    const variant = await ProductVariantDAO.create(variantData);

    // SUCCESS: Variant added without touching main product pricing
    res.json({
      success: true,
      message: "Variant added successfully. Main product pricing preserved.",
      data: variant,
    });
  } catch (error) {
    console.error("Server error in addProductVariant:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// Update product variant (Admin)
// CRITICAL: This function should ONLY update variant prices
// It should NEVER modify main product prices (price, old_price, discount)
// PRICE ISOLATION: Variant updates must not affect main product pricing
export const updateProductVariant = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    // Remove any main product pricing fields that might accidentally be included
    delete updateData.product_price;
    delete updateData.product_old_price;
    delete updateData.product_discount;
    delete updateData.product_id; // Prevent product_id changes

    // Ensure proper data types for variant fields
    if (updateData.price) {
      updateData.price = parseFloat(updateData.price);
    }
    if (updateData.mrp) {
      updateData.mrp = parseFloat(updateData.mrp);
    }
    if (updateData.stock_quantity) {
      updateData.stock_quantity = parseInt(updateData.stock_quantity);
    }
    if (updateData.weight) {
      updateData.weight = parseFloat(updateData.weight);
    }

    const variant = await ProductVariantDAO.update(id, updateData);

    if (!variant) {
      return res.status(404).json({
        success: false,
        message: "Variant not found",
      });
    }

    // SUCCESS: Variant updated without affecting main product pricing
    res.json({
      success: true,
      message: "Variant updated successfully. Main product pricing preserved.",
      data: variant,
    });
  } catch (error) {
    console.error("Server error in updateProductVariant:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// Delete product variant (Admin)
export const deleteProductVariant = async (req, res) => {
  try {
    const { id } = req.params;

    await ProductVariantDAO.softDelete(id);

    res.json({
      success: true,
      message: "Variant deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting variant:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};
