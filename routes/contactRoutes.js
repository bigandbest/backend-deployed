import express from "express";
import { authenticateToken } from "../middleware/authenticate.js";
import { requireAdmin } from "../middleware/authorize.js";
import { submitQuery, getAllQueries, deleteQuery, updateQueryStatus } from "../controller/contactController.js";

const router = express.Router();

// Public route to submit query
router.post("/", submitQuery);

// Admin routes: queries contain customer PII, so reads and writes both require an admin token
const adminOnly = [authenticateToken, requireAdmin];
router.get("/", ...adminOnly, getAllQueries);
router.patch("/:id/status", ...adminOnly, updateQueryStatus);
router.delete("/:id", ...adminOnly, deleteQuery);

export default router;
