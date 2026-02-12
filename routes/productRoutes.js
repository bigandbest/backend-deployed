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
  getProductsByBrand,
  getProductsCartData,
  getEverydayEssentials,
  getTopProducts,
  getRelatedProducts,
  getRelatedProductsBySubcategory, // NEW: For single product page
  getSuperSaver, // NEW: BBM Super Saver - Top 50 lowest price
  getNewArrivals, // NEW: New Arrivals - Latest 100 products
  // Variant routes
  addProductVariant,
  updateProductVariant,
  deleteProductVariant,
  // getProductsWithVariants,
  updateVariantStock,
  getVariantWarehouseStock,
  updateVariantWarehouseStock,
  addProductVariantWithStock,
  // Availability routes
  checkProductAvailability,
  checkCartAvailability,
  autoTransferInventory,
  monitorAndAutoTransfer,
} from "../controller/productController.js";
import { authenticateToken } from "../middleware/authenticate.js";
import { getProductBulkSettings } from "../controller/bulkProductController.js";
import { getProductVisibilityMatrix } from "../controller/productWarehouseController.js";

const router = express.Router();

router.get("/allproducts", getAllProducts);
router.get("/categories", getAllCategories);
router.get("/featured", getFeaturedProducts);
router.get("/filter", getProductsWithFilters);
router.get("/everyday-essentials", getEverydayEssentials);
router.get("/top-products", getTopProducts);
router.get("/quick-picks", getQuickPicks);
router.get("/super-saver", getSuperSaver); // NEW: BBM Super Saver
router.get("/new-arrivals", getNewArrivals); // NEW: New Arrivals
router.get("/delivery-zone", getProductsByDeliveryZone);

// Batch lookup for product data used by cart/order UIs
router.post("/cart-data", getProductsCartData);

// Related products for cart drawer (based on cart items' categories)
router.post("/related", getRelatedProducts);

// Discount-based routes (must come before generic routes)
router.get("/category/:categoryId/discount", getProductsByCategoryWithDiscount);
router.get(
  "/subcategory/:subcategoryId/discount",
  getProductsBySubcategoryWithDiscount
);

router.get("/category/:category", getProductsByCategory);
router.get("/subcategory/:subcategoryId", getProductsBySubcategory);
router.get("/group/:groupId", getProductsByGroup);
router.get("/brand/:brandId", getProductsByBrand);
router.get("/:productId/visibility", getProductVisibilityMatrix);
router.get("/:productId/bulk-settings", getProductBulkSettings);

// Delivery-related routes
router.post("/check-delivery", checkProductsDelivery);
router.put("/:id/delivery", updateProductDelivery);

// Related products by product ID (must come before /:id route)
router.get("/related/:productId", getRelatedProductsBySubcategory);

router.get("/:id", getProductById);

// ========== PRODUCT VARIANTS ROUTES ==========
// router.get("/variants/all", getProductsWithVariants);
router.get("/:productId/variants", getProductVariants);

// Protected variant routes
router.post("/:productId/variants", authenticateToken, addProductVariant);
router.post("/:productId/variants-with-stock", authenticateToken, addProductVariantWithStock);
router.put("/variants/:variantId", authenticateToken, updateProductVariant);
router.put("/variants/:variantId/stock", authenticateToken, updateVariantStock);
router.delete("/variants/:variantId", authenticateToken, deleteProductVariant);

// Warehouse stock routes
router.get("/variants/:variantId/warehouse-stock", getVariantWarehouseStock);
router.put("/variants/:variantId/warehouse-stock/:warehouseId", authenticateToken, updateVariantWarehouseStock);

// ========== PRODUCT AVAILABILITY ROUTES ==========
// Check single product availability for a pincode
router.get("/availability/check", checkProductAvailability);

// Check cart availability for a pincode
router.post("/availability/check-cart", checkCartAvailability);

// Manual inventory transfer from zonal to division warehouse
router.post("/availability/transfer", authenticateToken, autoTransferInventory);

// Monitor and auto-transfer low stock items (can be called by cron job)
router.post("/availability/monitor-transfer", authenticateToken, monitorAndAutoTransfer);

export default router;
