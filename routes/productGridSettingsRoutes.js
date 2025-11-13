import express from "express";
import {
  getProductGridSettings,
  updateProductGridSettings,
} from "../controller/productGridSettingsController.js";

const router = express.Router();

// GET /api/product-grid-settings
router.get("/", getProductGridSettings);

// PUT /api/product-grid-settings
router.put("/", updateProductGridSettings);

export default router;