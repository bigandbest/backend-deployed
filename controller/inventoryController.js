import { supabase } from "../config/supabaseClient.js";

// Get products available in a specific pincode
const getProductsByPincode = async (req, res) => {
  try {
    const { pincode } = req.params;
    const { category, limit = 50 } = req.query;

    // Get warehouses serving this pincode
    const { data: warehouseMappings, error: mappingError } = await supabase
      .from("pincode_warehouse_mapping")
      .select(
        `
        warehouse_id,
        priority,
        delivery_time,
        warehouses (
          id,
          name,
          address
        )
      `
      )
      .eq("pincode", pincode)
      .eq("is_active", true)
      .order("priority", { ascending: true });

    if (mappingError || !warehouseMappings.length) {
      return res.status(404).json({
        success: false,
        message: "No delivery available for this pincode",
      });
    }

    const warehouseIds = warehouseMappings.map((m) => m.warehouse_id);

    // Get products with inventory from these warehouses
    let query = supabase
      .from("warehouse_inventory")
      .select(
        `
        product_id,
        variant_id,
        available_quantity,
        warehouse_id,
        products (
          id,
          name,
          description,
          price,
          old_price,
          image,
          category,
          brand_name,
          active
        ),
        product_variants (
          id,
          variant_name,
          variant_value,
          price,
          mrp,
          weight
        )
      `
      )
      .in("warehouse_id", warehouseIds)
      .gt("available_quantity", 0);

    if (category) {
      query = query.eq("products.category", category);
    }

    const { data: inventory, error: inventoryError } = await query.limit(
      parseInt(limit)
    );

    if (inventoryError) {
      return res.status(500).json({
        success: false,
        message: "Error fetching inventory",
        error: inventoryError.message,
      });
    }

    // Group by product and calculate total availability
    const productMap = new Map();

    inventory.forEach((item) => {
      const productId = item.product_id;
      const variantId = item.variant_id;
      const key = `${productId}-${variantId || "default"}`;

      if (!productMap.has(key)) {
        const warehouse = warehouseMappings.find(
          (w) => w.warehouse_id === item.warehouse_id
        );

        productMap.set(key, {
          ...item.products,
          variant: item.product_variants,
          total_stock: item.available_quantity,
          delivery_time: warehouse?.delivery_time || "1-2 days",
          warehouse_name: warehouse?.warehouses?.name,
          is_available: true,
        });
      } else {
        const existing = productMap.get(key);
        existing.total_stock += item.available_quantity;
      }
    });

    const availableProducts = Array.from(productMap.values());

    res.json({
      success: true,
      data: {
        pincode,
        total_products: availableProducts.length,
        products: availableProducts,
        serving_warehouses: warehouseMappings.map((w) => ({
          id: w.warehouse_id,
          name: w.warehouses.name,
          delivery_time: w.delivery_time,
          priority: w.priority,
        })),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// Check if specific product is available in pincode
const checkProductAvailability = async (req, res) => {
  try {
    const { pincode, productId } = req.params;
    const { variantId } = req.query;

    if (!productId || !pincode) {
      return res.status(400).json({
        success: false,
        error: "Product ID and pincode are required",
      });
    }

    // Get product details
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, name, delivery_type")
      .eq("id", productId)
      .single();

    if (productError || !product) {
      return res.json({
        success: true,
        data: {
          is_available: false,
          message: "Product not found",
        },
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
        .eq("product_id", productId)
        .eq("warehouse_id", divisionWarehouse.warehouses.id)
        .eq("is_active", true)
        .single();

      if (!stockError && divisionStock) {
        const availableQty =
          divisionStock.stock_quantity - (divisionStock.reserved_quantity || 0);

        if (availableQty > 0) {
          return res.json({
            success: true,
            data: {
              is_available: true,
              warehouse_type: "division",
              warehouse_id: divisionWarehouse.warehouses.id,
              warehouse_name: divisionWarehouse.warehouses.name,
              delivery_time: "1 Day Delivery",
              delivery_days: 1,
              message: "Available for delivery in 1 day",
              available_quantity: availableQty,
              pincode_info: {
                pincode: divisionWarehouse.pincode,
                city: divisionWarehouse.city,
                state: divisionWarehouse.state,
              },
            }
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
          .eq("product_id", productId)
          .eq("warehouse_id", warehouseZone.warehouse_id)
          .eq("is_active", true)
          .single();

        if (!zonalStockError && zonalStock) {
          const availableQty =
            zonalStock.stock_quantity - (zonalStock.reserved_quantity || 0);

          if (availableQty > 0) {
            return res.json({
              success: true,
              data: {
                is_available: true,
                warehouse_type: "zonal",
                warehouse_id: warehouseZone.warehouse_id,
                warehouse_name: warehouseZone.warehouses.name,
                delivery_time: "3-4 Days Delivery",
                delivery_days: 3,
                message: "Available for delivery in 3-4 days",
                available_quantity: availableQty,
                pincode_info: {
                  pincode: zonePincode.pincode,
                  city: zonePincode.city,
                  state: zonePincode.state,
                },
              }
            });
          }
        }
      }
    }

    // Product not available in any warehouse for this pincode
    return res.json({
      success: true,
      data: {
        is_available: false,
        warehouse_type: null,
        message: "Not available for delivery to this pincode",
        pincode_info: {
          pincode: pincode,
        },
      }
    });
  } catch (error) {
    console.error("Error in checkProductAvailability:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// Add/Update warehouse inventory (Admin)
const updateWarehouseInventory = async (req, res) => {
  try {
    const { warehouse_id, product_id, variant_id, stock_quantity } = req.body;

    const { data, error } = await supabase
      .from("warehouse_inventory")
      .upsert(
        {
          warehouse_id,
          product_id,
          variant_id: variant_id || null,
          stock_quantity,
          last_updated: new Date().toISOString(),
        },
        {
          onConflict: "warehouse_id,product_id,variant_id",
        }
      )
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        success: false,
        message: "Error updating inventory",
        error: error.message,
      });
    }

    res.json({
      success: true,
      message: "Inventory updated successfully",
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// Get warehouse inventory (Admin)
const getWarehouseInventory = async (req, res) => {
  try {
    const { warehouseId } = req.params;

    const { data, error } = await supabase
      .from("warehouse_inventory")
      .select(
        `
        *,
        products (
          id,
          name,
          image,
          category
        ),
        product_variants (
          id,
          variant_name,
          variant_value
        )
      `
      )
      .eq("warehouse_id", warehouseId)
      .order("last_updated", { ascending: false });

    if (error) {
      return res.status(500).json({
        success: false,
        message: "Error fetching inventory",
        error: error.message,
      });
    }

    res.json({
      success: true,
      data: data || [],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

export {
  getProductsByPincode,
  checkProductAvailability,
  updateWarehouseInventory,
  getWarehouseInventory,
};
