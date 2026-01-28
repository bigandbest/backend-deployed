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
  addSubcategory,
  updateSubcategory,
  deleteSubcategory,
  addGroup,
  updateGroup,
  deleteGroup,
} from "../controller/categoryController.js";
import { cacheMiddleware } from "../utils/cache.js";
import { invalidateCacheMiddleware } from "../utils/cacheInvalidation.js";

const router = express.Router();
const upload = multer();

// Category routes (cache for 30 minutes - categories rarely change)
router.get("/", cacheMiddleware(1800), getAllCategories);
router.post("/", invalidateCacheMiddleware('categories'), upload.single("image_url"), addCategory);
router.put("/:id", invalidateCacheMiddleware('categories'), upload.single("image_url"), updateCategory);
router.delete("/:id", invalidateCacheMiddleware('categories'), deleteCategory);

// Subcategories routes (cache for 30 minutes)
router.get("/subcategories", cacheMiddleware(1800), getAllSubcategories);
router.get("/subcategories/category/:categoryId", cacheMiddleware(1800), getSubcategoriesByCategory);
router.post("/subcategories", invalidateCacheMiddleware('categories'), upload.single("image_url"), addSubcategory);
router.put("/subcategories/:id", invalidateCacheMiddleware('categories'), upload.single("image_url"), updateSubcategory);
router.delete("/subcategories/:id", invalidateCacheMiddleware('categories'), deleteSubcategory);

// Groups routes (cache for 30 minutes)
router.get("/groups", cacheMiddleware(1800), getAllGroups);
router.get("/groups/subcategory/:subcategoryId", cacheMiddleware(1800), getGroupsBySubcategory);
router.post("/groups", upload.single("image_url"), addGroup);
router.put("/groups/:id", upload.single("image_url"), updateGroup);
router.delete("/groups/:id", deleteGroup);

// Subcategory details route
router.get("/subcategory/:subcategoryId", getSubcategoryDetails);

// Full hierarchy route
router.get("/hierarchy", getCategoriesHierarchy);

// Section-specific routes
router.get("/section/:sectionKey/subcategories", getSubcategoriesForSection);
router.get("/section/:sectionKey/categories", getCategoriesForSection);

export default router;
