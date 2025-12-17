// routes/enquiryMessagesRoutes.js
import express from "express";
import {
  sendMessage,
  getMessages,
  markAsRead,
  getUnreadCount,
} from "../controller/enquiryMessagesController.js";

const router = express.Router();

// Message routes
router.post("/", sendMessage); // Send a message
router.get("/:enquiry_id", getMessages); // Get all messages for an enquiry
router.put("/:enquiry_id/read", markAsRead); // Mark messages as read
router.get("/:enquiry_id/unread-count", getUnreadCount); // Get unread message count

export default router;
