import express from "express";
const router = express.Router();
import {
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
  getAllWarehouses,
  getSingleWarehouse,
  getWarehouseProducts,
  addProductToWarehouse,
  updateWarehouseProduct,
  removeProductFromWarehouse,
  getWarehouseHierarchy,
  getChildWarehouses,
  getWarehousePincodes,
  addWarehousePincodes,
  removeWarehousePincode,
  updateWarehousePincode,
  getZonalWarehousePincodes,
  findWarehouseForOrder,
  getAvailableProductsForWarehouse,
  getWarehouseSummary,
  getGlobalLowStock,
  getGlobalStockMovements,
  getWarehouseSellers,
  assignWarehouseSellers,
  removeWarehouseSeller,
  getWarehouseRiders,
  assignWarehouseRiders,
  removeWarehouseRider,
} from "../controller/warehouseController.js";

// RESTful warehouse routes
router.get("/", getAllWarehouses);
router.post("/", createWarehouse);
router.get("/summary", getWarehouseSummary);
router.get("/low-stock", getGlobalLowStock);
router.get("/movements", getGlobalStockMovements);
router.get("/hierarchy", getWarehouseHierarchy);
router.get("/:id", getSingleWarehouse);
router.get("/:id/children", getChildWarehouses);
router.get("/:id/products", getWarehouseProducts);
router.get("/:id/available-products", getAvailableProductsForWarehouse);
router.post("/:id/products", addProductToWarehouse);
router.put("/:id/products/:productId", updateWarehouseProduct);
router.delete("/:id/products/:productId", removeProductFromWarehouse);
router.put("/:id", updateWarehouse);
router.delete("/:id", deleteWarehouse);

// Pincode management routes
router.get("/:warehouseId/pincodes", getWarehousePincodes);
router.post("/:warehouseId/pincodes", addWarehousePincodes);
router.put("/:warehouseId/pincodes/:pincode", updateWarehousePincode);
router.delete("/:warehouseId/pincodes/:pincode", removeWarehousePincode);
router.get("/:warehouseId/available-pincodes", getZonalWarehousePincodes);

// Seller management routes (division warehouses)
router.get("/:id/sellers", getWarehouseSellers);
router.post("/:id/sellers", assignWarehouseSellers);
router.delete("/:id/sellers/:sellerId", removeWarehouseSeller);

// Rider management routes (division warehouses)
router.get("/:id/riders", getWarehouseRiders);
router.post("/:id/riders", assignWarehouseRiders);
router.delete("/:id/riders/:riderId", removeWarehouseRider);

// Order fulfillment route
router.get("/find-for-order", findWarehouseForOrder);

export default router;
