import { supabase } from "../config/supabaseClient.js";

/**
 * Middleware to validate delivery availability for cart items
 */
export const validateDeliveryAvailability = async (req, res, next) => {
  try {
    const { cart_items, delivery_pincode, user_id } = req.body;

    // Skip validation if no pincode or cart items provided
    if (
      !delivery_pincode ||
      !cart_items ||
      !Array.isArray(cart_items) ||
      cart_items.length === 0
    ) {
      return next();
    }

    // Validate pincode format
    if (!/^\d{6}$/.test(delivery_pincode)) {
      return res.status(400).json({
        success: false,
        error: "Invalid pincode format",
        message: "Pincode should be 6 digits",
      });
    }

    const deliveryResults = {
      pincode: delivery_pincode,
      can_deliver_all: true,
      available_items: [],
      unavailable_items: [],
      delivery_summary: {
        total_items: cart_items.length,
        deliverable_items: 0,
        non_deliverable_items: 0,
      },
    };

    // Check delivery for each cart item
    for (const item of cart_items) {
      try {
        const productId = item.product_id || item.id;
        const quantity = item.quantity || 1;

        if (!productId) {
          deliveryResults.unavailable_items.push({
            ...item,
            reason: "Invalid product ID",
          });
          continue;
        }

        // Get product delivery information
        const { data: product, error: productError } = await supabase
          .from("products")
          .select("id, name, delivery_type, allowed_zone_ids, active")
          .eq("id", productId)
          .single();

        if (productError || !product) {
          deliveryResults.unavailable_items.push({
            ...item,
            product_id: productId,
            reason: "Product not found",
          });
          continue;
        }

        if (!product.active) {
          deliveryResults.unavailable_items.push({
            ...item,
            product_id: productId,
            product_name: product.name,
            reason: "Product is inactive",
          });
          continue;
        }

        // Check delivery availability using database function
        const { data: canDeliver, error: deliveryError } = await supabase.rpc(
          "can_deliver_to_pincode",
          {
            product_id: productId,
            target_pincode: delivery_pincode,
          }
        );

        if (deliveryError) {
          console.error("Delivery check error:", deliveryError);
          deliveryResults.unavailable_items.push({
            ...item,
            product_id: productId,
            product_name: product.name,
            reason: "Unable to verify delivery availability",
          });
          continue;
        }

        if (canDeliver) {
          deliveryResults.available_items.push({
            ...item,
            product_id: productId,
            product_name: product.name,
            delivery_type: product.delivery_type,
            quantity,
          });
          deliveryResults.delivery_summary.deliverable_items++;
        } else {
          deliveryResults.unavailable_items.push({
            ...item,
            product_id: productId,
            product_name: product.name,
            delivery_type: product.delivery_type,
            reason:
              product.delivery_type === "zonal"
                ? "Not available in your area"
                : "Delivery not available",
          });
          deliveryResults.delivery_summary.non_deliverable_items++;
        }
      } catch (itemError) {
        console.error("Item validation error:", itemError);
        deliveryResults.unavailable_items.push({
          ...item,
          reason: "Validation error",
        });
      }
    }

    // Update summary
    deliveryResults.can_deliver_all =
      deliveryResults.unavailable_items.length === 0;

    // Attach delivery results to request for use in controllers
    req.deliveryValidation = deliveryResults;

    // If in strict mode, reject if any items can't be delivered
    const strictMode =
      req.query.strict_delivery === "true" || req.body.strict_delivery === true;

    if (strictMode && !deliveryResults.can_deliver_all) {
      return res.status(400).json({
        success: false,
        error: "Delivery not available",
        message: `${deliveryResults.delivery_summary.non_deliverable_items} item(s) cannot be delivered to ${delivery_pincode}`,
        delivery_results: deliveryResults,
      });
    }

    next();
  } catch (error) {
    console.error("Delivery validation middleware error:", error);
    return res.status(500).json({
      success: false,
      error: "Delivery validation failed",
      message: error.message,
    });
  }
};

/**
 * Middleware to validate single product delivery
 */
export const validateProductDelivery = async (req, res, next) => {
  try {
    const { product_id, pincode } = req.query;

    if (!product_id || !pincode) {
      return next();
    }

    // Validate pincode format
    if (!/^\d{6}$/.test(pincode)) {
      return res.status(400).json({
        success: false,
        error: "Invalid pincode format",
      });
    }

    // Check delivery availability
    const { data: canDeliver, error } = await supabase.rpc(
      "can_deliver_to_pincode",
      {
        product_id: parseInt(product_id),
        target_pincode: pincode,
      }
    );

    if (error) {
      console.error("Product delivery validation error:", error);
      return res.status(500).json({
        success: false,
        error: "Unable to validate delivery",
      });
    }

    // Get zones for this pincode
    const { data: zones } = await supabase.rpc("get_zones_for_pincode", {
      target_pincode: pincode,
    });

    req.productDelivery = {
      product_id: parseInt(product_id),
      pincode,
      can_deliver: canDeliver,
      available_zones: zones || [],
    };

    next();
  } catch (error) {
    console.error("Product delivery middleware error:", error);
    return res.status(500).json({
      success: false,
      error: "Product delivery validation failed",
      message: error.message,
    });
  }
};

/**
 * Middleware to enrich order data with delivery information
 */
export const enrichOrderWithDelivery = async (req, res, next) => {
  try {
    const { delivery_pincode, cart_items } = req.body;

    if (!delivery_pincode || !req.deliveryValidation) {
      return next();
    }

    // Get zones for the delivery pincode
    const { data: zones } = await supabase.rpc("get_zones_for_pincode", {
      target_pincode: delivery_pincode,
    });

    // Add delivery metadata to request
    req.orderDeliveryMeta = {
      delivery_pincode,
      delivery_zones: zones || [],
      delivery_validation_timestamp: new Date().toISOString(),
      items_summary: req.deliveryValidation.delivery_summary,
    };

    next();
  } catch (error) {
    console.error("Order delivery enrichment error:", error);
    next(); // Continue without enrichment rather than failing
  }
};

/**
 * Utility function to check bulk delivery availability
 */
export const checkBulkDeliveryAvailability = async (productIds, pincode) => {
  try {
    const results = {};

    for (const productId of productIds) {
      const { data: canDeliver, error } = await supabase.rpc(
        "can_deliver_to_pincode",
        {
          product_id: parseInt(productId),
          target_pincode: pincode,
        }
      );

      if (!error) {
        results[productId] = canDeliver;
      }
    }

    return results;
  } catch (error) {
    console.error("Bulk delivery check error:", error);
    return {};
  }
};

export default {
  validateDeliveryAvailability,
  validateProductDelivery,
  enrichOrderWithDelivery,
  checkBulkDeliveryAvailability,
};
