import express from 'express';
import {
  getProductsByPincode,
  checkProductAvailability,
  updateWarehouseInventory,
  getWarehouseInventory,
  getWarehouseAnalytics,
  getWarehouseLowStock,
  getWarehouseMovements,
  deleteStock,
  checkAvailability,
  getVariantStock,
  reserveStock,
  getLowStock,
} from '../controller/inventoryController.js';

const router = express.Router();

// Pincode-based availability
router.get('/pincode/:pincode/products', getProductsByPincode);
router.get('/pincode/:pincode/product/:productId/availability', checkProductAvailability);

// Warehouse inventory (Admin)
router.post('/warehouse/inventory/update', updateWarehouseInventory);
// Alias used by InventoryManagement frontend
router.post('/warehouse/:warehouseId/update-stock', (req, res) => {
  if (!req.body.warehouse_id) req.body.warehouse_id = parseInt(req.params.warehouseId);
  return updateWarehouseInventory(req, res);
});
router.delete('/stock/:stockId', deleteStock);
router.get('/warehouse/:warehouseId', getWarehouseInventory);
router.get('/warehouse/:warehouseId/analytics', getWarehouseAnalytics);
router.get('/warehouse/:warehouseId/low-stock', getWarehouseLowStock);
router.get('/warehouse/:warehouseId/movements', getWarehouseMovements);
router.get('/warehouse/:warehouseId/inventory', getWarehouseInventory); // legacy alias

// Stock operations
router.post('/check-availability', checkAvailability);
router.get('/variant/:variantId', getVariantStock);
router.post('/reserve', reserveStock);
router.get('/low-stock', getLowStock);

export default router;