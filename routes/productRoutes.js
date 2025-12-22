import express from "express";
import {
  getAllProducts,
  getProductsByCategory,
  getAllCategories,
  getFeaturedProducts,
  getProductsWithFilters,
  getProductById,
  getQuickPicks,
  getProductsBySubcategory,
  getProductsByGroup,
  updateProductDelivery,
  checkProductsDelivery,
  getProductsByDeliveryZone,
  getProductVariants,
  getProductsByCategoryWithDiscount,
  getProductsBySubcategoryWithDiscount,
} from "../controller/productController.js";
import { getProductBulkSettings } from "../controller/bulkProductController.js";
import { getProductVisibilityMatrix } from "../controller/productWarehouseController.js";

const router = express.Router();

router.get("/allproducts", getAllProducts);
router.get("/categories", getAllCategories);
router.get("/featured", getFeaturedProducts);
router.get("/filter", getProductsWithFilters);
router.get("/quick-picks", getQuickPicks);
router.get("/delivery-zone", getProductsByDeliveryZone);

// Discount-based routes (must come before generic routes)
router.get("/category/:categoryId/discount", getProductsByCategoryWithDiscount);
router.get("/subcategory/:subcategoryId/discount", getProductsBySubcategoryWithDiscount);

router.get("/category/:category", getProductsByCategory);
router.get("/subcategory/:subcategoryId", getProductsBySubcategory);
router.get("/group/:groupId", getProductsByGroup);
router.get("/:productId/visibility", getProductVisibilityMatrix);
router.get("/:productId/variants", getProductVariants);
router.get("/:productId/bulk-settings", getProductBulkSettings);

// Delivery-related routes
router.post("/check-delivery", checkProductsDelivery);
router.put("/:id/delivery", updateProductDelivery);

router.get("/:id", getProductById);

export default router;
