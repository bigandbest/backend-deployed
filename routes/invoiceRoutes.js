// routes/invoiceRoutes.js
import express from "express";
import { authenticateToken } from "../middleware/authenticate.js";
import { requireAdmin } from "../middleware/authorize.js";
import { getInvoice, getBatchInvoice } from "../controller/invoiceController.js";

const router = express.Router();

// User or admin: download single invoice
router.get("/:id/invoice", authenticateToken, getInvoice);

// Admin only: batch download as ZIP
router.post("/batch/invoice", authenticateToken, requireAdmin, getBatchInvoice);

export default router;
