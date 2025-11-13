import express from "express";
import { getEnquiriesCount } from "../controller/enquiriesController.js";

const router = express.Router();

// GET /api/enquiries/count
router.get("/count", getEnquiriesCount);

export default router;