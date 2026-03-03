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
  deleteCategory,
  getAllCategories,
  getAllCategoriesWithSubs,
  addSubcategory,
  updateSubcategory,
  deleteSubcategory,
  addGroup,
  updateGroup,
  deleteGroup,
} from "../controller/categoryController.js";

const router = express.Router();
const upload = multer();

// Category routes
router.get("/", getAllCategories);
router.post("/", upload.single("image_url"), addCategory);
router.put("/:id", upload.single("image_url"), updateCategory);
router.delete("/:id", deleteCategory);

// Subcategories routes
router.get("/subcategories", getAllSubcategories);
router.get("/subcategories/category/:categoryId", getSubcategoriesByCategory);
router.post("/subcategories", upload.single("image_url"), addSubcategory);
router.put("/subcategories/:id", upload.single("image_url"), updateSubcategory);
router.delete("/subcategories/:id", deleteSubcategory);

// Groups routes
router.get("/groups", getAllGroups);
router.get("/groups/subcategory/:subcategoryId", getGroupsBySubcategory);
router.post("/groups", upload.single("image_url"), addGroup);
router.put("/groups/:id", upload.single("image_url"), updateGroup);
router.delete("/groups/:id", deleteGroup);

// Subcategory details route
router.get("/subcategory/:subcategoryId", getSubcategoryDetails);

// Full hierarchy route
router.get("/hierarchy", getCategoriesHierarchy);

// All categories with subcategories (no filtering) - for sidebar
router.get("/all-with-subcategories", getAllCategoriesWithSubs);

// Section-specific routes
router.get("/section/:sectionKey/subcategories", getSubcategoriesForSection);
router.get("/section/:sectionKey/categories", getCategoriesForSection);

export default router;
