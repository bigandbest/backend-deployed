import express from "express";
import { getAllProductsForAdmin } from "../controller/adminProductController.js";

const router = express.Router();

// GET /api/admin/products - Get all products for admin with full details
router.get("/products", getAllProductsForAdmin);

export default router;