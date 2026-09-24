// routes/bidRoutes.js
import express from "express";
import {
  createBid,
  lockBid,
  getBidDetails,
  validateBid,
  cancelLockedBid,
  rejectBid,
  updateBid,
} from "../controller/bidController.js";

import { authenticateToken } from "../middleware/authenticate.js";
import { requireAdmin } from "../middleware/authorize.js";
const router = express.Router();

// Creating/editing a bid is an admin action; customers only lock/reject/validate/cancel
const adminOnly = [authenticateToken, requireAdmin];

// Admin routes
router.post("/", ...adminOnly, createBid); // Create a bid offer
router.put("/:id", ...adminOnly, updateBid); // Update a bid (before locking)
router.post("/:id/lock", lockBid); // Lock a bid (finalize)
router.post("/:id/reject", rejectBid); // Reject a bid
router.get("/:id", getBidDetails); // Get bid details

// Validation routes
router.get("/:id/validate", validateBid); // Validate bid before checkout
router.post("/:id/cancel", cancelLockedBid); // Cancel a locked bid

export default router;
