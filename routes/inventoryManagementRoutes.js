import express from "express";
import {
  getWarehouseInventory,
  getProductInventoryAcrossWarehouses,
  updateWarehouseStock,
  allocateStockToZonal,
  getLowStockProducts,
  bulkUpdateInventory,
  getInventoryAnalytics,
  updateMultiWarehouseStock,
} from "../controller/inventoryManagementController.js";
import { authenticateToken } from "../middleware/authenticate.js";

const router = express.Router();

// Get inventory for a specific warehouse
router.get("/warehouse/:warehouseId", getWarehouseInventory);

// Get product inventory across all warehouses
router.get("/product/:productId/warehouses", getProductInventoryAcrossWarehouses);

// Update stock for a product in a warehouse
router.post("/warehouse/:warehouseId/update-stock", authenticateToken, updateWarehouseStock);

// Update stock for a product across multiple warehouses
router.post("/multi-warehouse/update-stock", authenticateToken, updateMultiWarehouseStock);

// Allocate stock from division to zonal warehouses
router.post(
  "/warehouse/:divisionWarehouseId/allocate-to-zonal",
  authenticateToken,
  allocateStockToZonal
);

// Get low stock products in warehouse
router.get("/warehouse/:warehouseId/low-stock", getLowStockProducts);

// Bulk update inventory
router.post("/warehouse/:warehouseId/bulk-update", authenticateToken, bulkUpdateInventory);

// Get inventory analytics
router.get("/warehouse/:warehouseId/analytics", getInventoryAnalytics);

export default router;
