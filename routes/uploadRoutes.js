import express from "express";
import {
  uploadImage,
  uploadMiddleware,
} from "../controller/uploadController.js";
import { supabase } from "../config/supabaseClient.js";

const router = express.Router();

// Upload image endpoint - simplified auth for debugging
router.post(
  "/image",
  async (req, res, next) => {
    try {
      console.log("=== IMAGE UPLOAD REQUEST ===");
      console.log("Headers:", JSON.stringify(req.headers, null, 2));
      console.log("Cookies:", req.cookies);

      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.split(" ")[1];

      console.log("Auth header:", authHeader);
      console.log("Extracted token:", token ? "Present" : "Missing");

      if (!token) {
        console.log("❌ No token provided");
        return res.status(401).json({
          success: false,
          error: "No authorization token provided",
        });
      }

      // Verify token with Supabase
      const { data: user, error } = await supabase.auth.getUser(token);

      if (error || !user) {
        console.log("❌ Token verification failed:", error?.message);
        return res.status(401).json({
          success: false,
          error: "Invalid or expired token",
        });
      }

      console.log("✅ Authentication successful for:", user.user.email);
      req.user = user.user;
      next();
    } catch (error) {
      console.log("❌ Auth error:", error.message);
      return res.status(401).json({
        success: false,
        error: "Authentication failed",
      });
    }
  },
  uploadMiddleware,
  uploadImage
);

export default router;
