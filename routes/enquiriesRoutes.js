import express from "express";
import {
  createEnquiry,
  getUserEnquiries,
  getEnquiryDetails,
  acceptBid,
  getAllEnquiries,
  updateEnquiryStatus,
  closeEnquiry,
} from "../controller/enquiryController.js";
import { getEnquiriesCount } from "../controller/enquiriesController.js";

const router = express.Router();

// User routes
router.post("/", createEnquiry); // Create new enquiry
router.get("/my", getUserEnquiries); // Get user's enquiries

// Admin routes (must come before /:id to avoid matching "admin" as an id)
router.get("/admin/all", getAllEnquiries); // Get all enquiries (admin)

// Legacy route (keep for backward compatibility)
router.get("/count", getEnquiriesCount);

// Parameterized routes (must come after specific routes)
router.get("/:id", getEnquiryDetails); // Get enquiry details
router.post("/:id/accept-bid", acceptBid); // Accept a bid
router.put("/:id/status", updateEnquiryStatus); // Update enquiry status
router.post("/:id/close", closeEnquiry); // Close enquiry

export default router;