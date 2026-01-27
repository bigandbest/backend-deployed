import jwt from "jsonwebtoken";
import { supabase } from "../config/supabaseClient.js";
import AuthService from "../services/authService.js";

/**
 * Admin login - Uses centralized auth service with role validation
 */
export async function adminLogin(req, res) {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "Email and password are required",
      });
    }

    // Authenticate using centralized auth service
    const result = await AuthService.login(email, password);

    // Check if user has admin role
    if (result.user.role !== "ADMIN") {
      return res.status(403).json({
        success: false,
        error: "Admin access required. You do not have admin privileges.",
      });
    }

    // Add user_metadata for frontend compatibility
    const userWithMetadata = {
      ...result.user,
      user_metadata: {
        role: result.user.role, // Expose role in user_metadata for frontend
      },
    };

    res.json({
      success: true,
      message: "Admin logged in successfully",
      user: userWithMetadata,
      session: {
        access_token: result.token,
      },
      token: result.token, // Keep for backward compatibility
      refreshToken: result.refreshToken,
    });
  } catch (error) {
    console.error("Admin login error:", error);
    res.status(401).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Admin logout
 */
export async function adminLogout(req, res) {
  try {
    res.json({
      success: true,
      message: "Admin logged out successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Get current admin user info
 */
export async function getAdminMe(req, res) {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        error: "Not authenticated",
      });
    }

    // Verify user has admin role
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({
        success: false,
        error: "Admin access required",
      });
    }

    const user = await AuthService.getUserById(req.user.id);

    // Add user_metadata for frontend compatibility
    const userWithMetadata = {
      ...user,
      user_metadata: {
        role: user.role,
      },
    };

    res.json({
      success: true,
      user: userWithMetadata,
    });
  } catch (error) {
    console.error("GetAdminMe error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
