import express from "express";
const router = express.Router();

import {
  mapProductToWarehouse,
  removeProductFromWarehouse,
  getWarehousesForProduct,
  getProductsForWarehouse,
  bulkMapByNames,
  createProductWithWarehouse,
  distributeProductToZones,
  getProductStockSummary,
} from "../controller/productWarehouseController.js";

// Enhanced product creation with warehouse management
router.post("/products/create", createProductWithWarehouse);

// Auto-distribute product to zonal warehouses
router.post("/products/:product_id/distribute", distributeProductToZones);

// Get comprehensive stock summary for a product
router.get("/products/:product_id/stock-summary", getProductStockSummary);

// Map a single product to warehouse (by ID)
router.post("/map", mapProductToWarehouse);

// Bulk map using names (for admin UI)
router.post("/map-bulk", bulkMapByNames);

// Remove product from warehouse
router.post("/remove", removeProductFromWarehouse);

// Get all warehouses for a product
router.get("/product/:product_id", getWarehousesForProduct);

// Get all products in a warehouse
router.get("/warehouse/:warehouse_id", getProductsForWarehouse);

export default router;
