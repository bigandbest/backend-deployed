import ProductWarehouseStockDAO from "../dao/product-warehouse-stock.dao.js";
import WarehouseDAO from "../dao/warehouse.dao.js";
import prisma from "../config/prisma.js";

/**
 * Get all inventory for a specific warehouse
 */
export const getWarehouseInventory = async (req, res) => {
  try {
    const { warehouseId } = req.params;
    const { search, category } = req.query;

    // Verify warehouse exists
    const warehouse = await WarehouseDAO.getById(warehouseId);
    if (!warehouse) {
      return res.status(404).json({
        success: false,
        error: "Warehouse not found",
      });
    }

    // Get all stock records for warehouse
    let whereCondition = {
      warehouse_id: parseInt(warehouseId),
    };

    const inventory = await prisma.inventory.findMany({
      where: whereCondition,
      include: {
        products: {
          include: {
            variants: {
              select: {
                id: true,
                title: true,
                sku: true,
                price: true,
              },
            },
            category: { select: { id: true, name: true } },
          },
        },
        product_variants: {
          select: {
            id: true,
            title: true,
            sku: true,
            price: true,
          },
        },
      },
      orderBy: { created_at: "desc" },
    });

    const transformedInventory = inventory.map((stock) => ({
      id: stock.id,
      product_id: stock.product_id,
      variant_id: stock.variant_id,
      warehouse_id: stock.warehouse_id,
      product_name: stock.products?.name,
      product_image: stock.products?.image,
      variant_name: stock.product_variants?.title || "Base Variant",
      sku: stock.product_variants?.sku || stock.products?.sku,
      stock_qty: stock.stock_quantity,
      reserved_qty: stock.reserved_quantity || 0,
      available_quantity: stock.stock_quantity - (stock.reserved_quantity || 0),
      minimum_threshold: stock.minimum_threshold || 0,
      cost_per_unit: stock.cost_per_unit,
      is_low_stock: stock.stock_quantity <= (stock.minimum_threshold || 0),
      last_restocked_at: stock.last_restocked_at,
      category: stock.products?.category,
    }));

    res.status(200).json({
      success: true,
      warehouse: {
        id: warehouse.id,
        name: warehouse.name,
        type: warehouse.type,
        location: warehouse.location,
      },
      inventory: transformedInventory,
      total_products: transformedInventory.length,
    });
  } catch (error) {
    console.error("Error fetching warehouse inventory:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

/**
 * Get inventory for a specific product across warehouses
 */
export const getProductInventoryAcrossWarehouses = async (req, res) => {
  try {
    const { productId } = req.params;

    // Verify product exists
    const product = await prisma.products.findUnique({
      where: { id: productId },
      include: {
        variants: {
          select: {
            id: true,
            title: true,
            sku: true,
            price: true,
          },
        },
      },
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        error: "Product not found",
      });
    }

    // Get stock in all warehouses
    const inventory = await prisma.inventory.findMany({
      where: {
        product_variants: { product_id: productId },
      },
      include: {
        warehouses: {
          select: {
            id: true,
            name: true,
            type: true,
            location: true,
          },
        },
        product_variants: {
          select: {
            id: true,
            title: true,
            sku: true,
          },
        },
      },
      orderBy: { warehouse_id: "asc" },
    });

    // Organize by warehouse type
    const zonal = inventory.filter((s) => s.warehouses?.type === "zonal");
    const division = inventory.filter((s) => s.warehouses?.type === "division");

    res.status(200).json({
      success: true,
      product: {
        id: product.id,
        name: product.name,
        image: product.image,
        variants: product.variants,
      },
      inventory_summary: {
        total_stock: inventory.reduce((sum, s) => sum + s.stock_quantity, 0),
        total_reserved: inventory.reduce(
          (sum, s) => sum + (s.reserved_quantity || 0),
          0
        ),
        warehouses_count: new Set(inventory.map((s) => s.warehouse_id)).size,
      },
      inventory_by_warehouse_type: {
        zonal,
        division,
      },
      all_inventory: inventory,
    });
  } catch (error) {
    console.error("Error fetching product inventory:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

/**
 * Add or update stock for product in warehouse
 */
export const updateWarehouseStock = async (req, res) => {
  try {
    const { warehouseId } = req.params;
    const {
      product_id,
      variant_id,
      stock_quantity,
      minimum_threshold,
      cost_per_unit,
    } = req.body;

    // Validate inputs
    if (!product_id || stock_quantity === undefined) {
      return res.status(400).json({
        success: false,
        error: "Product ID and stock quantity are required",
      });
    }

    // Verify warehouse and product exist
    const warehouse = await WarehouseDAO.getById(warehouseId);
    if (!warehouse) {
      return res.status(404).json({
        success: false,
        error: "Warehouse not found",
      });
    }

    const product = await prisma.products.findUnique({
      where: { id: product_id },
    });
    if (!product) {
      return res.status(404).json({
        success: false,
        error: "Product not found",
      });
    }

    // If variant_id provided, verify it exists
    if (variant_id) {
      const variant = await prisma.product_variants.findUnique({
        where: { id: variant_id },
      });
      if (!variant) {
        return res.status(404).json({
          success: false,
          error: "Variant not found",
        });
      }
    }

    // Upsert stock record
    const stockData = {
      stock_quantity: parseInt(stock_quantity),
      reserved_quantity: 0,
      last_restocked_at: new Date(),
    };

    let result;
    if (variant_id) {
      result = await ProductWarehouseStockDAO.upsertVariantStock(
        product_id,
        variant_id,
        warehouseId,
        stockData
      );
    } else {
      result = await ProductWarehouseStockDAO.upsertStock(
        product_id,
        warehouseId,
        stockData
      );
    }

    res.status(200).json({
      success: true,
      message: "Stock updated successfully",
      data: result,
    });
  } catch (error) {
    console.error("Error updating stock:", error);

    // Check if error is due to non-existent record
    if (error.message.includes("No existing stock record found")) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

/**
 * Update stock for product across MULTIPLE warehouses simultaneously
 */
export const updateMultiWarehouseStock = async (req, res) => {
  try {
    const {
      product_id,
      variant_id,
      warehouse_allocations
    } = req.body;

    // Validate inputs
    if (!product_id || !warehouse_allocations || !Array.isArray(warehouse_allocations)) {
      return res.status(400).json({
        success: false,
        error: "Product ID and warehouse allocations array are required",
      });
    }

    // Verify product exists
    const product = await prisma.products.findUnique({
      where: { id: product_id },
    });
    if (!product) {
      return res.status(404).json({
        success: false,
        error: "Product not found",
      });
    }

    // If variant_id provided, verify it exists
    if (variant_id) {
      const variant = await prisma.product_variants.findUnique({
        where: { id: variant_id },
      });
      if (!variant) {
        return res.status(404).json({
          success: false,
          error: "Variant not found",
        });
      }
    }

    const results = await prisma.$transaction(async (tx) => {
      const updatedRecords = [];

      for (const allocation of warehouse_allocations) {
        const { variant_id: allocationVariantId, warehouse_id, stock_quantity } = allocation;
        const effectiveVariantId = allocationVariantId || variant_id;
        if (!warehouse_id || stock_quantity === undefined || !effectiveVariantId) continue;

        const existingInv = await tx.inventory.findFirst({
          where: { variant_id: effectiveVariantId, warehouse_id: parseInt(warehouse_id) },
          select: { id: true },
        });
        let updated;
        if (existingInv) {
          updated = await tx.inventory.update({
            where: { id: existingInv.id },
            data: { stock_qty: parseInt(stock_quantity), updated_at: new Date() },
          });
        } else {
          updated = await tx.inventory.create({
            data: { variant_id: effectiveVariantId, warehouse_id: parseInt(warehouse_id), stock_qty: parseInt(stock_quantity), reserved_qty: 0, updated_at: new Date() },
          });
        }
        updatedRecords.push(updated);
      }
      return updatedRecords;
    });

    res.status(200).json({
      success: true,
      message: "Stock updated across warehouses successfully",
      data: results,
    });

  } catch (error) {
    console.error("Error updating multi-warehouse stock:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

/**
 * Allocate stock to zonal warehouses from division warehouse
 */
export const allocateStockToZonal = async (req, res) => {
  try {
    const { divisionWarehouseId } = req.params;
    const { product_id, variant_id, zonal_allocations } = req.body;

    // Validate
    if (!product_id || !zonal_allocations || !Array.isArray(zonal_allocations)) {
      return res.status(400).json({
        success: false,
        error: "Product ID and zonal allocations array are required",
      });
    }

    // Verify division warehouse
    const divisionWarehouse = await WarehouseDAO.getById(divisionWarehouseId);
    if (!divisionWarehouse || divisionWarehouse.type !== "division") {
      return res.status(400).json({
        success: false,
        error: "Invalid division warehouse",
      });
    }

    // Process allocations in a transaction
    const results = await prisma.$transaction(async (tx) => {
      const allocatedRecords = [];

      for (const allocation of zonal_allocations) {
        const { zonal_warehouse_id, quantity } = allocation;

        // Verify zonal warehouse exists and is a child of division
        const zonalWarehouse = await tx.warehouses.findFirst({
          where: {
            id: zonal_warehouse_id,
            type: "zonal",
          },
        });

        if (!zonalWarehouse) {
          throw new Error(`Invalid zonal warehouse: ${zonal_warehouse_id}`);
        }

        // Create or update allocation record
        const existingZonalInv = await tx.inventory.findFirst({
          where: { variant_id, warehouse_id: parseInt(zonal_warehouse_id) },
          select: { id: true, stock_qty: true },
        });
        let allocated;
        if (existingZonalInv) {
          allocated = await tx.inventory.update({
            where: { id: existingZonalInv.id },
            data: { stock_qty: existingZonalInv.stock_qty + parseInt(quantity), updated_at: new Date() },
          });
        } else {
          allocated = await tx.inventory.create({
            data: { variant_id, warehouse_id: parseInt(zonal_warehouse_id), stock_qty: parseInt(quantity), reserved_qty: 0, updated_at: new Date() },
          });
        }

        allocatedRecords.push(allocated);
      }

      return allocatedRecords;
    });

    res.status(200).json({
      success: true,
      message: "Stock allocated to zonal warehouses successfully",
      allocations: results,
    });
  } catch (error) {
    console.error("Error allocating stock to zonal:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

/**
 * Get low stock products in warehouse
 */
export const getLowStockProducts = async (req, res) => {
  try {
    const { warehouseId } = req.params;

    const lowStockProducts = await prisma.inventory.findMany({
      where: {
        warehouse_id: parseInt(warehouseId),
        stock_qty: { lte: 10 },
      },
      include: {
        products: {
          select: {
            id: true,
            name: true,
            image: true,
            category: { select: { id: true, name: true } },
          },
        },
        product_variants: {
          select: {
            id: true,
            title: true,
            sku: true,
          },
        },
      },
      orderBy: { stock_qty: "asc" },
    });

    res.status(200).json({
      success: true,
      data: lowStockProducts,
      count: lowStockProducts.length,
    });
  } catch (error) {
    console.error("Error fetching low stock products:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

/**
 * Bulk update inventory (for CSV import)
 */
export const bulkUpdateInventory = async (req, res) => {
  try {
    const { warehouseId } = req.params;
    const { inventory_records } = req.body;

    if (!Array.isArray(inventory_records) || inventory_records.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Inventory records array is required",
      });
    }

    // Verify warehouse
    const warehouse = await WarehouseDAO.getById(warehouseId);
    if (!warehouse) {
      return res.status(404).json({
        success: false,
        error: "Warehouse not found",
      });
    }

    const results = await prisma.$transaction(async (tx) => {
      const updatedRecords = [];

      for (const record of inventory_records) {
        const { product_id, variant_id, stock_quantity, minimum_threshold } =
          record;

        if (!product_id || stock_quantity === undefined) {
          continue;
        }

        if (!variant_id) continue;
        const existingBulkInv = await tx.inventory.findFirst({
          where: { variant_id, warehouse_id: parseInt(warehouseId) },
          select: { id: true },
        });
        let updated;
        if (existingBulkInv) {
          updated = await tx.inventory.update({
            where: { id: existingBulkInv.id },
            data: { stock_qty: parseInt(stock_quantity), updated_at: new Date() },
          });
        } else {
          updated = await tx.inventory.create({
            data: { variant_id, warehouse_id: parseInt(warehouseId), stock_qty: parseInt(stock_quantity), reserved_qty: 0, updated_at: new Date() },
          });
        }

        updatedRecords.push(updated);
      }

      return updatedRecords;
    });

    res.status(200).json({
      success: true,
      message: `${results.length} inventory records updated successfully`,
      count: results.length,
      data: results,
    });
  } catch (error) {
    console.error("Error bulk updating inventory:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};

/**
 * Get inventory analytics for warehouse
 */
export const getInventoryAnalytics = async (req, res) => {
  try {
    const { warehouseId } = req.params;

    const inventory = await prisma.inventory.findMany({
      where: {
        warehouse_id: parseInt(warehouseId),
      },
      include: {
        products: {
          select: {
            id: true,
            category: { select: { id: true, name: true } },
          },
        },
      },
    });

    // Calculate analytics
    const totalStock = inventory.reduce((sum, s) => sum + s.stock_quantity, 0);
    const totalReserved = inventory.reduce(
      (sum, s) => sum + (s.reserved_quantity || 0),
      0
    );
    const totalValue = inventory.reduce(
      (sum, s) => sum + s.stock_quantity * (s.cost_per_unit || 0),
      0
    );
    const lowStockCount = inventory.filter(
      (s) => s.stock_quantity <= (s.minimum_threshold || 0)
    ).length;

    // Group by category
    const byCategory = {};
    inventory.forEach((stock) => {
      const categoryName = stock.products?.category?.name || "Uncategorized";
      if (!byCategory[categoryName]) {
        byCategory[categoryName] = {
          stock_qty: 0,
          product_count: 0,
          variants_count: 0,
        };
      }
      byCategory[categoryName].stock_quantity += stock.stock_quantity;
      byCategory[categoryName].product_count++;
      if (stock.variant_id) byCategory[categoryName].variants_count++;
    });

    res.status(200).json({
      success: true,
      analytics: {
        total_stock_items: totalStock,
        total_reserved: totalReserved,
        total_available: totalStock - totalReserved,
        inventory_value: totalValue,
        total_products: inventory.length,
        low_stock_count: lowStockCount,
        by_category: byCategory,
      },
    });
  } catch (error) {
    console.error("Error fetching inventory analytics:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
};
