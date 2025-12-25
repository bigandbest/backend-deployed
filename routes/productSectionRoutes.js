import express from "express";
import {
  getAllProductSections,
  getActiveProductSections,
  getProductSectionById,
  updateProductSection,
  toggleSectionStatus,
  updateSectionOrder,
  addProductsToSection,
  removeProductFromSection,
  getProductsInSection,
  updateProductOrderInSection,
  getSectionsForProduct,
  addCategoriesToSection,
  removeCategoryFromSection,
  getCategoriesInSection,
  getSectionsForCategory,
} from "../controller/productSectionController.js";

const router = express.Router();

// Get all product sections
router.get("/", getAllProductSections);

// Get active product sections only
router.get("/active", getActiveProductSections);

// Get single product section by ID
router.get("/:id", getProductSectionById);

// Update product section
router.put("/:id", updateProductSection);

// Toggle section active status
router.patch("/:id/toggle", toggleSectionStatus);

// Update section display order
router.patch("/order", updateSectionOrder);

// ========== PRODUCT-SECTION ASSIGNMENT ROUTES ==========

// Add products to a section
router.post("/:id/products", addProductsToSection);

// Get all products in a section
router.get("/:id/products", getProductsInSection);

// Remove a product from a section
router.delete("/:id/products/:productId", removeProductFromSection);

// Update product order within a section
router.put("/:id/products/order", updateProductOrderInSection);

// Get sections for a specific product
router.get("/products/:productId/sections", getSectionsForProduct);

// ========== CATEGORY-SECTION MAPPING ROUTES ==========

// Add categories to a section
router.post("/:id/categories", addCategoriesToSection);

// Get all categories mapped to a section
router.get("/:id/categories", getCategoriesInSection);

// Remove a category from a section
router.delete("/:id/categories/:categoryId", removeCategoryFromSection);

// Get sections for a specific category
router.get("/categories/:categoryId/sections", getSectionsForCategory);

export default router;
