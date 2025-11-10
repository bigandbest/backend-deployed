import { supabase } from "../config/supabaseClient.js";

/**
 * Update product stock quantity
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
export const updateProductStock = async (req, res) => {
  try {
    const { productId } = req.params;
    const { stock_quantity, update_in_stock = true } = req.body;

    if (!productId) {
      return res.status(400).json({
        success: false,
        error: "Product ID is required"
      });
    }

    if (stock_quantity === undefined || stock_quantity === null) {
      return res.status(400).json({
        success: false,
        error: "Stock quantity is required"
      });
    }

    if (stock_quantity < 0) {
      return res.status(400).json({
        success: false,
        error: "Stock quantity cannot be negative"
      });
    }

    // Update product stock and in_stock status
    const updateData = {
      stock_quantity: parseInt(stock_quantity),
      stock: parseInt(stock_quantity), // Also update legacy stock field
    };

    // Auto-update in_stock status based on stock_quantity
    if (update_in_stock) {
      updateData.in_stock = stock_quantity > 0;
    }

    const { data, error } = await supabase
      .from("products")
      .update(updateData)
      .eq("id", productId)
      .eq("active", true)
      .select("id, name, stock_quantity, stock, in_stock, price")
      .single();

    if (error) {
      console.error("Database error updating stock:", error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        error: "Product not found or inactive"
      });
    }

    res.status(200).json({
      success: true,
      message: "Stock updated successfully",
      product: data
    });

  } catch (error) {
    console.error("Server error updating stock:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};

/**
 * Get product stock information
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
export const getProductStock = async (req, res) => {
  try {
    const { productId } = req.params;

    if (!productId) {
      return res.status(400).json({
        success: false,
        error: "Product ID is required"
      });
    }

    const { data, error } = await supabase
      .from("products")
      .select("id, name, stock_quantity, stock, in_stock, price, active")
      .eq("id", productId)
      .single();

    if (error) {
      console.error("Database error fetching stock:", error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        error: "Product not found"
      });
    }

    res.status(200).json({
      success: true,
      product: data
    });

  } catch (error) {
    console.error("Server error fetching stock:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};

/**
 * Bulk update stock for multiple products
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
export const bulkUpdateStock = async (req, res) => {
  try {
    const { updates } = req.body;

    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Updates array is required"
      });
    }

    const results = [];
    const errors = [];

    for (const update of updates) {
      const { productId, stock_quantity } = update;

      if (!productId || stock_quantity === undefined) {
        errors.push({
          productId,
          error: "Product ID and stock_quantity are required"
        });
        continue;
      }

      try {
        const updateData = {
          stock_quantity: parseInt(stock_quantity),
          stock: parseInt(stock_quantity),
          in_stock: stock_quantity > 0
        };

        const { data, error } = await supabase
          .from("products")
          .update(updateData)
          .eq("id", productId)
          .eq("active", true)
          .select("id, name, stock_quantity, in_stock")
          .single();

        if (error) {
          errors.push({
            productId,
            error: error.message
          });
        } else if (data) {
          results.push(data);
        } else {
          errors.push({
            productId,
            error: "Product not found or inactive"
          });
        }
      } catch (err) {
        errors.push({
          productId,
          error: err.message
        });
      }
    }

    res.status(200).json({
      success: true,
      message: `Updated ${results.length} products successfully`,
      results,
      errors: errors.length > 0 ? errors : undefined,
      summary: {
        total: updates.length,
        successful: results.length,
        failed: errors.length
      }
    });

  } catch (error) {
    console.error("Server error in bulk stock update:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};

/**
 * Reduce stock quantity (for order processing)
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
export const reduceStock = async (req, res) => {
  try {
    const { productId } = req.params;
    const { quantity, orderId } = req.body;

    if (!productId || !quantity) {
      return res.status(400).json({
        success: false,
        error: "Product ID and quantity are required"
      });
    }

    if (quantity <= 0) {
      return res.status(400).json({
        success: false,
        error: "Quantity must be positive"
      });
    }

    // Get current stock
    const { data: currentProduct, error: fetchError } = await supabase
      .from("products")
      .select("id, name, stock_quantity, stock, in_stock")
      .eq("id", productId)
      .eq("active", true)
      .single();

    if (fetchError) {
      return res.status(500).json({
        success: false,
        error: fetchError.message
      });
    }

    if (!currentProduct) {
      return res.status(404).json({
        success: false,
        error: "Product not found or inactive"
      });
    }

    const currentStock = currentProduct.stock_quantity || currentProduct.stock || 0;
    const newStock = Math.max(0, currentStock - quantity);

    // Update stock
    const { data, error } = await supabase
      .from("products")
      .update({
        stock_quantity: newStock,
        stock: newStock,
        in_stock: newStock > 0
      })
      .eq("id", productId)
      .select("id, name, stock_quantity, in_stock")
      .single();

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    res.status(200).json({
      success: true,
      message: "Stock reduced successfully",
      product: data,
      reduction: {
        orderId,
        previousStock: currentStock,
        reducedBy: quantity,
        newStock: newStock
      }
    });

  } catch (error) {
    console.error("Server error reducing stock:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};