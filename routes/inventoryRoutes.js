import express from 'express';
import {
  getProductsByPincode,
  checkProductAvailability,
  updateWarehouseInventory,
  getWarehouseInventory
} from '../controller/inventoryController.js';
import inventoryDAO from '../dao/inventory.dao.js';

const router = express.Router();

// Get products available in specific pincode
router.get('/pincode/:pincode/products', getProductsByPincode);

// Check specific product availability in pincode
router.get('/pincode/:pincode/product/:productId/availability', checkProductAvailability);

// Update warehouse inventory (Admin)
router.post('/warehouse/inventory/update', updateWarehouseInventory);

// Get warehouse inventory (Admin)
router.get('/warehouse/:warehouseId/inventory', getWarehouseInventory);

// ========== NEW PRODUCTION-LEVEL INVENTORY ROUTES ==========

/**
 * POST /api/inventory/check-availability
 * Batch check stock availability for multiple items
 */
router.post('/check-availability', async (req, res) => {
  try {
    const { items, warehouse_id } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'items array is required'
      });
    }

    const availability = await inventoryDAO.checkBulkAvailability(
      items,
      warehouse_id ? parseInt(warehouse_id) : null
    );

    res.json({
      success: true,
      data: availability,
      total_items: items.length,
      all_available: availability.every(item => item.can_fulfill)
    });
  } catch (error) {
    console.error('Error checking availability:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/inventory/variant/:variantId
 * Get stock information for a specific variant
 */
router.get('/variant/:variantId', async (req, res) => {
  try {
    const { variantId } = req.params;
    const { warehouse_id } = req.query;

    const stockInfo = await inventoryDAO.getAvailableStock(
      variantId,
      warehouse_id ? parseInt(warehouse_id) : null
    );

    res.json({
      success: true,
      data: stockInfo
    });
  } catch (error) {
    console.error('Error fetching variant stock:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * POST /api/inventory/reserve
 * Reserve stock for order processing
 */
router.post('/reserve', async (req, res) => {
  try {
    const { variant_id, quantity, warehouse_id } = req.body;

    if (!variant_id || !quantity || !warehouse_id) {
      return res.status(400).json({
        success: false,
        error: 'variant_id, quantity, and warehouse_id are required'
      });
    }

    const result = await inventoryDAO.reserveStock(
      variant_id,
      parseInt(quantity),
      parseInt(warehouse_id)
    );

    res.json({
      success: true,
      data: result,
      message: 'Stock reserved successfully'
    });
  } catch (error) {
    console.error('Error reserving stock:', error);
    res.status(error.message.includes('Insufficient') ? 400 : 500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

/**
 * GET /api/inventory/low-stock
 * Get low stock items for alerts
 */
router.get('/low-stock', async (req, res) => {
  try {
    const { threshold = 10, warehouse_id } = req.query;

    const lowStockItems = await inventoryDAO.getLowStockItems(
      parseInt(threshold),
      warehouse_id ? parseInt(warehouse_id) : null
    );

    res.json({
      success: true,
      data: lowStockItems,
      total: lowStockItems.length
    });
  } catch (error) {
    console.error('Error fetching low stock items:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

export default router;