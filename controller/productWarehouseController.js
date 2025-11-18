import { supabase } from "../config/supabaseClient.js";

/**
 * Enhanced Product Warehouse Controller with Advanced Warehouse Management
 * Includes automatic central warehouse assignment and zonal distribution
 */

// Create a new product with warehouse assignment
export const createProductWithWarehouse = async (req, res) => {
  try {
    const {
      // Basic product fields
      name,
      price,
      old_price,
      discount,
      stock,
      category_id,
      description,
      specifications,
      rating,
      review_count,
      featured,
      popular,
      in_stock,
      active,
      shipping_amount,
      weight_value,
      weight_unit,
      weight_display,
      brand_name,
      store_id,
      delivery_type = "nationwide",
      // Warehouse management fields
      warehouse_mapping_type = "nationwide",
      assigned_warehouse_ids = [],
      primary_warehouses = [],
      fallback_warehouses = [],
      enable_fallback = true,
      warehouse_notes = "",
      // Initial stock settings
      initial_stock = 100,
      minimum_threshold = 10,
      cost_per_unit = 0,
      auto_distribute_to_zones = false,
      zone_distribution_quantity = 50,
    } = req.body;

    // Validate required fields
    if (!name || !price || !category_id) {
      return res.status(400).json({
        success: false,
        error: "Name, price, and category are required",
      });
    }

    // Step 1: Create the product
    const productData = {
      name,
      price,
      old_price: old_price || 0,
      discount: discount || 0,
      category_id,
      description: description || "",
      specifications: specifications || "",
      rating: rating || 4.0,
      review_count: review_count || 0,
      featured: featured || false,
      popular: popular || false,
      in_stock: in_stock !== false,
      active: active !== false,
      shipping_amount: shipping_amount || 0,
      weight_value: weight_value || "",
      weight_unit: weight_unit || "kg",
      weight_display: weight_display || "",
      brand_name: brand_name || "BigandBest",
      store_id: store_id || null,
      delivery_type,
      warehouse_mapping_type,
      assigned_warehouse_ids,
      primary_warehouses,
      fallback_warehouses,
      enable_fallback,
      warehouse_notes,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: product, error: productError } = await supabase
      .from("products")
      .insert([productData])
      .select()
      .single();

    if (productError) {
      console.error("Product creation error:", productError);
      return res.status(500).json({
        success: false,
        error: "Failed to create product",
        details: productError.message,
      });
    }

    // Step 2: Handle warehouse assignments based on mapping type
    let warehouseAssignments = [];

    if (warehouse_mapping_type === "nationwide") {
      // Auto-assign to all zonal warehouses for nationwide coverage
      const { data: zonalWarehouses, error } = await supabase
        .from("warehouses")
        .select("*")
        .eq("type", "zonal")
        .eq("is_active", true);

      if (!error && zonalWarehouses) {
        warehouseAssignments = zonalWarehouses.map((warehouse) => ({
          warehouse_id: warehouse.id,
          stock_quantity: Math.floor(initial_stock / zonalWarehouses.length), // Distribute stock evenly
          minimum_threshold,
          cost_per_unit,
          warehouse_type: "zonal",
        }));

        // Add to primary warehouses array
        zonalWarehouses.forEach((warehouse) => {
          if (!primary_warehouses.includes(warehouse.id)) {
            primary_warehouses.push(warehouse.id);
          }
        });
      }
    }

    if (
      warehouse_mapping_type === "zonal" ||
      assigned_warehouse_ids.length > 0
    ) {
      // Add to specified zonal warehouses
      for (const warehouseId of assigned_warehouse_ids) {
        const warehouse = await getWarehouseById(warehouseId);
        if (warehouse) {
          warehouseAssignments.push({
            warehouse_id: warehouseId,
            stock_quantity:
              warehouse.type === "zonal"
                ? zone_distribution_quantity
                : initial_stock,
            minimum_threshold,
            cost_per_unit,
            warehouse_type: warehouse.type,
          });
        }
      }
    }

    // Step 3: Create warehouse stock entries
    const stockInserts = warehouseAssignments.map((assignment) => ({
      product_id: product.id,
      warehouse_id: assignment.warehouse_id,
      stock_quantity: assignment.stock_quantity,
      reserved_quantity: 0,
      minimum_threshold: assignment.minimum_threshold,
      cost_per_unit: assignment.cost_per_unit,
      last_restocked_at: new Date().toISOString(),
      is_active: true,
    }));

    if (stockInserts.length > 0) {
      const { error: stockError } = await supabase
        .from("product_warehouse_stock")
        .insert(stockInserts);

      if (stockError) {
        console.error("Stock insertion error:", stockError);
        // Don't fail the entire operation, just log the error
      }
    }

    // Step 4: Update product with finalized warehouse arrays
    if (primary_warehouses.length > 0 || fallback_warehouses.length > 0) {
      const { error: updateError } = await supabase
        .from("products")
        .update({
          primary_warehouses,
          fallback_warehouses,
        })
        .eq("id", product.id);

      if (updateError) {
        console.error("Product warehouse update error:", updateError);
      }
    }

    // Step 5: Auto-distribute to zones if enabled
    if (auto_distribute_to_zones && warehouse_mapping_type === "central") {
      await autoDistributeToZonalWarehouses(
        product.id,
        zone_distribution_quantity
      );
    }

    // Step 6: Create stock movement logs
    for (const assignment of warehouseAssignments) {
      await logStockMovement({
        product_id: product.id,
        warehouse_id: assignment.warehouse_id,
        movement_type: "inbound",
        quantity: assignment.stock_quantity,
        previous_stock: 0,
        new_stock: assignment.stock_quantity,
        reference_type: "product_creation",
        reason: "Initial stock assignment during product creation",
        performed_by: req.user?.id || null,
      });
    }

    res.status(201).json({
      success: true,
      data: {
        product,
        warehouse_assignments: warehouseAssignments,
        auto_distributed: auto_distribute_to_zones,
      },
      message: "Product created successfully with warehouse assignments",
    });
  } catch (error) {
    console.error("Error in createProductWithWarehouse:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// 1️⃣ Map a single product to a warehouse using IDs (Legacy compatibility)
export const mapProductToWarehouse = async (req, res) => {
  try {
    const { product_id, warehouse_id } = req.body;

    if (!product_id || !warehouse_id) {
      return res
        .status(400)
        .json({ error: "product_id and warehouse_id are required." });
    }

    // Insert mapping (ignore if duplicate)
    const { error } = await supabase
      .from("product_warehouse")
      .insert([{ product_id, warehouse_id }]);

    if (error) {
      if (error.code === "23505") {
        return res.status(409).json({ error: "Mapping already exists." });
      }
      return res.status(500).json({ error: error.message });
    }

    res
      .status(201)
      .json({ message: "Product mapped to warehouse successfully." });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

// 2️⃣ Remove product from a warehouse
export const removeProductFromWarehouse = async (req, res) => {
  try {
    const { product_id, warehouse_id } = req.body;

    const { error } = await supabase
      .from("product_warehouse")
      .delete()
      .eq("product_id", product_id)
      .eq("warehouse_id", warehouse_id);

    if (error) return res.status(500).json({ error: error.message });

    res.status(200).json({ message: "Mapping removed successfully." });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

// 3️⃣ Get all warehouses stocking a product
export const getWarehousesForProduct = async (req, res) => {
  try {
    const { product_id } = req.params;

    const { data, error } = await supabase
      .from("product_warehouse")
      .select("warehouse_id, warehouses (id, name, address, location)")
      .eq("product_id", product_id);

    if (error) return res.status(500).json({ error: error.message });

    // Map location to pincode for frontend compatibility
    const transformedData =
      data?.map((item) => ({
        ...item,
        warehouses: item.warehouses
          ? {
              ...item.warehouses,
              pincode: item.warehouses.location,
            }
          : null,
      })) || [];

    res.status(200).json(transformedData);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

// 4️⃣ Get all products in a warehouse
export const getProductsForWarehouse = async (req, res) => {
  try {
    const { warehouse_id } = req.params;

    const { data, error } = await supabase
      .from("product_warehouse")
      .select("product_id, products (id, name, price, rating, image, category)")
      .eq("warehouse_id", warehouse_id);

    if (error) return res.status(500).json({ error: error.message });

    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

// 5️⃣ Bulk map products by names and warehouse name
export const bulkMapByNames = async (req, res) => {
  try {
    const { warehouse_name, product_names } = req.body;

    if (!warehouse_name || !product_names || !Array.isArray(product_names)) {
      return res
        .status(400)
        .json({ error: "warehouse_name and product_names[] are required." });
    }

    // 1. Get warehouse ID from name
    const { data: warehouseData, error: warehouseError } = await supabase
      .from("warehouses")
      .select("id")
      .eq("name", warehouse_name)
      .single();

    if (warehouseError || !warehouseData) {
      return res.status(404).json({ error: "Warehouse not found." });
    }

    // 2. Get product IDs from names
    const { data: products, error: productError } = await supabase
      .from("products")
      .select("id, name")
      .in("name", product_names);

    if (productError || !products.length) {
      return res.status(404).json({ error: "No matching products found." });
    }

    // 3. Map each product to warehouse
    const inserts = products.map((p) => ({
      product_id: p.id,
      warehouse_id: warehouseData.id,
    }));

    const { error: insertError } = await supabase
      .from("product_warehouse")
      .insert(inserts, { upsert: false }); // ignore duplicates

    if (insertError && insertError.code !== "23505") {
      return res.status(500).json({ error: insertError.message });
    }

    res.status(201).json({
      message: `Mapped ${products.length} products to warehouse "${warehouse_name}".`,
      mapped_products: products.map((p) => p.name),
    });
  } catch (err) {
    console.error("Bulk map error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
};

// Auto-distribute products from central to zonal warehouses
export const distributeProductToZones = async (req, res) => {
  try {
    const { product_id } = req.params;
    const {
      quantity_per_zone = 50,
      specific_zones = [],
      force_distribution = false,
    } = req.body;

    const result = await autoDistributeToZonalWarehouses(
      product_id,
      quantity_per_zone,
      specific_zones,
      force_distribution
    );

    if (result.success) {
      res.status(200).json({
        success: true,
        data: result.distributions,
        message: `Product distributed to ${result.distributions.length} zones`,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error("Error in distributeProductToZones:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Get product stock across all warehouses
export const getProductStockSummary = async (req, res) => {
  try {
    const { product_id } = req.params;

    const { data: stockData, error } = await supabase
      .from("product_warehouse_stock")
      .select(
        `
        *,
        warehouses (
          id,
          name,
          type,
          location
        )
      `
      )
      .eq("product_id", product_id)
      .eq("is_active", true);

    if (error) {
      return res.status(500).json({
        success: false,
        error: "Failed to fetch stock data",
      });
    }

    const summary = {
      total_stock: 0,
      total_reserved: 0,
      available_stock: 0,
      warehouses: [],
      central_warehouses: [],
      zonal_warehouses: [],
    };

    for (const stock of stockData || []) {
      const availableQty =
        stock.stock_quantity - (stock.reserved_quantity || 0);

      summary.total_stock += stock.stock_quantity;
      summary.total_reserved += stock.reserved_quantity || 0;
      summary.available_stock += availableQty;

      const warehouseData = {
        warehouse_id: stock.warehouse_id,
        warehouse_name: stock.warehouses?.name,
        warehouse_type: stock.warehouses?.type,
        location: stock.warehouses?.location,
        stock_quantity: stock.stock_quantity,
        reserved_quantity: stock.reserved_quantity || 0,
        available_quantity: availableQty,
        minimum_threshold: stock.minimum_threshold,
        is_low_stock: stock.stock_quantity <= (stock.minimum_threshold || 0),
        last_restocked: stock.last_restocked_at,
      };

      summary.warehouses.push(warehouseData);

      if (stock.warehouses?.type === "central") {
        summary.central_warehouses.push(warehouseData);
      } else if (stock.warehouses?.type === "zonal") {
        summary.zonal_warehouses.push(warehouseData);
      }
    }

    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error("Error in getProductStockSummary:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Get visibility for every zone served by a specific product
export const getProductVisibilityMatrix = async (req, res) => {
  try {
    const productId =
      req.params.product_id || req.params.productId || req.params.id;

    if (!productId) {
      return res.status(400).json({
        success: false,
        error: "Product ID is required",
      });
    }

    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, name, delivery_type, price, image")
      .eq("id", productId)
      .single();

    if (productError || !product) {
      return res.status(404).json({
        success: false,
        error: "Product not found",
      });
    }

    // Map zonal warehouse -> zone details
    const { data: zoneMappings, error: zoneMappingError } = await supabase
      .from("warehouse_zones")
      .select(
        `
        warehouse_id,
        zone_id,
        is_active,
        delivery_zones (
          id,
          name,
          display_name
        )
      `
      )
      .eq("is_active", true);

    if (zoneMappingError) {
      return res.status(500).json({
        success: false,
        error: "Failed to load warehouse zone mappings",
      });
    }

    const zonalToZoneMap = new Map();
    zoneMappings?.forEach((mapping) => {
      if (mapping.delivery_zones) {
        zonalToZoneMap.set(mapping.warehouse_id, {
          zone_id: mapping.delivery_zones.id,
          zone_name:
            mapping.delivery_zones.display_name || mapping.delivery_zones.name,
        });
      }
    });

    const { data: stockRows, error: stockError } = await supabase
      .from("product_warehouse_stock")
      .select(
        `
        warehouse_id,
        stock_quantity,
        reserved_quantity,
        warehouses (
          id,
          name,
          type,
          parent_warehouse_id
        )
      `
      )
      .eq("product_id", productId)
      .eq("is_active", true);

    if (stockError) {
      return res.status(500).json({
        success: false,
        error: "Failed to load product warehouse assignments",
      });
    }

    const zoneVisibility = new Map();

    const ensureZoneEntry = (zone) => {
      if (!zoneVisibility.has(zone.zone_id)) {
        zoneVisibility.set(zone.zone_id, {
          zone_id: zone.zone_id,
          zone_name: zone.zone_name,
          zone_assignment: null,
          division_assignments: [],
        });
      }
      return zoneVisibility.get(zone.zone_id);
    };

    stockRows?.forEach((row) => {
      const warehouse = row.warehouses;
      if (!warehouse) return;

      let zoneInfo = null;
      if (warehouse.type === "zonal") {
        zoneInfo = zonalToZoneMap.get(warehouse.id);
      } else if (
        warehouse.type === "division" &&
        warehouse.parent_warehouse_id
      ) {
        zoneInfo = zonalToZoneMap.get(warehouse.parent_warehouse_id);
      }

      if (!zoneInfo) {
        return;
      }

      const entry = ensureZoneEntry(zoneInfo);
      const availableQuantity =
        row.stock_quantity - (row.reserved_quantity || 0);

      if (warehouse.type === "zonal") {
        if (
          !entry.zone_assignment ||
          availableQuantity > entry.zone_assignment.available_quantity
        ) {
          entry.zone_assignment = {
            warehouse_id: warehouse.id,
            warehouse_name: warehouse.name,
            stock_quantity: row.stock_quantity,
            reserved_quantity: row.reserved_quantity || 0,
            available_quantity: Math.max(availableQuantity, 0),
          };
        }
      } else if (warehouse.type === "division") {
        entry.division_assignments.push({
          warehouse_id: warehouse.id,
          warehouse_name: warehouse.name,
          parent_warehouse_id: warehouse.parent_warehouse_id,
          stock_quantity: row.stock_quantity,
          reserved_quantity: row.reserved_quantity || 0,
          available_quantity: Math.max(availableQuantity, 0),
        });
      }
    });

    const zones = Array.from(zoneVisibility.values())
      .map((entry) => {
        const divisionAvailable = entry.division_assignments.filter(
          (division) => division.available_quantity > 0
        );

        let visibility = "unavailable";
        if (entry.zone_assignment?.available_quantity > 0) {
          visibility = "zone_available";
        } else if (divisionAvailable.length > 0) {
          visibility = "division_only";
        }

        return {
          zone_id: entry.zone_id,
          zone_name: entry.zone_name,
          zone_assignment: entry.zone_assignment,
          division_assignments: entry.division_assignments,
          division_available: divisionAvailable,
          visibility,
        };
      })
      .sort((a, b) => a.zone_name.localeCompare(b.zone_name));

    res.status(200).json({
      success: true,
      product,
      zones,
      summary: {
        total_zones: zones.length,
        zone_available: zones.filter(
          (zone) => zone.visibility === "zone_available"
        ).length,
        division_only: zones.filter(
          (zone) => zone.visibility === "division_only"
        ).length,
      },
    });
  } catch (error) {
    console.error("Error in getProductVisibilityMatrix:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Get products available for a specific zone with division fallback
export const getZoneProductVisibility = async (req, res) => {
  try {
    const zoneId = req.params.zone_id || req.params.zoneId || req.params.id;

    if (!zoneId) {
      return res.status(400).json({
        success: false,
        error: "Zone ID is required",
      });
    }

    const { data: zone, error: zoneError } = await supabase
      .from("delivery_zones")
      .select("id, name, display_name")
      .eq("id", zoneId)
      .single();

    if (zoneError || !zone) {
      return res.status(404).json({
        success: false,
        error: "Zone not found",
      });
    }

    const { data: zoneWarehouseMappings, error: warehouseMappingError } =
      await supabase
        .from("warehouse_zones")
        .select(
          `
        warehouse_id,
        is_active,
        warehouses (
          id,
          name,
          type,
          parent_warehouse_id,
          is_active
        )
      `
        )
        .eq("zone_id", zoneId)
        .eq("is_active", true);

    if (warehouseMappingError) {
      return res.status(500).json({
        success: false,
        error: "Failed to fetch zonal warehouses",
      });
    }

    const zonalWarehouseIds =
      zoneWarehouseMappings
        ?.filter(
          (mapping) =>
            mapping.warehouses?.type === "zonal" &&
            mapping.warehouses?.is_active
        )
        .map((mapping) => mapping.warehouse_id) || [];

    if (zonalWarehouseIds.length === 0) {
      return res.status(200).json({
        success: true,
        zone: {
          id: zone.id,
          name: zone.display_name || zone.name,
        },
        products: [],
        summary: {
          total_products: 0,
          zone_available: 0,
          division_only: 0,
        },
        message: "No active zonal warehouses configured for this zone",
      });
    }

    const { data: divisionWarehouses, error: divisionError } = await supabase
      .from("warehouses")
      .select("id, name, parent_warehouse_id, is_active")
      .eq("type", "division")
      .eq("is_active", true)
      .in("parent_warehouse_id", zonalWarehouseIds);

    if (divisionError) {
      return res.status(500).json({
        success: false,
        error: "Failed to fetch division warehouses",
      });
    }

    const divisionIds = divisionWarehouses?.map((warehouse) => warehouse.id) || [];
    const warehouseIds = [...zonalWarehouseIds, ...divisionIds];

    if (warehouseIds.length === 0) {
      return res.status(200).json({
        success: true,
        zone: {
          id: zone.id,
          name: zone.display_name || zone.name,
        },
        products: [],
        summary: {
          total_products: 0,
          zone_available: 0,
          division_only: 0,
        },
        message: "No active warehouses are linked to this zone",
      });
    }

    const { data: stockRows, error: stockError } = await supabase
      .from("product_warehouse_stock")
      .select(
        `
        product_id,
        warehouse_id,
        stock_quantity,
        reserved_quantity,
        products (
          id,
          name,
          price,
          image,
          delivery_type
        ),
        warehouses (
          id,
          name,
          type,
          parent_warehouse_id
        )
      `
      )
      .in("warehouse_id", warehouseIds)
      .eq("is_active", true);

    if (stockError) {
      return res.status(500).json({
        success: false,
        error: "Failed to fetch product visibility for this zone",
      });
    }

    const productMap = new Map();

    const assignZoneEntry = (row) => {
      if (!row.products) return null;
      if (!productMap.has(row.product_id)) {
        productMap.set(row.product_id, {
          product: row.products,
          zone_assignment: null,
          division_assignments: [],
        });
      }
      return productMap.get(row.product_id);
    };

    stockRows?.forEach((row) => {
      const warehouse = row.warehouses;
      if (!warehouse) return;
      const entry = assignZoneEntry(row);
      if (!entry) return;

      const availableQuantity =
        row.stock_quantity - (row.reserved_quantity || 0);

      if (warehouse.type === "zonal") {
        if (
          !entry.zone_assignment ||
          availableQuantity > entry.zone_assignment.available_quantity
        ) {
          entry.zone_assignment = {
            warehouse_id: warehouse.id,
            warehouse_name: warehouse.name,
            stock_quantity: row.stock_quantity,
            reserved_quantity: row.reserved_quantity || 0,
            available_quantity: Math.max(availableQuantity, 0),
          };
        }
      } else if (warehouse.type === "division") {
        entry.division_assignments.push({
          warehouse_id: warehouse.id,
          warehouse_name: warehouse.name,
          parent_warehouse_id: warehouse.parent_warehouse_id,
          stock_quantity: row.stock_quantity,
          reserved_quantity: row.reserved_quantity || 0,
          available_quantity: Math.max(availableQuantity, 0),
        });
      }
    });

    const products = Array.from(productMap.values())
      .map((entry) => {
        const divisionAvailable = entry.division_assignments.filter(
          (division) => division.available_quantity > 0
        );

        let visibility = "unavailable";
        if (entry.zone_assignment?.available_quantity > 0) {
          visibility = "zone_available";
        } else if (divisionAvailable.length > 0) {
          visibility = "division_only";
        }

        return {
          id: entry.product.id,
          name: entry.product.name,
          price: entry.product.price,
          image: entry.product.image,
          delivery_type: entry.product.delivery_type,
          zone_assignment: entry.zone_assignment,
          division_assignments: entry.division_assignments,
          division_available: divisionAvailable,
          visibility,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    res.status(200).json({
      success: true,
      zone: {
        id: zone.id,
        name: zone.display_name || zone.name,
      },
      products,
      summary: {
        total_products: products.length,
        zone_available: products.filter(
          (product) => product.visibility === "zone_available"
        ).length,
        division_only: products.filter(
          (product) => product.visibility === "division_only"
        ).length,
      },
    });
  } catch (error) {
    console.error("Error in getZoneProductVisibility:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Helper function to get central warehouse
async function getCentralWarehouse() {
  const { data, error } = await supabase
    .from("warehouses")
    .select("*")
    .eq("type", "central")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (error) {
    console.error("Error fetching central warehouse:", error);
    return null;
  }

  return data;
}

// Helper function to get warehouse by ID
async function getWarehouseById(warehouseId) {
  const { data, error } = await supabase
    .from("warehouses")
    .select("*")
    .eq("id", warehouseId)
    .eq("is_active", true)
    .single();

  if (error) {
    console.error(`Error fetching warehouse ${warehouseId}:`, error);
    return null;
  }

  return data;
}

// Helper function to auto-distribute to zonal warehouses
async function autoDistributeToZonalWarehouses(
  productId,
  quantityPerZone = 50,
  specificZones = [],
  forceDistribution = false
) {
  try {
    // Get all active zonal warehouses
    let warehouseQuery = supabase
      .from("warehouses")
      .select("*")
      .eq("type", "zonal")
      .eq("is_active", true);

    if (specificZones.length > 0) {
      // Filter by specific zones if provided
      warehouseQuery = warehouseQuery.in("id", specificZones);
    }

    const { data: zonalWarehouses, error: warehouseError } =
      await warehouseQuery;

    if (warehouseError) {
      return { success: false, error: "Failed to fetch zonal warehouses" };
    }

    const distributions = [];
    const stockInserts = [];

    for (const warehouse of zonalWarehouses) {
      // Check if product already exists in this warehouse
      const { data: existingStock, error: checkError } = await supabase
        .from("product_warehouse_stock")
        .select("*")
        .eq("product_id", productId)
        .eq("warehouse_id", warehouse.id)
        .single();

      if (checkError && checkError.code !== "PGRST116") {
        console.error(
          `Error checking stock for warehouse ${warehouse.id}:`,
          checkError
        );
        continue;
      }

      if (existingStock && !forceDistribution) {
        distributions.push({
          warehouse_id: warehouse.id,
          warehouse_name: warehouse.name,
          action: "skipped",
          reason: "Already exists",
          current_stock: existingStock.stock_quantity,
        });
        continue;
      }

      if (existingStock && forceDistribution) {
        // Update existing stock
        const { error: updateError } = await supabase
          .from("product_warehouse_stock")
          .update({
            stock_quantity: existingStock.stock_quantity + quantityPerZone,
            last_restocked_at: new Date().toISOString(),
          })
          .eq("id", existingStock.id);

        if (!updateError) {
          distributions.push({
            warehouse_id: warehouse.id,
            warehouse_name: warehouse.name,
            action: "updated",
            added_quantity: quantityPerZone,
            new_stock: existingStock.stock_quantity + quantityPerZone,
          });

          // Log stock movement
          await logStockMovement({
            product_id: productId,
            warehouse_id: warehouse.id,
            movement_type: "inbound",
            quantity: quantityPerZone,
            previous_stock: existingStock.stock_quantity,
            new_stock: existingStock.stock_quantity + quantityPerZone,
            reference_type: "zone_distribution",
            reason: "Auto-distribution from central warehouse",
          });
        }
      } else {
        // Create new stock entry
        stockInserts.push({
          product_id: productId,
          warehouse_id: warehouse.id,
          stock_quantity: quantityPerZone,
          reserved_quantity: 0,
          minimum_threshold: 10,
          cost_per_unit: 0,
          last_restocked_at: new Date().toISOString(),
          is_active: true,
        });

        distributions.push({
          warehouse_id: warehouse.id,
          warehouse_name: warehouse.name,
          action: "created",
          quantity: quantityPerZone,
        });
      }
    }

    // Insert new stock entries in batch
    if (stockInserts.length > 0) {
      const { error: insertError } = await supabase
        .from("product_warehouse_stock")
        .insert(stockInserts);

      if (insertError) {
        console.error("Error inserting zonal stock:", insertError);
        return {
          success: false,
          error: "Failed to distribute to some warehouses",
        };
      }

      // Log stock movements for new entries
      for (const insert of stockInserts) {
        await logStockMovement({
          product_id: insert.product_id,
          warehouse_id: insert.warehouse_id,
          movement_type: "inbound",
          quantity: insert.stock_quantity,
          previous_stock: 0,
          new_stock: insert.stock_quantity,
          reference_type: "zone_distribution",
          reason: "Auto-distribution from central warehouse",
        });
      }
    }

    return { success: true, distributions };
  } catch (error) {
    console.error("Error in autoDistributeToZonalWarehouses:", error);
    return { success: false, error: "Distribution failed" };
  }
}

// Helper function to log stock movements
async function logStockMovement(movement) {
  try {
    const { error } = await supabase.from("stock_movements").insert([
      {
        ...movement,
        created_at: new Date().toISOString(),
      },
    ]);

    if (error) {
      console.error("Error logging stock movement:", error);
    }
  } catch (error) {
    console.error("Error in logStockMovement:", error);
  }
}
