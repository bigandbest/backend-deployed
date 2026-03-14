import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
import { triggerNotifyOnRestock } from './outOfStockController.js';

// Get products available in a specific pincode
const getProductsByPincode = async (req, res) => {
  try {
    const { pincode } = req.params;
    const { category, limit = 50 } = req.query;

    // Get warehouses serving this pincode using Prisma
    const warehouseMappings = await prisma.pincode_warehouse_mapping.findMany({
      where: {
        pincode: pincode,
        is_active: true
      },
      include: {
        warehouses: {
          select: {
            id: true,
            name: true,
            address: true
          }
        }
      },
      orderBy: {
        priority: 'asc'
      }
    });

    if (!warehouseMappings.length) {
      return res.status(404).json({
        success: false,
        message: "No delivery available for this pincode",
      });
    }

    const warehouseIds = warehouseMappings.map((m) => m.warehouse_id);

    // Build where clause for products
    const whereClause = {
      warehouse_id: { in: warehouseIds },
      available_quantity: { gt: 0 }
    };

    // Get products with inventory from these warehouses using Prisma
    const inventory = await prisma.warehouse_inventory.findMany({
      where: whereClause,
      include: {
        products: {
          select: {
            id: true,
            name: true,
            description: true,
            price: true,
            old_price: true,
            brand_name: true,
            active: true,
            category: {
              select: {
                name: true
              }
            },
            media: {
              where: { media_type: 'image' },
              take: 1,
              select: { url: true }
            }
          }
        },
        product_variants: {
          select: {
            id: true,
            title: true,
            price: true,
            old_price: true
          }
        }
      },
      take: parseInt(limit)
    });

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
          id: item.products?.id,
          name: item.products?.name,
          description: item.products?.description,
          price: item.products?.price,
          old_price: item.products?.old_price,
          image: item.products?.media?.[0]?.url || null,
          category: item.products?.category?.name,
          brand_name: item.products?.brand_name,
          active: item.products?.active,
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
    console.error("Error in getProductsByPincode:", error);
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

    // Get product details using Prisma
    const product = await prisma.products.findUnique({
      where: { id: productId },
      select: {
        id: true,
        name: true,
        delivery_type: true
      }
    });

    if (!product) {
      return res.json({
        success: true,
        data: {
          is_available: false,
          message: "Product not found",
        },
      });
    }

    // Check if pincode exists in division warehouse (faster delivery)
    const divisionWarehouse = await prisma.warehouse_pincodes.findFirst({
      where: {
        pincode: pincode,
        is_active: true
      },
      include: {
        warehouses: {
          select: {
            id: true,
            name: true,
            type: true,
            parent_warehouse_id: true
          }
        }
      }
    });

    if (divisionWarehouse) {
      // Check if product is available in this division warehouse
      const divisionStock = await prisma.product_warehouse_stock.findFirst({
        where: {
          product_id: productId,
          warehouse_id: divisionWarehouse.warehouses.id,
          is_active: true
        },
        select: {
          stock_quantity: true,
          reserved_quantity: true
        }
      });

      if (divisionStock) {
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
    const zonePincode = await prisma.zone_pincodes.findFirst({
      where: {
        pincode: pincode
      },
      include: {
        delivery_zones: {
          include: {
            warehouse_zones: {
              include: {
                warehouses: {
                  select: {
                    id: true,
                    name: true,
                    type: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (zonePincode && zonePincode.delivery_zones) {
      // Get zonal warehouses serving this zone
      const zonalWarehouses =
        zonePincode.delivery_zones.warehouse_zones?.filter(
          (wz) => wz.warehouses?.type === "zonal"
        ) || [];

      for (const warehouseZone of zonalWarehouses) {
        const zonalStock = await prisma.product_warehouse_stock.findFirst({
          where: {
            product_id: productId,
            warehouse_id: warehouseZone.warehouse_id,
            is_active: true
          },
          select: {
            stock_quantity: true,
            reserved_quantity: true
          }
        });

        if (zonalStock) {
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

    // Use Prisma upsert for insert-or-update logic
    const data = await prisma.warehouse_inventory.upsert({
      where: {
        warehouse_id_product_id_variant_id: {
          warehouse_id,
          product_id,
          variant_id: variant_id || null,
        }
      },
      update: {
        stock_quantity,
        last_updated: new Date(),
      },
      create: {
        warehouse_id,
        product_id,
        variant_id: variant_id || null,
        stock_quantity,
        last_updated: new Date(),
      }
    });

    res.json({
      success: true,
      message: "Inventory updated successfully",
      data,
    });

    // Fire-and-forget: notify users waiting for restock
    if (parseInt(stock_quantity) > 0) {
      triggerNotifyOnRestock(product_id).catch((err) =>
        console.error('[Restock notify error]', err)
      );
    }
  } catch (error) {
    console.error("Error updating inventory:", error);
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
    const warehouseIdInt = parseInt(warehouseId);

    console.log('🔍 Fetching inventory for warehouse ID:', warehouseIdInt);

    const inventory = await prisma.product_warehouse_stock.findMany({
      where: { warehouse_id: warehouseIdInt, is_active: true },
      include: {
        products: {
          select: {
            id: true,
            name: true,
            category: { select: { name: true } },
            media: {
              where: { media_type: 'image' },
              take: 1,
              select: { url: true }
            }
          }
        },
        product_variants: {
          select: {
            id: true,
            title: true
          }
        }
      },
      orderBy: { created_at: 'desc' }
    });

    console.log('📦 Found inventory items:', inventory.length);
    if (inventory.length > 0) {
      console.log('Sample item:', JSON.stringify(inventory[0], null, 2));
    }

    // Map to frontend expected structure if necessary
    const mappedData = inventory.map(item => ({
      ...item,
      product_name: item.products?.name,
      product_image: item.products?.media?.[0]?.url || null,
      category: item.products?.category,
      variant_name: item.product_variants?.title
    }));

    res.json({
      success: true,
      inventory: mappedData || [],
    });
  } catch (error) {
    console.error('❌ Error in getWarehouseInventory:', error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// Get warehouse analytics
const getWarehouseAnalytics = async (req, res) => {
  try {
    const { warehouseId } = req.params;
    const warehouseIdInt = parseInt(warehouseId);

    // Get total stock items count
    const totalStockItems = await prisma.product_warehouse_stock.count({
      where: { warehouse_id: warehouseIdInt, is_active: true }
    });

    // Get total available stock sum
    const inventory = await prisma.product_warehouse_stock.aggregate({
      where: { warehouse_id: warehouseIdInt, is_active: true },
      _sum: {
        stock_quantity: true
      }
    });

    const totalAvailable = inventory._sum.stock_quantity || 0;
    const inventoryValue = totalAvailable * 0; // Placeholder

    const lowStockCount = await prisma.product_warehouse_stock.count({
      where: {
        warehouse_id: warehouseIdInt,
        stock_quantity: { lt: 10 },
        is_active: true
      }
    });

    res.json({
      success: true,
      analytics: {
        total_stock_items: totalStockItems,
        total_available: totalAvailable,
        inventory_value: inventoryValue,
        low_stock_count: lowStockCount
      }
    });
  } catch (error) {
    console.error("Error fetching analytics:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get low stock items for a specific warehouse
const getWarehouseLowStock = async (req, res) => {
  try {
    const { warehouseId } = req.params;
    const { threshold = 10 } = req.query;
    const warehouseIdInt = parseInt(warehouseId);

    const lowStockItems = await prisma.product_warehouse_stock.findMany({
      where: {
        warehouse_id: warehouseIdInt,
        stock_quantity: { lt: parseInt(threshold) },
        is_active: true
      },
      include: {
        products: {
          select: {
            id: true,
            name: true,
            media: {
              where: { media_type: 'image' },
              take: 1,
              select: { url: true }
            }
          }
        },
        product_variants: {
          select: {
            id: true,
            title: true
          }
        }
      }
    });

    res.json({
      success: true,
      data: lowStockItems.map(item => ({
        ...item,
        products: {
          ...item.products,
          image: item.products?.media?.[0]?.url || null
        },
        variant_name: item.product_variants?.title
      }))
    });
  } catch (error) {
    console.error("Error fetching low stock:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


// Get stock movements for a specific warehouse
const getWarehouseMovements = async (req, res) => {
  try {
    const { warehouseId } = req.params;
    const warehouseIdInt = parseInt(warehouseId);
    const { limit = 50 } = req.query;

    const movements = await prisma.stock_movements.findMany({
      where: { warehouse_id: warehouseIdInt },
      include: {
        warehouse: {
          select: {
            name: true
          }
        }
      },
      orderBy: { created_at: 'desc' },
      take: parseInt(limit)
    });

    const productIds = [...new Set(movements.map(m => m.product_id))];
    const products = await prisma.products.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true }
    });
    const productMap = products.reduce((acc, p) => ({ ...acc, [p.id]: p.name }), {});

    res.json({
      success: true,
      data: movements.map(m => ({
        ...m,
        product_name: productMap[m.product_id] || 'Unknown Product',
        warehouse_name: m.warehouse?.name
      }))
    });
  } catch (error) {
    console.error("Error fetching stock movements:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


export {
  getProductsByPincode,
  checkProductAvailability,
  updateWarehouseInventory,
  getWarehouseInventory,
  getWarehouseAnalytics,
  getWarehouseLowStock,
  getWarehouseMovements,
};
