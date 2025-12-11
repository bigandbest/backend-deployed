import express from "express";
import {
  uploadProfileImage,
  deleteProfileImage,
  getUserProfile,
  updateUserProfile,
  updateUserProfile,
  uploadMiddleware,
} from "../controller/profileController.js";
import { authenticateToken } from "../middleware/authenticate.js";

const router = express.Router();

// Get user profile
router.get("/profile", authenticateToken, getUserProfile);

// Update user profile
router.put("/profile/update", authenticateToken, updateUserProfile);

// Upload profile image
router.post(
  "/profile/upload-image",
  authenticateToken,
  uploadMiddleware,
  uploadProfileImage
);

// Delete profile image
router.delete("/profile/delete-image", authenticateToken, deleteProfileImage);

export default router;
