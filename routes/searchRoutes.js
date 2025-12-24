import express from "express";
import * as searchController from "../controller/searchController.js";

const router = express.Router();

// Unified search across all entities
router.get("/", searchController.unifiedSearch);

// Product-specific search with pagination
router.get("/products", searchController.searchProducts);

export default router;
