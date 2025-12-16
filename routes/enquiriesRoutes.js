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
router.get("/:id", getEnquiryDetails); // Get enquiry details
router.post("/:id/accept-bid", acceptBid); // Accept a bid

// Admin routes
router.get("/admin/all", getAllEnquiries); // Get all enquiries (admin)
router.put("/:id/status", updateEnquiryStatus); // Update enquiry status
router.post("/:id/close", closeEnquiry); // Close enquiry

// Legacy route (keep for backward compatibility)
router.get("/count", getEnquiriesCount);

export default router;