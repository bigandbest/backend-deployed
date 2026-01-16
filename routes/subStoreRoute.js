import express from "express";
import multer from "multer";
import {
    addSubStore,
    updateSubStore,
    deleteSubStore,
    getAllSubStores,
    getAllProductSections,
    createStoreSectionMapping,
    createSectionProductMapping,
    getAllMappings,
    updateMappingStatus,
    deleteMapping,
    getProductsBySection,
    createSectionGroupMapping
} from "../controller/subStoreController.js";

const router = express.Router();
const upload = multer();

// --- SubStore Routes ---
router.post("/add", upload.single("image"), addSubStore);
router.put("/update/:id", upload.single("image"), updateSubStore);
router.delete("/delete/:id", deleteSubStore);
router.get("/fetch", getAllSubStores);

// --- Store Section Mapping Routes (Merged) ---
router.get("/product-sections/list", getAllProductSections);
router.post("/store-sections", createStoreSectionMapping);
router.post("/section-products", createSectionProductMapping);
router.post("/section-group", createSectionGroupMapping);
router.get("/list", getAllMappings);
router.put("/:id/status", updateMappingStatus);
router.delete("/:id", deleteMapping);

// Frontend route for getting products by section
router.get("/section/:section_key/products", getProductsBySection);

export default router;
