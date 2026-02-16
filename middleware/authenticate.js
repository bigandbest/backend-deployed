import jwt from "jsonwebtoken";
import { supabase, supabaseAuth } from "../config/supabaseClient.js";
import {
  verifyToken,
  decodeToken,
  extractTokenFromHeader,
} from "../utils/jwtUtils.js";

const authenticate = (req, res, next) => {
  let token = req.cookies?.token;

  // Check for Bearer token if cookie is missing
  if (!token && req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    console.log("No cookie or Bearer token found");
    return next(new Error("No authentication token found"));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    console.log("Cookie auth successful");
    next();
  } catch (err) {
    console.log("Cookie token verification failed:", err.message);
    next(new Error("Invalid cookie token"));
  }
};

// For Supabase auth - checks for Bearer token in Authorization header
export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      console.log("No authorization header found");
      return res
        .status(401)
        .json({ success: false, error: "Access token required" });
    }

    // Extract token from header
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      console.log("Invalid authorization header format");
      return res.status(401).json({
        success: false,
        error: "Invalid authorization header format. Expected: Bearer <token>",
      });
    }

    // Basic JWT format validation (should have 3 parts separated by dots)
    const tokenParts = token.split(".");
    if (tokenParts.length !== 3) {
      console.log(
        `Invalid JWT format: token has ${tokenParts.length} segments, expected 3`,
      );
      return res.status(401).json({
        success: false,
        error: "Invalid token format",
        details: `Token contains ${tokenParts.length} segments, expected 3`,
      });
    }

    // Decode JWT token to extract user info
    const decoded = decodeToken(token);

    // Debug: Log the decoded token structure
    console.log("Decoded token:", JSON.stringify(decoded, null, 2));

    if (!decoded || !decoded.id) {
      console.log("Failed to decode token or missing user ID");
      console.log("Available fields in token:", decoded ? Object.keys(decoded) : "null");

      // Try alternative field names
      const userId = decoded?.id || decoded?.user_id || decoded?.sub || decoded?.userId;

      if (userId) {
        console.log(`Found user ID in alternative field: ${userId}`);
        req.user = {
          id: userId,
          email: decoded.email,
          role: decoded.role || decoded.user_role,
          name: decoded.name || decoded.user_name || decoded.user_metadata?.name || decoded.user_metadata?.full_name,
          phone: decoded.phone || decoded.user_metadata?.phone,
          user_metadata: decoded.user_metadata || {},
          app_metadata: decoded.app_metadata || {}
        };
        return next();
      }

      return res.status(401).json({
        success: false,
        error: "Invalid token",
        details: "Could not extract user information from token",
      });
    }

    // Extract user info from decoded token
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      name: decoded.name,
    };

    console.log(
      "Token decoded successfully for user:",
      decoded.email,
      "with role:",
      decoded.role,
    );
    next();
  } catch (error) {
    console.log("Token authentication error:", error.message);
    return res.status(401).json({
      success: false,
      error: "Authentication failed",
      details: error.message,
    });
  }
};

// Deprecated: Use authenticateToken + requireAdmin from authorize.js instead
// Kept for backward compatibility
export const authenticateAdmin = async (req, res, next) => {
  console.warn(
    "Warning: authenticateAdmin is deprecated. Use authenticateToken + requireAdmin instead.",
  );

  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res
        .status(401)
        .json({ success: false, error: "Access token required" });
    }

    const decoded = decodeToken(token);

    if (!decoded || !decoded.id) {
      console.log("Failed to decode admin token");
      return res.status(401).json({ success: false, error: "Invalid token" });
    }

    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      name: decoded.name,
    };

    console.log(
      "Admin auth successful for user:",
      decoded.email,
      "Role:",
      decoded.role,
    );

    // Check if user has admin role
    if (decoded.role !== "ADMIN") {
      return res
        .status(403)
        .json({ success: false, error: "Admin access required" });
    }

    next();
  } catch (error) {
    return res
      .status(401)
      .json({ success: false, error: "Authentication failed" });
  }
};

// Optional authentication - sets req.user if token is valid, otherwise proceeds as guest
export const authenticateTokenOptional = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    // If no header or invalid format, proceed as guest
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next();
    }

    const token = extractTokenFromHeader(authHeader);
    if (!token) {
      return next();
    }

    // Decode token
    const decoded = decodeToken(token);

    if (decoded && decoded.id) {
      req.user = {
        id: decoded.id,
        email: decoded.email,
        role: decoded.role,
        name: decoded.name,
      };

      console.log("Optional auth successful for user:", decoded.email);
    }

    next();
  } catch (error) {
    console.log("Optional auth error (proceeding as guest):", error.message);
    next();
  }
};

export { authenticate };
export default authenticate;
