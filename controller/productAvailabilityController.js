import { supabase } from "../config/supabaseClient.js";

/**
 * Product Availability Controller
 * Handles pincode-based product availability checks and delivery time estimation
 */

/**
 * Check product availability for a specific pincode
 * Returns availability status and estimated delivery time
 */
export const checkProductAvailability = async (req, res) => {
  try {
    const { product_id, pincode } = req.query;

    if (!product_id || !pincode) {
      return res.status(400).json({
        success: false,
        error: "Product ID and pincode are required",
      });
    }

    // Get product details
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, name, delivery_type")
      .eq("id", product_id)
      .single();

    if (productError || !product) {
      return res.status(404).json({
        success: false,
        error: "Product not found",
      });
    }

    // Check if pincode exists in division warehouse (faster delivery)
    const { data: divisionWarehouse, error: divisionError } = await supabase
      .from("warehouse_pincodes")
      .select(
        `
        pincode,
        city,
        state,
        warehouses (
          id,
          name,
          type,
          parent_warehouse_id
        )
      `
      )
      .eq("pincode", pincode)
      .eq("is_active", true)
      .single();

    if (!divisionError && divisionWarehouse) {
      // Check if product is available in this division warehouse
      const { data: divisionStock, error: stockError } = await supabase
        .from("product_warehouse_stock")
        .select("stock_quantity, reserved_quantity")
        .eq("product_id", product_id)
        .eq("warehouse_id", divisionWarehouse.warehouses.id)
        .eq("is_active", true)
        .single();

      if (!stockError && divisionStock) {
        const availableQty =
          divisionStock.stock_quantity - (divisionStock.reserved_quantity || 0);

        if (availableQty > 0) {
          return res.json({
            success: true,
            available: true,
            warehouse_type: "division",
            warehouse_id: divisionWarehouse.warehouses.id,
            warehouse_name: divisionWarehouse.warehouses.name,
            delivery_days: 1,
            delivery_message: "Delivery in 1 day",
            available_quantity: availableQty,
            pincode_info: {
              pincode: divisionWarehouse.pincode,
              city: divisionWarehouse.city,
              state: divisionWarehouse.state,
            },
          });
        }
      }
    }

    // Check if pincode is served by any zonal warehouse
    const { data: zonePincode, error: zoneError } = await supabase
      .from("zone_pincodes")
      .select(
        `
        pincode,
        city,
        state,
        zone_id,
        delivery_zones (
          id,
          name,
          warehouse_zones (
            warehouse_id,
            warehouses (
              id,
              name,
              type
            )
          )
        )
      `
      )
      .eq("pincode", pincode)
      .single();

    if (!zoneError && zonePincode && zonePincode.delivery_zones) {
      // Get zonal warehouses serving this zone
      const zonalWarehouses =
        zonePincode.delivery_zones.warehouse_zones?.filter(
          (wz) => wz.warehouses?.type === "zonal"
        ) || [];

      for (const warehouseZone of zonalWarehouses) {
        const { data: zonalStock, error: zonalStockError } = await supabase
          .from("product_warehouse_stock")
          .select("stock_quantity, reserved_quantity")
          .eq("product_id", product_id)
          .eq("warehouse_id", warehouseZone.warehouse_id)
          .eq("is_active", true)
          .single();

        if (!zonalStockError && zonalStock) {
          const availableQty =
            zonalStock.stock_quantity - (zonalStock.reserved_quantity || 0);

          if (availableQty > 0) {
            return res.json({
              success: true,
              available: true,
              warehouse_type: "zonal",
              warehouse_id: warehouseZone.warehouse_id,
              warehouse_name: warehouseZone.warehouses.name,
              delivery_days: 3,
              delivery_message: "Delivery in 3-4 working days",
              available_quantity: availableQty,
              pincode_info: {
                pincode: zonePincode.pincode,
                city: zonePincode.city,
                state: zonePincode.state,
              },
            });
          }
        }
      }
    }

    // Product not available in any warehouse for this pincode
    return res.json({
      success: true,
      available: false,
      warehouse_type: null,
      delivery_message: "Not available for delivery to this pincode",
      pincode_info: {
        pincode: pincode,
      },
    });
  } catch (error) {
    console.error("Error in checkProductAvailability:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

/**
 * Check availability for multiple products at once (for cart)
 */
export const checkCartAvailability = async (req, res) => {
  try {
    const { items, pincode } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0 || !pincode) {
      return res.status(400).json({
        success: false,
        error: "Items array and pincode are required",
      });
    }

    const results = [];
    let allAvailable = true;
    let maxDeliveryDays = 0;

    for (const item of items) {
      const { product_id, quantity } = item;

      // Get product details
      const { data: product } = await supabase
        .from("products")
        .select("id, name, delivery_type")
        .eq("id", product_id)
        .single();

      if (!product) {
        results.push({
          product_id,
          available: false,
          error: "Product not found",
        });
        allAvailable = false;
        continue;
      }

      // Check division warehouse first
      const { data: divisionWarehouse } = await supabase
        .from("warehouse_pincodes")
        .select(
          `
          warehouses (
            id,
            name,
            type
          )
        `
        )
        .eq("pincode", pincode)
        .eq("is_active", true)
        .single();

      let availabilityInfo = null;

      if (divisionWarehouse) {
        const { data: divisionStock } = await supabase
          .from("product_warehouse_stock")
          .select("stock_quantity, reserved_quantity")
          .eq("product_id", product_id)
          .eq("warehouse_id", divisionWarehouse.warehouses.id)
          .eq("is_active", true)
          .single();

        if (divisionStock) {
          const availableQty =
            divisionStock.stock_quantity -
            (divisionStock.reserved_quantity || 0);

          if (availableQty >= quantity) {
            availabilityInfo = {
              product_id,
              product_name: product.name,
              available: true,
              warehouse_type: "division",
              warehouse_id: divisionWarehouse.warehouses.id,
              warehouse_name: divisionWarehouse.warehouses.name,
              delivery_days: 1,
              delivery_message: "Delivery in 1 day",
              available_quantity: availableQty,
              requested_quantity: quantity,
            };
            maxDeliveryDays = Math.max(maxDeliveryDays, 1);
          }
        }
      }

      // If not available in division, check zonal warehouse
      if (!availabilityInfo) {
        const { data: zonePincode } = await supabase
          .from("zone_pincodes")
          .select(
            `
            delivery_zones (
              warehouse_zones (
                warehouse_id,
                warehouses (
                  id,
                  name,
                  type
                )
              )
            )
          `
          )
          .eq("pincode", pincode)
          .single();

        if (zonePincode && zonePincode.delivery_zones) {
          const zonalWarehouses =
            zonePincode.delivery_zones.warehouse_zones?.filter(
              (wz) => wz.warehouses?.type === "zonal"
            ) || [];

          for (const warehouseZone of zonalWarehouses) {
            const { data: zonalStock } = await supabase
              .from("product_warehouse_stock")
              .select("stock_quantity, reserved_quantity")
              .eq("product_id", product_id)
              .eq("warehouse_id", warehouseZone.warehouse_id)
              .eq("is_active", true)
              .single();

            if (zonalStock) {
              const availableQty =
                zonalStock.stock_quantity -
                (zonalStock.reserved_quantity || 0);

              if (availableQty >= quantity) {
                availabilityInfo = {
                  product_id,
                  product_name: product.name,
                  available: true,
                  warehouse_type: "zonal",
                  warehouse_id: warehouseZone.warehouse_id,
                  warehouse_name: warehouseZone.warehouses.name,
                  delivery_days: 3,
                  delivery_message: "Delivery in 3-4 working days",
                  available_quantity: availableQty,
                  requested_quantity: quantity,
                };
                maxDeliveryDays = Math.max(maxDeliveryDays, 3);
                break;
              }
            }
          }
        }
      }

      if (availabilityInfo) {
        results.push(availabilityInfo);
      } else {
        results.push({
          product_id,
          product_name: product.name,
          available: false,
          delivery_message: "Not available for delivery to this pincode",
          requested_quantity: quantity,
        });
        allAvailable = false;
      }
    }

    return res.json({
      success: true,
      all_available: allAvailable,
      pincode: pincode,
      max_delivery_days: maxDeliveryDays,
      delivery_message:
        maxDeliveryDays === 1
          ? "Delivery in 1 day"
          : maxDeliveryDays === 3
          ? "Delivery in 3-4 working days"
          : "Delivery time varies",
      items: results,
    });
  } catch (error) {
    console.error("Error in checkCartAvailability:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

/**
 * Automatic inventory transfer from zonal to division warehouse
 * Triggered when division warehouse stock falls below threshold
 */
export const autoTransferInventory = async (req, res) => {
  try {
    const { product_id, division_warehouse_id, quantity } = req.body;

    if (!product_id || !division_warehouse_id) {
      return res.status(400).json({
        success: false,
        error: "Product ID and division warehouse ID are required",
      });
    }

    // Get division warehouse details
    const { data: divisionWarehouse, error: warehouseError } = await supabase
      .from("warehouses")
      .select("id, name, type, parent_warehouse_id")
      .eq("id", division_warehouse_id)
      .eq("type", "division")
      .single();

    if (warehouseError || !divisionWarehouse) {
      return res.status(404).json({
        success: false,
        error: "Division warehouse not found",
      });
    }

    if (!divisionWarehouse.parent_warehouse_id) {
      return res.status(400).json({
        success: false,
        error: "Division warehouse has no parent zonal warehouse",
      });
    }

    // Get current stock in division warehouse
    const { data: divisionStock } = await supabase
      .from("product_warehouse_stock")
      .select("stock_quantity, reserved_quantity, minimum_threshold")
      .eq("product_id", product_id)
      .eq("warehouse_id", division_warehouse_id)
      .eq("is_active", true)
      .single();

    if (!divisionStock) {
      return res.status(404).json({
        success: false,
        error: "Product not found in division warehouse",
      });
    }

    // Get stock in parent zonal warehouse
    const { data: zonalStock } = await supabase
      .from("product_warehouse_stock")
      .select("stock_quantity, reserved_quantity")
      .eq("product_id", product_id)
      .eq("warehouse_id", divisionWarehouse.parent_warehouse_id)
      .eq("is_active", true)
      .single();

    if (!zonalStock) {
      return res.status(404).json({
        success: false,
        error: "Product not found in parent zonal warehouse",
      });
    }

    const zonalAvailable =
      zonalStock.stock_quantity - (zonalStock.reserved_quantity || 0);

    // Determine transfer quantity
    const transferQty = quantity || divisionStock.minimum_threshold || 10;

    if (zonalAvailable < transferQty) {
      return res.status(400).json({
        success: false,
        error: `Insufficient stock in zonal warehouse. Available: ${zonalAvailable}, Required: ${transferQty}`,
      });
    }

    // Perform the transfer
    // 1. Reduce stock from zonal warehouse
    const { error: zonalUpdateError } = await supabase
      .from("product_warehouse_stock")
      .update({
        stock_quantity: zonalStock.stock_quantity - transferQty,
        updated_at: new Date().toISOString(),
      })
      .eq("product_id", product_id)
      .eq("warehouse_id", divisionWarehouse.parent_warehouse_id);

    if (zonalUpdateError) {
      return res.status(500).json({
        success: false,
        error: "Failed to update zonal warehouse stock",
      });
    }

    // 2. Add stock to division warehouse
    const { error: divisionUpdateError } = await supabase
      .from("product_warehouse_stock")
      .update({
        stock_quantity: divisionStock.stock_quantity + transferQty,
        last_restocked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("product_id", product_id)
      .eq("warehouse_id", division_warehouse_id);

    if (divisionUpdateError) {
      // Rollback zonal warehouse update
      await supabase
        .from("product_warehouse_stock")
        .update({
          stock_quantity: zonalStock.stock_quantity,
          updated_at: new Date().toISOString(),
        })
        .eq("product_id", product_id)
        .eq("warehouse_id", divisionWarehouse.parent_warehouse_id);

      return res.status(500).json({
        success: false,
        error: "Failed to update division warehouse stock",
      });
    }

    // 3. Log the transfer in stock movements
    await supabase.from("stock_movements").insert([
      {
        product_id,
        warehouse_id: divisionWarehouse.parent_warehouse_id,
        movement_type: "outbound",
        quantity: transferQty,
        previous_stock: zonalStock.stock_quantity,
        new_stock: zonalStock.stock_quantity - transferQty,
        reference_type: "auto_transfer",
        reference_id: division_warehouse_id,
        reason: `Automatic transfer to division warehouse ${divisionWarehouse.name}`,
        performed_at: new Date().toISOString(),
      },
      {
        product_id,
        warehouse_id: division_warehouse_id,
        movement_type: "inbound",
        quantity: transferQty,
        previous_stock: divisionStock.stock_quantity,
        new_stock: divisionStock.stock_quantity + transferQty,
        reference_type: "auto_transfer",
        reference_id: divisionWarehouse.parent_warehouse_id,
        reason: `Automatic transfer from zonal warehouse`,
        performed_at: new Date().toISOString(),
      },
    ]);

    return res.json({
      success: true,
      message: "Inventory transferred successfully",
      transfer_details: {
        product_id,
        from_warehouse: divisionWarehouse.parent_warehouse_id,
        to_warehouse: division_warehouse_id,
        quantity: transferQty,
        new_division_stock: divisionStock.stock_quantity + transferQty,
        new_zonal_stock: zonalStock.stock_quantity - transferQty,
      },
    });
  } catch (error) {
    console.error("Error in autoTransferInventory:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

/**
 * Monitor and auto-transfer inventory for products with low stock
 * This can be called periodically via a cron job
 */
export const monitorAndAutoTransfer = async (req, res) => {
  try {
    // Get all division warehouses with low stock products
    const { data: lowStockProducts, error } = await supabase
      .from("product_warehouse_stock")
      .select(
        `
        product_id,
        warehouse_id,
        stock_quantity,
        reserved_quantity,
        minimum_threshold,
        warehouses (
          id,
          name,
          type,
          parent_warehouse_id
        )
      `
      )
      .eq("is_active", true)
      .lte("stock_quantity", 2); // Products with 2 or less quantity

    if (error) {
      return res.status(500).json({
        success: false,
        error: "Failed to fetch low stock products",
      });
    }

    const transfers = [];
    const errors = [];

    for (const item of lowStockProducts || []) {
      // Only process division warehouses
      if (item.warehouses?.type !== "division") continue;
      if (!item.warehouses?.parent_warehouse_id) continue;

      try {
        // Get parent zonal warehouse stock
        const { data: zonalStock } = await supabase
          .from("product_warehouse_stock")
          .select("stock_quantity, reserved_quantity")
          .eq("product_id", item.product_id)
          .eq("warehouse_id", item.warehouses.parent_warehouse_id)
          .eq("is_active", true)
          .single();

        if (!zonalStock) continue;

        const zonalAvailable =
          zonalStock.stock_quantity - (zonalStock.reserved_quantity || 0);
        const transferQty = item.minimum_threshold || 10;

        if (zonalAvailable >= transferQty) {
          // Perform transfer
          await supabase
            .from("product_warehouse_stock")
            .update({
              stock_quantity: zonalStock.stock_quantity - transferQty,
              updated_at: new Date().toISOString(),
            })
            .eq("product_id", item.product_id)
            .eq("warehouse_id", item.warehouses.parent_warehouse_id);

          await supabase
            .from("product_warehouse_stock")
            .update({
              stock_quantity: item.stock_quantity + transferQty,
              last_restocked_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("product_id", item.product_id)
            .eq("warehouse_id", item.warehouse_id);

          // Log movements
          await supabase.from("stock_movements").insert([
            {
              product_id: item.product_id,
              warehouse_id: item.warehouses.parent_warehouse_id,
              movement_type: "outbound",
              quantity: transferQty,
              previous_stock: zonalStock.stock_quantity,
              new_stock: zonalStock.stock_quantity - transferQty,
              reference_type: "auto_transfer_monitor",
              reference_id: item.warehouse_id,
              reason: `Automatic transfer due to low stock (${item.stock_quantity} units)`,
              performed_at: new Date().toISOString(),
            },
            {
              product_id: item.product_id,
              warehouse_id: item.warehouse_id,
              movement_type: "inbound",
              quantity: transferQty,
              previous_stock: item.stock_quantity,
              new_stock: item.stock_quantity + transferQty,
              reference_type: "auto_transfer_monitor",
              reference_id: item.warehouses.parent_warehouse_id,
              reason: `Automatic transfer due to low stock`,
              performed_at: new Date().toISOString(),
            },
          ]);

          transfers.push({
            product_id: item.product_id,
            warehouse_id: item.warehouse_id,
            warehouse_name: item.warehouses.name,
            quantity: transferQty,
            previous_stock: item.stock_quantity,
            new_stock: item.stock_quantity + transferQty,
          });
        }
      } catch (transferError) {
        errors.push({
          product_id: item.product_id,
          warehouse_id: item.warehouse_id,
          error: transferError.message,
        });
      }
    }

    return res.json({
      success: true,
      message: `Processed ${transfers.length} automatic transfers`,
      transfers,
      errors,
      total_low_stock: lowStockProducts?.length || 0,
    });
  } catch (error) {
    console.error("Error in monitorAndAutoTransfer:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};
