import express from "express";
import multer from "multer";
import {
  getAllSubcategories,
  getSubcategoriesByCategory,
  getAllGroups,
  getGroupsBySubcategory,
  getCategoriesHierarchy,
  getSubcategoryDetails,
  getSubcategoriesForSection,
  getCategoriesForSection,
  addCategory,
  updateCategory,
} from "../controller/categoryController.js";

const router = express.Router();
const upload = multer();

// Subcategories routes
router.get("/subcategories", getAllSubcategories);
router.get("/subcategories/category/:categoryId", getSubcategoriesByCategory);

// Groups routes
router.get("/groups", getAllGroups);
router.get("/groups/subcategory/:subcategoryId", getGroupsBySubcategory);

// Subcategory details route
router.get("/subcategory/:subcategoryId", getSubcategoryDetails);

// Full hierarchy route
router.get("/hierarchy", getCategoriesHierarchy);

// Create new category
router.post("/", upload.single("image_url"), addCategory);

// Update category (for active toggle, etc.)
router.put("/:id", upload.single("image_url"), updateCategory);

// Section-specific routes
router.get("/section/:sectionKey/subcategories", getSubcategoriesForSection);
router.get("/section/:sectionKey/categories", getCategoriesForSection);

export default router;
