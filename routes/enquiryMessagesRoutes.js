// routes/enquiryMessagesRoutes.js
import express from "express";
import {
  sendMessage,
  getMessages,
  markMessagesAsRead,
  getUnreadCount,
} from "../controller/enquiryMessagesController.js";

const router = express.Router();

// Message routes
router.post("/", sendMessage); // Send a message
router.get("/:enquiry_id", getMessages); // Get messages for an enquiry
router.put("/read", markMessagesAsRead); // Mark messages as read
router.get("/:enquiry_id/unread-count", getUnreadCount); // Get unread count

export default router;
