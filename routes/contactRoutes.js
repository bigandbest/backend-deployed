import express from "express";
import { submitQuery, getAllQueries, deleteQuery, updateQueryStatus } from "../controller/contactController.js";

const router = express.Router();

// Public route to submit query
router.post("/", submitQuery);

// Admin routes (should be protected in production, assuming auth middleware will be added if needed or globally applied)
router.get("/", getAllQueries);
router.patch("/:id/status", updateQueryStatus);
router.delete("/:id", deleteQuery);

export default router;
