import express from "express";
import {
  mapProductToBandBGroup,
  removeProductFromBandBGroup,
  getBandBGroupsForProduct,
  getProductsForBandBGroup,
  bulkMapByNames,
} from "../controller/b&bGroupProductController.js";

const router = express.Router();

// Route to map a product to a bnb group
router.post("/map", mapProductToBandBGroup);

// Route to remove a product from a bnb group
router.delete("/remove", removeProductFromBandBGroup);

// Route to get all bnb groups containing a specific product
router.get("/getGroupsByProduct/:product_id", getBandBGroupsForProduct);

// Route to get all products within a specific bnb group
router.get("/getProductsByGroup/:bnb_group_id", getProductsForBandBGroup);

// Route to bulk map products to a bnb group by names
router.post("/bulk-map", bulkMapByNames);

export default router;