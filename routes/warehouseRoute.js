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
  getZonalWarehousePincodes,
  findWarehouseForOrder,
} from "../controller/warehouseController.js";

// RESTful warehouse routes
router.get("/", getAllWarehouses);
router.post("/", createWarehouse);
router.get("/hierarchy", getWarehouseHierarchy);
router.get("/:id", getSingleWarehouse);
router.get("/:id/children", getChildWarehouses);
router.get("/:id/products", getWarehouseProducts);
router.post("/:id/products", addProductToWarehouse);
router.put("/:id/products/:productId", updateWarehouseProduct);
router.delete("/:id/products/:productId", removeProductFromWarehouse);
router.put("/:id", updateWarehouse);
router.delete("/:id", deleteWarehouse);

// Pincode management routes
router.get("/:warehouseId/pincodes", getWarehousePincodes);
router.post("/:warehouseId/pincodes", addWarehousePincodes);
router.delete("/:warehouseId/pincodes/:pincode", removeWarehousePincode);
router.get("/:warehouseId/available-pincodes", getZonalWarehousePincodes);

// Order fulfillment route
router.get("/find-for-order", findWarehouseForOrder);

export default router;
