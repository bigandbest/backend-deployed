import express from "express";
import {
  createProductSection,
  getAllProductSections,
  getProductSectionById,
  updateProductSection,
  getSectionTypes,
  getSectionAuditLog,
  toggleSectionStatus,
  updateSectionOrder,
  addProductsToSection,
  removeProductFromSection,
  getProductsInSection,
  getSectionCounts,
  updateProductOrderInSection,
  getSectionsForProduct,
  addCategoriesToSection,
  removeCategoryFromSection,
  getCategoriesInSection,
  getSectionsForCategory,
  getProductGridSettings,
  updateProductGridSettings,
  getSectionWithContent,
  syncCategoriesInSection
} from "../controller/productSectionController.js";

import { authenticateToken } from "../middleware/authenticate.js";
import { requireAdmin } from "../middleware/authorize.js";

const router = express.Router();

// All non-GET routes below mutate homepage configuration and are admin-only.
// GET routes stay public: the storefront and mobile app read them.
const adminOnly = [authenticateToken, requireAdmin];

// Section ids are integers; anything else (e.g. the removed "/active" route) is a plain 404, not a DB error.
router.param("id", (req, res, next, id) => {
  if (!/^\d+$/.test(id)) return res.status(404).json({ success: false, error: "Not found" });
  next();
});

// Get all product sections
router.get("/", getAllProductSections);

// Get counts for all sections (must be before :id routes)
router.get("/counts", getSectionCounts);

// Grid settings — must be declared before "/:id" or it is shadowed by it
router.get("/grid-settings", getProductGridSettings);
router.put("/grid-settings", ...adminOnly, updateProductGridSettings);

// Admin metadata for the homepage settings form (declared before "/:id")
router.get("/meta/types", ...adminOnly, getSectionTypes);

// Get single product section by ID
router.get("/:id", getProductSectionById);

// Audit trail for one section (admin only)
router.get("/:id/audit", ...adminOnly, getSectionAuditLog);

// Get lazy-load content for single section
router.get("/:id/content", getSectionWithContent);

// Update product section
router.put("/:id", ...adminOnly, updateProductSection);

// Toggle section active status
router.patch("/:id/toggle", ...adminOnly, toggleSectionStatus);

// Update section display order
router.patch("/order", ...adminOnly, updateSectionOrder);

// ========== PRODUCT-SECTION ASSIGNMENT ROUTES ==========

// Add products to a section
router.post("/:id/products", ...adminOnly, addProductsToSection);

// Get all products in a section
router.get("/:id/products", getProductsInSection);

// Remove a product from a section
router.delete("/:id/products/:productId", ...adminOnly, removeProductFromSection);

// Update product order within a section
router.put("/:id/products/order", ...adminOnly, updateProductOrderInSection);

// Get sections for a specific product
router.get("/products/:productId/sections", getSectionsForProduct);

// ========== CATEGORY-SECTION MAPPING ROUTES ==========

// Sync categories to a section (Replace existing)
router.put("/:id/categories", ...adminOnly, syncCategoriesInSection);

// Add categories to a section
router.post("/:id/categories", ...adminOnly, addCategoriesToSection);

// Get all categories mapped to a section
router.get("/:id/categories", getCategoriesInSection);

// Remove a category from a section
router.delete("/:id/categories/:categoryId", ...adminOnly, removeCategoryFromSection);

// Get sections for a specific category
router.get("/categories/:categoryId/sections", getSectionsForCategory);




export default router;
