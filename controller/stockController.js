import prisma from "../config/prisma.js";

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

    const qty = parseInt(stock_quantity);
    if (qty < 0) {
      return res.status(400).json({
        success: false,
        error: "Stock quantity cannot be negative"
      });
    }

    // Update product stock and in_stock status
    const updateData = {
      stock_quantity: qty,
      stock: qty, // Also update legacy stock field
    };

    // Auto-update in_stock status based on stock_quantity
    if (update_in_stock) {
      updateData.in_stock = qty > 0;
    }

    const product = await prisma.products.update({
      where: {
        id: productId,
        active: true
      },
      data: updateData,
      select: {
        id: true,
        name: true,
        stock_quantity: true,
        stock: true,
        in_stock: true,
        price: true
      }
    });

    res.status(200).json({
      success: true,
      message: "Stock updated successfully",
      product: product
    });

  } catch (error) {
    console.error("Error updating stock:", error);
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        error: "Product not found or inactive"
      });
    }
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message
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

    const product = await prisma.products.findUnique({
      where: { id: productId },
      select: {
        id: true,
        name: true,
        stock_quantity: true,
        stock: true,
        in_stock: true,
        price: true,
        active: true
      }
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        error: "Product not found"
      });
    }

    res.status(200).json({
      success: true,
      product: product
    });

  } catch (error) {
    console.error("Error fetching stock:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message
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

    // Use a transaction for bulk updates
    await prisma.$transaction(async (tx) => {
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
          const qty = parseInt(stock_quantity);
          const updated = await tx.products.update({
            where: {
              id: productId,
              active: true
            },
            data: {
              stock_quantity: qty,
              stock: qty,
              in_stock: qty > 0
            },
            select: {
              id: true,
              name: true,
              stock_quantity: true,
              in_stock: true
            }
          });
          results.push(updated);
        } catch (err) {
          errors.push({
            productId,
            error: err.message
          });
        }
      }
    });

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
    console.error("Error in bulk stock update:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message
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

    const qty = parseInt(quantity);
    if (qty <= 0) {
      return res.status(400).json({
        success: false,
        error: "Quantity must be positive"
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Get current stock
      const currentProduct = await tx.products.findUnique({
        where: {
          id: productId,
          active: true
        },
        select: {
          id: true,
          name: true,
          stock_quantity: true,
          stock: true
        }
      });

      if (!currentProduct) {
        throw new Error("Product not found or inactive");
      }

      const currentStock = currentProduct.stock_quantity || currentProduct.stock || 0;
      const newStock = Math.max(0, currentStock - qty);

      // Update stock
      const updated = await tx.products.update({
        where: { id: productId },
        data: {
          stock_quantity: newStock,
          stock: newStock,
          in_stock: newStock > 0
        },
        select: {
          id: true,
          name: true,
          stock_quantity: true,
          in_stock: true
        }
      });

      return {
        product: updated,
        previousStock: currentStock
      };
    });

    res.status(200).json({
      success: true,
      message: "Stock reduced successfully",
      product: result.product,
      reduction: {
        orderId,
        previousStock: result.previousStock,
        reducedBy: qty,
        newStock: result.product.stock_quantity
      }
    });

  } catch (error) {
    console.error("Error reducing stock:", error);
    if (error.message === "Product not found or inactive") {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message
    });
  }
};

/**
 * Adjust stock for a product in a warehouse
 */
