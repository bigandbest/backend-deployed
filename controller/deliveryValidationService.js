import { supabase } from "../config/supabaseClient.js";

/**
 * Delivery Validation Service
 * Handles warehouse-based delivery validation with fallback logic
 */

/**
 * Check if a product is deliverable to a specific pincode
 * Implements warehouse fallback logic:
 * - Nationwide products: Check zonal warehouse first, then fallback to central
 * - Zonal products: Check only zonal warehouses
 */
const checkProductDelivery = async (productId, pincode, quantity = 1) => {
  try {
    // Step 1: Get product delivery type and zone for pincode
    const productQuery = supabase
      .from("products")
      .select("id, name, delivery_type, allowed_zone_ids")
      .eq("id", productId)
      .single();

    const pincodeQuery = supabase
      .from("zone_pincodes")
      .select("zone_id, delivery_zones!inner(id, name, is_active)")
      .eq("pincode", pincode)
      .eq("is_active", true)
      .eq("delivery_zones.is_active", true)
      .single();

    const [productResult, pincodeResult] = await Promise.all([
      productQuery,
      pincodeQuery,
    ]);

    if (productResult.error) {
      return {
        success: false,
        deliverable: false,
        error: "Product not found",
      };
    }

    if (pincodeResult.error) {
      return {
        success: false,
        deliverable: false,
        error: "Pincode not serviceable",
        message: "This pincode is not in our delivery network",
      };
    }

    const product = productResult.data;
    const userZone = pincodeResult.data;

    // Step 2: Check delivery eligibility based on product type
    let isEligibleByZone = false;

    if (product.delivery_type === "nationwide") {
      isEligibleByZone = true;
    } else if (product.delivery_type === "zonal") {
      // Check if product is allowed in this zone
      isEligibleByZone =
        product.allowed_zone_ids &&
        product.allowed_zone_ids.includes(userZone.zone_id);
    }

    if (!isEligibleByZone) {
      return {
        success: true,
        deliverable: false,
        message: "Product not available in your area",
        reason: "zone_restriction",
      };
    }

    // Step 3: Check stock availability with warehouse fallback logic
    const stockResult = await checkWarehouseStock(
      product,
      userZone.zone_id,
      quantity
    );

    return {
      success: true,
      deliverable: stockResult.available,
      ...stockResult,
      product_info: {
        id: product.id,
        name: product.name,
        delivery_type: product.delivery_type,
      },
      delivery_info: {
        zone_id: userZone.zone_id,
        zone_name: userZone.delivery_zones.name,
        pincode,
      },
    };
  } catch (error) {
    console.error("Error in checkProductDelivery:", error);
    return {
      success: false,
      deliverable: false,
      error: "Internal server error",
    };
  }
};

/**
 * Check warehouse stock with fallback logic
 */
const checkWarehouseStock = async (product, zoneId, quantity) => {
  try {
    if (product.delivery_type === "nationwide") {
      // Nationwide: Check zonal warehouse first, then central fallback
      return await checkNationwideProductStock(product.id, zoneId, quantity);
    } else {
      // Zonal: Check only zonal warehouses
      return await checkZonalProductStock(product.id, zoneId, quantity);
    }
  } catch (error) {
    console.error("Error in checkWarehouseStock:", error);
    return {
      available: false,
      error: "Stock check failed",
    };
  }
};

/**
 * Check stock for nationwide products (with central fallback)
 */
const checkNationwideProductStock = async (productId, zoneId, quantity) => {
  try {
    // First, check zonal warehouse for this zone
    const { data: zonalStock } = await supabase
      .from("product_warehouse_stock")
      .select(
        `
        *,
        warehouses!inner(id, name, type),
        warehouse_zones!inner(zone_id)
      `
      )
      .eq("product_id", productId)
      .eq("warehouse_zones.zone_id", zoneId)
      .eq("warehouses.type", "zonal")
      .eq("warehouses.is_active", true)
      .eq("is_active", true)
      .gte("stock_quantity", quantity)
      .gt("stock_quantity", "reserved_quantity")
      .order("stock_quantity", { ascending: false })
      .limit(1);

    // Check if zonal stock is available
    if (zonalStock && zonalStock.length > 0) {
      const stock = zonalStock[0];
      const availableQuantity = stock.stock_quantity - stock.reserved_quantity;

      if (availableQuantity >= quantity) {
        return {
          available: true,
          source_warehouse: {
            id: stock.warehouse_id,
            name: stock.warehouses.name,
            type: "zonal",
          },
          available_quantity: availableQuantity,
          message: "Available from local warehouse",
          fallback_used: false,
        };
      }
    }

    // Fallback to central warehouse
    const { data: centralStock } = await supabase
      .from("product_warehouse_stock")
      .select(
        `
        *,
        warehouses!inner(id, name, type)
      `
      )
      .eq("product_id", productId)
      .eq("warehouses.type", "central")
      .eq("warehouses.is_active", true)
      .eq("is_active", true)
      .gte("stock_quantity", quantity)
      .gt("stock_quantity", "reserved_quantity")
      .order("stock_quantity", { ascending: false })
      .limit(1);

    if (centralStock && centralStock.length > 0) {
      const stock = centralStock[0];
      const availableQuantity = stock.stock_quantity - stock.reserved_quantity;

      if (availableQuantity >= quantity) {
        return {
          available: true,
          source_warehouse: {
            id: stock.warehouse_id,
            name: stock.warehouses.name,
            type: "central",
          },
          available_quantity: availableQuantity,
          message: "Available from central warehouse",
          fallback_used: true,
          fallback_reason: "local_warehouse_out_of_stock",
        };
      }
    }

    return {
      available: false,
      message: "Out of stock",
      reason: "insufficient_stock",
    };
  } catch (error) {
    console.error("Error in checkNationwideProductStock:", error);
    return {
      available: false,
      error: "Stock check failed",
    };
  }
};

