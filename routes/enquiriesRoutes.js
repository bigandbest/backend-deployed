import express from "express";
import {
  createEnquiry,
  getUserEnquiries,
  getEnquiryDetails,
  acceptBid,
  getAllEnquiries,
  updateEnquiryStatus,
  closeEnquiry,
  getEnquiriesCount,
  sendMessage,
  getMessages,
  markAsRead,
  getUnreadCount
} from "../controller/enquiryController.js";
import { authenticateToken } from "../middleware/authenticate.js";
import { requireAdmin } from "../middleware/authorize.js";

const router = express.Router();

// Admin-only endpoints (customer flows still identify themselves via request params)
const adminOnly = [authenticateToken, requireAdmin];

// --- Product Enquiry Routes ---

// User routes
router.post("/", createEnquiry);
router.get("/my", getUserEnquiries);

// Admin routes
router.get("/admin/all", ...adminOnly, getAllEnquiries);

// Legacy route
router.get("/count", getEnquiriesCount);

// Parameterized routes
router.get("/:id", getEnquiryDetails);
router.post("/:id/accept-bid", acceptBid);
router.put("/:id/status", ...adminOnly, updateEnquiryStatus);
router.post("/:id/close", closeEnquiry);

// --- Enquiry Message Routes ---

router.post("/messages", sendMessage);
router.get("/:enquiry_id/messages", getMessages);
router.put("/:enquiry_id/messages/read", markAsRead);
router.get("/:enquiry_id/messages/unread-count", getUnreadCount);

export default router;