export const adjustStock = async (req, res) => {
  try {
    const { product_id, warehouse_id, quantity, type, reason } = req.body;

    if (!product_id || !warehouse_id || !quantity) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    const qty = parseInt(quantity);
    const whId = parseInt(warehouse_id);

    // Get product variant (assume default if not specified)
    const product = await prisma.products.findUnique({
      where: { id: product_id },
      include: { variants: true }
    });

    if (!product) return res.status(404).json({ success: false, error: "Product not found" });

    const variantId = product.variants.find(v => v.is_default)?.id || product.variants[0]?.id;
    if (!variantId) return res.status(400).json({ success: false, error: "Product has no variants" });

    // Find existing inventory record
    const inventory = await prisma.inventory.findFirst({
      where: {
        warehouse_id: whId,
        variant_id: variantId
      }
    });

    let newQty;
    const currentQty = inventory?.stock_qty || 0;

    if (type === "add") {
      newQty = currentQty + qty;
    } else if (type === "remove") {
      newQty = Math.max(0, currentQty - qty);
    } else { // adjust (set directly)
      newQty = qty;
    }

    const result = await prisma.$transaction(async (tx) => {
      // Update inventory
      let updated;
      if (inventory) {
        updated = await tx.inventory.update({
          where: { id: inventory.id },
          data: { stock_qty: newQty, updated_at: new Date() }
        });
      } else {
        updated = await tx.inventory.create({
          data: {
            warehouse_id: whId,
            variant_id: variantId,
            stock_qty: newQty,
            bulk_stock_threshold: 10,
            is_active: true,
            created_at: new Date(),
            updated_at: new Date()
          }
        });
      }

      // Log movement
      await tx.stock_movements.create({
        data: {
          product_id: product_id,
          warehouse_id: whId,
          variant_id: variantId,
          movement_type: type,
          quantity: type === "remove" ? -qty : qty,
          reason: reason || "Manual adjustment",
          created_at: new Date()
        }
      });

      return updated;
    });

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error("Error in adjustStock:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Transfer stock between warehouses
 */
export const transferStock = async (req, res) => {
  try {
    const { product_id, from_warehouse_id, to_warehouse_id, quantity, reason } = req.body;

    if (!product_id || !from_warehouse_id || !to_warehouse_id || !quantity) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    const qty = parseInt(quantity);
    const fromWhId = parseInt(from_warehouse_id);
    const toWhId = parseInt(to_warehouse_id);

    // Get product variant
    const product = await prisma.products.findUnique({
      where: { id: product_id },
      include: { variants: true }
    });

    if (!product) return res.status(404).json({ success: false, error: "Product not found" });
    const variantId = product.variants.find(v => v.is_default)?.id || product.variants[0]?.id;

    // Check source stock
    const sourceInventory = await prisma.inventory.findFirst({
      where: { warehouse_id: fromWhId, variant_id: variantId }
    });

    if (!sourceInventory || sourceInventory.stock_qty < qty) {
      return res.status(400).json({ success: false, error: "Insufficient stock in source warehouse" });
    }

    await prisma.$transaction(async (tx) => {
      // 1. Deduct from source
      await tx.inventory.update({
        where: { id: sourceInventory.id },
        data: { stock_qty: sourceInventory.stock_qty - qty, updated_at: new Date() }
      });

      // 2. Add to destination
      const destInventory = await tx.inventory.findFirst({
        where: { warehouse_id: toWhId, variant_id: variantId }
      });

      if (destInventory) {
        await tx.inventory.update({
          where: { id: destInventory.id },
          data: { stock_qty: destInventory.stock_qty + qty, updated_at: new Date() }
        });
      } else {
        await tx.inventory.create({
          data: {
            warehouse_id: toWhId,
            variant_id: variantId,
            stock_qty: qty,
            bulk_stock_threshold: 10,
            is_active: true,
            created_at: new Date(),
            updated_at: new Date()
          }
        });
      }

      // 3. Log movements
      await tx.stock_movements.create({
        data: {
          product_id: product_id,
          warehouse_id: fromWhId,
          variant_id: variantId,
          movement_type: "transfer_out",
          quantity: -qty,
          reason: reason || "Transfer to warehouse " + toWhId,
          created_at: new Date()
        }
      });

      await tx.stock_movements.create({
        data: {
          product_id: product_id,
          warehouse_id: toWhId,
          variant_id: variantId,
          movement_type: "transfer_in",
          quantity: qty,
          reason: reason || "Transfer from warehouse " + fromWhId,
          created_at: new Date()
        }
      });
    });

    res.status(200).json({ success: true, message: "Stock transferred successfully" });
  } catch (error) {
    console.error("Error in transferStock:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};