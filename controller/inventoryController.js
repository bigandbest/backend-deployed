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

    // First, check if the pincode is served by checking zone_pincodes
    const { data: pincodeCheck, error: pincodeError } = await supabase
      .from("zone_pincodes")
      .select(
        `
        pincode,
        delivery_zones!inner(
          is_active,
          is_nationwide
        )
      `
      )
      .eq("pincode", pincode)
      .eq("is_active", true)
      .eq("delivery_zones.is_active", true);

    if (pincodeError) {
      console.error("Pincode check error:", pincodeError);
      return res.status(500).json({
        success: false,
        message: "Error checking pincode",
        error: pincodeError.message,
      });
    }

    if (!pincodeCheck || pincodeCheck.length === 0) {
      return res.json({
        success: true,
        data: {
          is_available: false,
          message: "Delivery not available in this area",
        },
      });
    }

    // Check if product exists and is active
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, name, active")
      .eq("id", productId)
      .eq("active", true)
      .single();

    if (productError || !product) {
      return res.json({
        success: true,
        data: {
          is_available: false,
          message: "Product not found or inactive",
        },
      });
    }

    // For now, assume all active products are available in all served pincodes
    // In a real implementation, you would check warehouse inventory
    // This is a simplified version until warehouse management is fully set up

    // Simulate stock availability (you can enhance this with real inventory logic later)
    const simulatedStock = Math.floor(Math.random() * 100) + 1; // Random stock between 1-100
    const isAvailable = simulatedStock > 0;

    res.json({
      success: true,
      data: {
        is_available: isAvailable,
        total_stock: simulatedStock,
        delivery_time: "2-3 business days",
        message: isAvailable
          ? "Available for delivery"
          : "Out of stock in your area",
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
