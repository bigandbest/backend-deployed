import express from "express";
import {
    addSubcategoriesToSection,
    removeSubcategoryFromSection,
    updateSubcategoryMappings,
    getSubcategoryMappingsForSection,
    updateMappingDisplayOrder,
    toggleMappingStatus,
    getSectionsForSubcategory,
    getCategoriesForSection,
} from "../controller/sectionMappingController.js";

const router = express.Router();

// Subcategory-Section mapping routes
router.post("/:sectionId/subcategories", addSubcategoriesToSection);
router.delete("/:sectionId/subcategories/:subcategoryId", removeSubcategoryFromSection);
router.put("/:sectionId/subcategories", updateSubcategoryMappings);
router.get("/:sectionId/subcategories", getSubcategoryMappingsForSection);
router.patch("/:sectionId/subcategories/order", updateMappingDisplayOrder);
router.patch("/:sectionId/subcategories/:subcategoryId/toggle", toggleMappingStatus);

// Get sections for a subcategory
router.get("/subcategory/:subcategoryId/sections", getSectionsForSubcategory);

// Get categories for a section (by ID or key)
router.get("/:sectionId/categories", getCategoriesForSection);

export default router;
