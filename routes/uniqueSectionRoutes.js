// uniqueSectionRoutes.js
import express from "express";
import multer from "multer";

import {
  addUniqueSection,
  editUniqueSection,
  deleteUniqueSection,
  getAllUniqueSections,
  getSingleUniqueSection,
  getUniqueSectionsByType,
  mapProductToUniqueSection,
  removeProductFromUniqueSection,
  getUniqueSectionsForProduct,
  getProductsForUniqueSection,
  bulkMapUniqueSectionByNames
} from '../controller/uniqueSectionController.js';

const router = express.Router();
// Configure multer to store files in memory for processing
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// === Unique Section Routes ===
router.get("/list", getAllUniqueSections);
router.get("/:id", getSingleUniqueSection);
router.post("/", upload.single("image_url"), addUniqueSection);
router.put("/:id", upload.single("image_url"), editUniqueSection);
router.delete("/:id", deleteUniqueSection);
router.get("/type/:section_type", getUniqueSectionsByType);

// === Unique Section Product Mapping Routes (Merged) ===
router.post('/map', mapProductToUniqueSection);
router.delete('/remove', removeProductFromUniqueSection);
router.get('/product/:product_id', getUniqueSectionsForProduct);
router.get('/section/:unique_section_id', getProductsForUniqueSection);
router.post('/bulk-map-by-names', bulkMapUniqueSectionByNames);

export default router;