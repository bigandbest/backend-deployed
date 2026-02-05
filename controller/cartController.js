import CartDAO from "../dao/cart.dao.js";
import ProductDAO from "../dao/product.dao.js";
import ProductVariantDAO from "../dao/product-variant.dao.js";
import InventoryDAO from "../dao/inventory.dao.js";
import * as deliveryValidationService from "./deliveryValidationService.js";

export const getCartItems = async (req, res) => {
  try {
    const { user_id } = req.params;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        error: "User ID is required"
      });
    }

    const data = await CartDAO.getCartByUserId(user_id);

    const cartItems = data.map((item) => {
      const product = item.variant?.product;
      const variant = item.variant;
      const primaryMedia = product?.media?.[0];

      // Calculate stock info from inventory
      const stock_info = {
        available_stock: 0,
        in_stock: false,
        low_stock: false
      };

      if (variant?.warehouse_stock && Array.isArray(variant.warehouse_stock)) {
        const available = variant.warehouse_stock.reduce((sum, inv) =>
          sum + (inv.stock_quantity || 0) - (inv.reserved_quantity || 0), 0);
        stock_info.available_stock = available < 0 ? 0 : available;
        stock_info.in_stock = stock_info.available_stock > 0;
        stock_info.low_stock = stock_info.available_stock > 0 && stock_info.available_stock < 10;
      }

      // Image Resolution: Check variant media first, then product primary media, then product image fallback
      const variantMedia = variant?.media?.[0]?.url || variant?.media?.[0]?.media_url;
      const productMedia = primaryMedia?.media_url || primaryMedia?.url;
      const finalImage = variantMedia || productMedia || product?.image || null;

      return {
        ...product,
        cart_item_id: item.id,
        quantity: item.quantity,
        added_at: item.added_at,
        variant_id: item.variant_id,
        variant: variant,
        stock_info,
        is_bid_product: item.is_bid_product || false,
        locked_bid_id: item.locked_bid_id,
        price: item.is_bid_product
          ? item.bid_unit_price
          : (variant?.price || variant?.variant_price || product?.price || 0),
        oldPrice: variant?.old_price || variant?.variant_old_price || product?.old_price || 0,
        weight: variant?.title || variant?.variant_weight || variant?.weight || product?.uom || "1 Unit",
        bid_details: null,
        image: finalImage,
        media_url: finalImage,
      };
    });

    return res.json({
      success: true,
      cartItems,
      expired_bid_items: 0,
    });
  } catch (error) {
    console.error("Error in getCartItems:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};

export const addToCart = async (req, res) => {
  try {
    let { user_id, product_id, quantity = 1, variant_id } = req.body;
    quantity = parseInt(quantity);

    if (!user_id || !product_id) {
      return res.status(400).json({
        success: false,
        error: "user_id and product_id are required",
      });
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({
        success: false,
        error: "Quantity must be a positive integer",
      });
    }

    if (!variant_id) {
      return res.status(400).json({
        success: false,
        error: "variant_id is required for inventory tracking",
      });
    }

    product_id = String(product_id);
    variant_id = String(variant_id);

    const variant = await ProductVariantDAO.getById(variant_id);
    if (!variant) {
      return res.status(404).json({
        success: false,
        error: "Variant not found"
      });
    }

    const stockInfo = await InventoryDAO.getAvailableStock(variant_id);
    const availableStock = stockInfo.available_stock || 0;

    if (availableStock < quantity) {
      return res.status(400).json({
        success: false,
        error: `Insufficient stock. Available: ${availableStock}, Requested: ${quantity}`,
      });
    }

    const cartItem = await CartDAO.addToCart(user_id, variant_id, quantity, {
      isBidProduct: false
    });

    return res.status(200).json({
      success: true,
      cartItem,
      message: `Added ${quantity} item(s) to cart`,
    });
  } catch (error) {
    console.error("Error in addToCart:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error"
    });
  }
};

export const updateCartItem = async (req, res) => {
  try {
    const { cart_item_id } = req.params;
    let { quantity } = req.body;
    quantity = parseInt(quantity);

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({
        success: false,
        error: "Quantity must be a positive integer"
      });
    }

    const currentCartItem = await CartDAO.getCartItemById(cart_item_id);

    if (!currentCartItem) {
      return res.status(404).json({
        success: false,
        error: "Cart item not found"
      });
    }

    if (currentCartItem.is_bid_product) {
      return res.status(400).json({
        success: false,
        error: "Cannot modify quantity of bid products",
        is_bid_product: true,
      });
    }

    if (!currentCartItem.variant_id) {
      return res.status(400).json({
        success: false,
        error: "Cart item must have a variant_id for inventory tracking",
      });
    }

    const currentCartQuantity = currentCartItem.quantity;
    const quantityDifference = quantity - currentCartQuantity;

    if (quantityDifference > 0) {
      const stockInfo = await InventoryDAO.getAvailableStock(currentCartItem.variant_id);
      const availableStock = stockInfo.available_stock || 0;

      if (availableStock < quantityDifference) {
        return res.status(400).json({
          success: false,
          error: `Insufficient stock. Available: ${availableStock}, Requested: ${quantityDifference}`,
        });
      }
    }

    const updatedCartItem = await CartDAO.updateQuantity(cart_item_id, quantity);

    return res.status(200).json({
      success: true,
      cartItem: updatedCartItem,
      message: "Cart updated successfully",
    });
  } catch (error) {
    console.error("Error in updateCartItem:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};

export const removeCartItem = async (req, res) => {
  try {
    const { cart_item_id } = req.params;

    const cartItem = await CartDAO.getCartItemById(cart_item_id);

    if (!cartItem) {
      return res.status(404).json({
        success: false,
        error: "Cart item not found"
      });
    }

    if (cartItem.is_bid_product) {
      return res.status(400).json({
        success: false,
        error: "Cannot remove bid products manually"
      });
    }

    await CartDAO.removeFromCart(cart_item_id);

    return res.status(200).json({
      success: true,
      message: "Item removed from cart"
    });
  } catch (error) {
    console.error("Error in removeCartItem:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};

export const clearCart = async (req, res) => {
  try {
    const { user_id } = req.params;

    await CartDAO.clearCart(user_id);

    return res.status(200).json({
      success: true,
      message: "Cart cleared successfully"
    });
  } catch (error) {
    console.error("Error in clearCart:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};

export const validateCartDelivery = async (req, res) => {
  try {
    const { user_id, pincode } = req.body;

    if (!user_id || !pincode) {
      return res.status(400).json({
        success: false,
        error: "User ID and pincode are required"
      });
    }

    const cartItemsFull = await CartDAO.getCartByUserId(user_id);

    if (!cartItemsFull || cartItemsFull.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Cart is empty"
      });
    }

    const cartItems = cartItemsFull.map(item => ({
      product_id: item.variant?.product_id,
      variant_id: item.variant_id,
      quantity: item.quantity,
    }));

    const validationResult = await deliveryValidationService.checkMultipleProductsDelivery(
      cartItems,
      pincode
    );

    res.status(200).json({
      success: true,
      ...validationResult,
      cart_summary: {
        total_items: cartItems.length,
        user_id,
        pincode,
      },
    });
  } catch (error) {
    console.error("Error in validateCartDelivery:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};

export const reserveCartStock = async (req, res) => {
  try {
    const { user_id, pincode, warehouse_assignments } = req.body;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        error: "User ID is required"
      });
    }

    const cartItems = await CartDAO.getCartByUserId(user_id);

    if (!cartItems || cartItems.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Cart is empty"
      });
    }

    const reservations = [];
    for (const item of cartItems) {
      if (!item.variant_id) continue;

      const warehouseId = warehouse_assignments?.[item.variant_id] || 1;

      try {
        await InventoryDAO.reserveStock(
          item.variant_id,
          item.quantity,
          warehouseId
        );

        reservations.push({
          variant_id: item.variant_id,
          quantity: item.quantity,
          warehouse_id: warehouseId,
          status: "reserved",
        });
      } catch (error) {
        console.error(`Failed to reserve stock for variant ${item.variant_id}:`, error);
        reservations.push({
          variant_id: item.variant_id,
          quantity: item.quantity,
          warehouse_id: warehouseId,
          status: "failed",
          error: error.message,
        });
      }
    }

    const allReserved = reservations.every(r => r.status === "reserved");

    res.status(allReserved ? 200 : 207).json({
      success: allReserved,
      message: allReserved ? "Stock reserved successfully" : "Partial reservation",
      reservations,
    });
  } catch (error) {
    console.error("Error in reserveCartStock:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Internal server error"
    });
  }
};

export const confirmCartStockDeduction = async (req, res) => {
  try {
    const { order_id, warehouse_assignments } = req.body;

    if (!order_id) {
      return res.status(400).json({
        success: false,
        error: "Order ID is required"
      });
    }

    res.status(200).json({
      success: true,
      message: "Stock deduction confirmed",
      order_id,
    });
  } catch (error) {
    console.error("Error in confirmCartStockDeduction:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Internal server error"
    });
  }
};

export const checkCartHasBidProducts = async (req, res) => {
  try {
    const { user_id } = req.params;

    const hasBidProducts = await CartDAO.hasBidProducts(user_id);

    res.status(200).json({
      success: true,
      has_bid_products: hasBidProducts
    });
  } catch (error) {
    console.error("Error in checkCartHasBidProducts:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};
