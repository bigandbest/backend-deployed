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

const router = express.Router();

// --- Product Enquiry Routes ---

// User routes
router.post("/", createEnquiry);
router.get("/my", getUserEnquiries);

// Admin routes
router.get("/admin/all", getAllEnquiries);

// Legacy route
router.get("/count", getEnquiriesCount);

// Parameterized routes
router.get("/:id", getEnquiryDetails);
router.post("/:id/accept-bid", acceptBid);
router.put("/:id/status", updateEnquiryStatus);
router.post("/:id/close", closeEnquiry);

// --- Enquiry Message Routes ---

router.post("/messages", sendMessage);
router.get("/:enquiry_id/messages", getMessages);
router.put("/:enquiry_id/messages/read", markAsRead);
router.get("/:enquiry_id/messages/unread-count", getUnreadCount);

export default router;