import productDao from "../dao/product.dao.js";
import warehouseDao from "../dao/warehouse.dao.js";
import productWarehouseStockDao from "../dao/product-warehouse-stock.dao.js";
import warehouseZoneDao from "../dao/warehouse-zone.dao.js";
import stockMovementDao from "../dao/stock-movement.dao.js";

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
      subcategory_id,
      group_id,
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
      brand_name,
      portion,
      quantity,
      faq,
      images,
      image,
      video,
      uom,
      uom_value,
      uom_unit,
      store_id,
      delivery_type = "nationwide",
      allowed_zone_ids = [],
      has_variants = false,
      enable_bulk_pricing = false,
      bulk_min_quantity = 50,
      bulk_discount_percentage = 0,
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
    if (!name || !price) {
      return res.status(400).json({
        success: false,
        error: "Name and price are required",
      });
    }

    // Convert empty strings to null for UUID fields
    if (category_id === "") category_id = null;
    if (subcategory_id === "") subcategory_id = null;
    if (group_id === "") group_id = null;
    if (store_id === "") store_id = null;

    // Auto-calculate discount if old_price is provided
    let calculatedDiscount = discount || 0;
    if (old_price && old_price > price) {
      calculatedDiscount = Math.round(((old_price - price) / old_price) * 100);
    }

    // Step 1: Create the product
    const productData = {
      name,
      price,
      old_price: old_price || 0,
      discount: calculatedDiscount,
      category_id: category_id || null,
      subcategory_id: subcategory_id || null,
      group_id: group_id || null,
      description: description || "",
      specifications: specifications || "",
      rating: rating || 4.0,
      review_count: review_count || 0,
      featured: featured || false,
      popular: popular || false,
      stock: stock || initial_stock || 100,
      stock_quantity: stock || initial_stock || 100,
      in_stock: in_stock !== false,
      active: active !== false,
      shipping_amount: shipping_amount || 0,
      weight_value: weight_value || "",
      weight_unit: weight_unit || "kg",
      brand_name: brand_name || "BigandBest",
      portion: portion || "",
      quantity: quantity || "",
      faq: faq || [],
      images: images || [],
      image: image || null,
      video: video || null,
      uom: uom || null,
      uom_value: uom_value || null,
      uom_unit: uom_unit || null,
      store_id: store_id || null,
      delivery_type,
      allowed_zone_ids,
      has_variants,
      enable_bulk_pricing,
      bulk_min_quantity,
      bulk_discount_percentage,
      warehouse_mapping_type,
      assigned_warehouse_ids,
      primary_warehouses,
      fallback_warehouses,
      enable_fallback,
      warehouse_notes,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const product = await productDao.createProduct(productData);

    // Step 2: Handle warehouse assignments based on mapping type
    let warehouseAssignments = [];

    if (warehouse_mapping_type === "nationwide") {
      // Auto-assign to all zonal warehouses for nationwide coverage
      const zonalWarehouses = await warehouseDao.list({
        type: "zonal",
        active: true,
      });

      if (zonalWarehouses) {
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
      try {
        await productWarehouseStockDao.createMany(stockInserts);
      } catch (stockError) {
        console.error("Stock insertion error:", stockError);
        // Don't fail the entire operation, just log the error
      }
    }

    // Step 4: Update product with finalized warehouse arrays
    if (primary_warehouses.length > 0 || fallback_warehouses.length > 0) {
      try {
        await productDao.updateProduct(product.id, {
          primary_warehouses,
          fallback_warehouses,
        });
      } catch (updateError) {
        console.error("Product warehouse update error:", updateError);
      }
    }

    // Step 5: Auto-distribute to zones if enabled
    if (auto_distribute_to_zones && warehouse_mapping_type === "central") {
      await autoDistributeToZonalWarehouses(
        product.id,
        zone_distribution_quantity,
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
    const { product_id, warehouse_id, stock_quantity = 0 } = req.body;

    if (!product_id || !warehouse_id) {
      return res
        .status(400)
        .json({ error: "product_id and warehouse_id are required." });
    }

    // Insert mapping via upsert (re-using productWarehouseStockDao if applicable or custom logic)
    // Note: The original code used a table 'product_warehouse' which seems to be replaced by 'product_warehouse_stock' in Prisma
    await productWarehouseStockDao.upsertStock(product_id, warehouse_id, {
      stock_quantity,
    });

    res
      .status(201)
      .json({ message: "Product mapped to warehouse successfully." });
  } catch (err) {
    console.error("Map product to warehouse error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// 2️⃣ Remove product from a warehouse
export const removeProductFromWarehouse = async (req, res) => {
  try {
    const { product_id, warehouse_id } = req.body;

    const stockEntry = await productWarehouseStockDao.getByProductAndWarehouse(
      product_id,
      warehouse_id,
    );
    if (stockEntry) {
      await productWarehouseStockDao.updateStock(stockEntry.id, {
        is_active: false,
      });
    }

    res.status(200).json({ message: "Mapping removed successfully." });
  } catch (err) {
    console.error("Remove product from warehouse error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// 3️⃣ Get all warehouses stocking a product
export const getWarehousesForProduct = async (req, res) => {
  try {
    const { product_id } = req.params;

    const data = await productWarehouseStockDao.listByProduct(product_id);

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
    console.error("Get warehouses for product error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// 4️⃣ Get all products in a warehouse
export const getProductsForWarehouse = async (req, res) => {
  try {
    const { warehouse_id } = req.params;

    const stockItems =
      await productWarehouseStockDao.listProductsInWarehouse(warehouse_id);

    // Transform to match previous response structure if needed, or return as is
    // The previous structure was likely flat or nested.
    // Supabase returns: [{ product_id, products: {...} }]
    // DAO returns: [{ product_id, products: {...}, ...stockFields }]
    // We can return the DAO result directly as it contains the necessary info.

    res.status(200).json(stockItems);
  } catch (err) {
    console.error("Get products for warehouse error:", err);
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
    const warehouseData = await warehouseDao.getByName(warehouse_name);

    if (!warehouseData) {
      return res.status(404).json({ error: "Warehouse not found." });
    }

    // 2. Get product IDs from names
    const products = await productDao.getProductsByNames(product_names);

    if (!products || !products.length) {
      return res.status(404).json({ error: "No matching products found." });
    }

    // 3. Map each product to warehouse
    for (const p of products) {
      await productWarehouseStockDao.upsertStock(p.id, warehouseData.id, {
        stock_quantity: 0,
      });
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
      force_distribution,
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

    const stockData = await productWarehouseStockDao.listByProduct(product_id);

    if (!stockData) {
      return res.status(404).json({
        success: false,
        error: "No stock data found",
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

    const product = await productDao.getProductById(productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        error: "Product not found",
      });
    }

    // Map zonal warehouse -> zone details
    const zoneMappings = await warehouseZoneDao.listActiveMappings();

    if (!zoneMappings) {
      return res.status(500).json({
        success: false,
        error: "Failed to load warehouse zone mappings",
      });
    }

    const zonalToZoneMap = new Map();
    zoneMappings?.forEach((mapping) => {
      if (mapping.zone) {
        zonalToZoneMap.set(mapping.warehouse_id, {
          zone_id: mapping.zone.id,
          zone_name: mapping.zone.display_name || mapping.zone.name,
        });
      }
    });

    const stockRows = await productWarehouseStockDao.listByProduct(productId);

    if (!stockRows) {
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
          (division) => division.available_quantity > 0,
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
          (zone) => zone.visibility === "zone_available",
        ).length,
        division_only: zones.filter(
          (zone) => zone.visibility === "division_only",
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

    const zone = await warehouseDao.getZoneById(zoneId); // Corrected to use warehouseDao or similar if exists

    if (!zone) {
      return res.status(404).json({
        success: false,
        error: "Zone not found",
      });
    }

    const zoneWarehouseMappings = await warehouseZoneDao.listByZone(zoneId);

    if (!zoneWarehouseMappings) {
      return res.status(500).json({
        success: false,
        error: "Failed to fetch zonal warehouses",
      });
    }

    const zonalWarehouseIds =
      zoneWarehouseMappings
        ?.filter(
          (mapping) =>
            mapping.warehouse?.type === "zonal" && mapping.warehouse?.is_active,
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

    const divisionWarehouses = await warehouseDao.list({
      type: "division",
      active: true,
    });

    // Manual filter for parent_warehouse_id since list doesn't take nested filters easily here
    const filteredDivisions =
      divisionWarehouses?.filter((w) =>
        zonalWarehouseIds.includes(w.parent_warehouse_id),
      ) || [];

    if (!divisionWarehouses) {
      return res.status(500).json({
        success: false,
        error: "Failed to fetch division warehouses",
      });
    }

    const divisionIds =
      filteredDivisions.map((warehouse) => warehouse.id) || [];
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

    const stockRows =
      await productWarehouseStockDao.listByWarehouses(warehouseIds);

    if (!stockRows) {
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
          (division) => division.available_quantity > 0,
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
          (product) => product.visibility === "zone_available",
        ).length,
        division_only: products.filter(
          (product) => product.visibility === "division_only",
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
  const warehouses = await warehouseDao.list({ type: "central", active: true });
  return warehouses && warehouses.length > 0 ? warehouses[0] : null;
}

// Helper function to get warehouse by ID
async function getWarehouseById(warehouseId) {
  return await warehouseDao.getById(warehouseId);
}

// Helper function to auto-distribute to zonal warehouses
async function autoDistributeToZonalWarehouses(
  productId,
  quantityPerZone = 50,
  specificZones = [],
  forceDistribution = false,
) {
  try {
    // Get all active zonal warehouses
    let zonalWarehouses = await warehouseDao.list({
      type: "zonal",
      active: true,
    });

    if (specificZones.length > 0) {
      zonalWarehouses = zonalWarehouses.filter((w) =>
        specificZones.includes(w.id),
      );
    }

    if (!zonalWarehouses) {
      return { success: false, error: "Failed to fetch zonal warehouses" };
    }

    const distributions = [];
    const stockInserts = [];

    for (const warehouse of zonalWarehouses) {
      // Check if product already exists in this warehouse
      const existingStock =
        await productWarehouseStockDao.getByProductAndWarehouse(
          productId,
          warehouse.id,
        );

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
        const newStock = existingStock.stock_quantity + quantityPerZone;
        await productWarehouseStockDao.updateStock(existingStock.id, {
          stock_quantity: newStock,
          last_restocked_at: new Date().toISOString(),
        });
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
      try {
        await productWarehouseStockDao.createMany(stockInserts);
      } catch (insertError) {
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
    await stockMovementDao.create(movement);
  } catch (error) {
    console.error("Error in logStockMovement:", error);
  }
}
