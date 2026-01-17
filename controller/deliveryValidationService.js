import productDao from "../dao/product.dao.js";
import zonePincodeDao from "../dao/zone-pincode.dao.js";
import productWarehouseStockDao from "../dao/product-warehouse-stock.dao.js";

/**
 * Delivery Validation Service
 * Handles warehouse-based delivery validation with fallback logic
 */

/**
 * Check if a product is deliverable to a specific pincode
 */
const checkProductDelivery = async (productId, pincode, quantity = 1) => {
  try {
    // Step 1: Get product delivery type and zone for pincode
    const product = await productDao.getProductById(productId);
    const zonePincodes = await zonePincodeDao.getByPincode(pincode);

    if (!product) {
      return {
        success: false,
        deliverable: false,
        error: "Product not found",
      };
    }

    if (!zonePincodes || zonePincodes.length === 0) {
      return {
        success: false,
        deliverable: false,
        error: "Pincode not serviceable",
        message: "This pincode is not in our delivery network",
      };
    }

    const userZoneMapping = zonePincodes[0];
    const userZoneId = userZoneMapping.zone_id;

    // Step 2: Check delivery eligibility based on product type
    let isEligibleByZone = false;

    if (product.delivery_type === "nationwide") {
      isEligibleByZone = true;
    } else if (product.delivery_type === "zonal") {
      isEligibleByZone = product.allowed_zone_ids && product.allowed_zone_ids.includes(userZoneId);
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
      userZoneId,
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
        zone_id: userZoneId,
        zone_name: userZoneMapping.zone.name,
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
    const zonalStock = await productWarehouseStockDao.getZonalStock(productId, zoneId, quantity);

    if (zonalStock) {
      const availableQuantity = zonalStock.stock_quantity - zonalStock.reserved_quantity;
      return {
        available: true,
        source_warehouse: {
          id: zonalStock.warehouse_id,
          name: zonalStock.warehouses.name,
          type: "zonal",
        },
        available_quantity: availableQuantity,
        message: "Available from local warehouse",
        fallback_used: false,
      };
    }

    // Fallback to central warehouse
    const centralStock = await productWarehouseStockDao.getCentralStock(productId, quantity);

    if (centralStock) {
      const availableQuantity = centralStock.stock_quantity - centralStock.reserved_quantity;
      return {
        available: true,
        source_warehouse: {
          id: centralStock.warehouse_id,
          name: centralStock.warehouses.name,
          type: "central",
        },
        available_quantity: availableQuantity,
        message: "Available from central warehouse",
        fallback_used: true,
        fallback_reason: "local_warehouse_out_of_stock",
      };
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
    const zonalStock = await productWarehouseStockDao.getZonalStock(productId, zoneId, quantity);

    if (zonalStock) {
      const availableQuantity = zonalStock.stock_quantity - zonalStock.reserved_quantity;
      return {
        available: true,
        source_warehouse: {
          id: zonalStock.warehouse_id,
          name: zonalStock.warehouses.name,
          type: "zonal",
        },
        available_quantity: availableQuantity,
        message: "Available from zonal warehouse",
        fallback_used: false,
      };
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
    await productWarehouseStockDao.reserveStock(productId, warehouseId, quantity, orderId);
    return {
      success: true,
      message: "Stock reserved successfully",
    };
  } catch (error) {
    console.error("Error reserving stock:", error);
    return {
      success: false,
      error: error.message || "Failed to reserve stock",
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
    await productWarehouseStockDao.confirmStockDeduction(productId, warehouseId, quantity, orderId);
    return {
      success: true,
      message: "Stock deducted successfully",
    };
  } catch (error) {
    console.error("Error confirming stock deduction:", error);
    return {
      success: false,
      error: error.message || "Failed to deduct stock",
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
        deliverable_products: deliveryChecks.filter((c) => c.deliverable).length,
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
