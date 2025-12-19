import express from "express";
import {
  getAllProductSections,
  createStoreSectionMapping,
  createSectionProductMapping,
  getAllMappings,
  updateMappingStatus,
  deleteMapping,
  deleteMapping,
  getProductsBySection,
  createSectionCategoryMapping,
} from "../controller/storeSectionMappingController.js";

const router = express.Router();

// Product sections routes
router.get("/product-sections/list", getAllProductSections);

// Store-section mapping routes
router.post("/store-sections", createStoreSectionMapping);
router.post("/section-products", createSectionProductMapping);
router.post("/section-category", createSectionCategoryMapping);
router.get("/list", getAllMappings);
router.put("/:id/status", updateMappingStatus);
router.delete("/:id", deleteMapping);

// Frontend route for getting products by section
router.get("/section/:section_key/products", getProductsBySection);

export default router;