/**
 * Check stock for zonal products (no fallback)
 */
const checkZonalProductStock = async (productId, zoneId, quantity) => {
  try {
    const { data: zonalStock } = await supabase
      .from("product_warehouse_stock")
      .select(
        `
        *,
        warehouses!inner(id, name, type),
        warehouse_zones!inner(zone_id)
      `
      )
      .eq("product_id", productId)
      .eq("warehouse_zones.zone_id", zoneId)
      .eq("warehouses.type", "zonal")
      .eq("warehouses.is_active", true)
      .eq("is_active", true)
      .gte("stock_quantity", quantity)
      .gt("stock_quantity", "reserved_quantity")
      .order("stock_quantity", { ascending: false })
      .limit(1);

    if (zonalStock && zonalStock.length > 0) {
      const stock = zonalStock[0];
      const availableQuantity = stock.stock_quantity - stock.reserved_quantity;

      if (availableQuantity >= quantity) {
        return {
          available: true,
          source_warehouse: {
            id: stock.warehouse_id,
            name: stock.warehouses.name,
            type: "zonal",
          },
          available_quantity: availableQuantity,
          message: "Available from zonal warehouse",
          fallback_used: false,
        };
      }
    }

    return {
      available: false,
      message: "Product not available in your area",
      reason: "zonal_out_of_stock",
    };
  } catch (error) {
    console.error("Error in checkZonalProductStock:", error);
    return {
      available: false,
      error: "Stock check failed",
    };
  }
};

/**
 * Reserve stock for an order (atomic operation)
 */
const reserveProductStock = async (
  productId,
  warehouseId,
  quantity,
  orderId
) => {
  try {
    const { data, error } = await supabase.rpc("update_stock_with_movement", {
      p_product_id: productId,
      p_warehouse_id: warehouseId,
      p_movement_type: "reservation",
      p_quantity: quantity,
      p_reference_type: "order",
      p_reference_id: orderId,
      p_reason: `Stock reserved for order ${orderId}`,
    });

    if (error) {
      console.error("Error reserving stock:", error);
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
      message: "Stock reserved successfully",
    };
  } catch (error) {
    console.error("Error in reserveProductStock:", error);
    return {
      success: false,
      error: "Failed to reserve stock",
    };
  }
};

/**
 * Confirm stock deduction after order confirmation
 */
const confirmStockDeduction = async (
  productId,
  warehouseId,
  quantity,
  orderId
) => {
  try {
    // First release the reservation
    await supabase.rpc("update_stock_with_movement", {
      p_product_id: productId,
      p_warehouse_id: warehouseId,
      p_movement_type: "release",
      p_quantity: quantity,
      p_reference_type: "order",
      p_reference_id: orderId,
      p_reason: `Release reservation for order ${orderId}`,
    });

    // Then deduct actual stock
    const { data, error } = await supabase.rpc("update_stock_with_movement", {
      p_product_id: productId,
      p_warehouse_id: warehouseId,
      p_movement_type: "outbound",
      p_quantity: quantity,
      p_reference_type: "order",
      p_reference_id: orderId,
      p_reason: `Order fulfillment for order ${orderId}`,
    });

    if (error) {
      console.error("Error confirming stock deduction:", error);
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
      message: "Stock deducted successfully",
    };
  } catch (error) {
    console.error("Error in confirmStockDeduction:", error);
    return {
      success: false,
      error: "Failed to deduct stock",
    };
  }
};

/**
 * Batch check delivery for multiple products
 */
const checkMultipleProductsDelivery = async (products, pincode) => {
  try {
    const deliveryChecks = await Promise.all(
      products.map(async (item) => {
        const result = await checkProductDelivery(
          item.product_id,
          pincode,
          item.quantity || 1
        );
        return {
          product_id: item.product_id,
          quantity: item.quantity || 1,
          ...result,
        };
      })
    );

    const allDeliverable = deliveryChecks.every((check) => check.deliverable);
    const unavailableProducts = deliveryChecks.filter(
      (check) => !check.deliverable
    );

    return {
      success: true,
      all_deliverable: allDeliverable,
      products: deliveryChecks,
      unavailable_products: unavailableProducts,
      summary: {
        total_products: products.length,
        deliverable_products: deliveryChecks.filter((c) => c.deliverable)
          .length,
        unavailable_products: unavailableProducts.length,
      },
    };
  } catch (error) {
    console.error("Error in checkMultipleProductsDelivery:", error);
    return {
      success: false,
      error: "Batch delivery check failed",
    };
  }
};

export {
  checkProductDelivery,
  checkWarehouseStock,
  reserveProductStock,
  confirmStockDeduction,
  checkMultipleProductsDelivery,
};
