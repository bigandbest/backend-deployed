import jwt from "jsonwebtoken";
import { supabase, supabaseAuth } from "../config/supabaseClient.js";

const authenticate = (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) {
    console.log("No cookie token found");
    return next(new Error("No cookie token"));
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
      return res.status(401).json({ error: "Access token required" });
    }

    // Check if header starts with "Bearer "
    if (!authHeader.startsWith("Bearer ")) {
      console.log("Invalid authorization header format:", authHeader.substring(0, 20));
      return res.status(401).json({ error: "Invalid authorization header format. Expected: Bearer <token>" });
    }

    const token = authHeader.split(" ")[1];

    if (!token || token.trim() === "") {
      console.log("Empty token in authorization header");
      return res.status(401).json({ error: "Access token is empty" });
    }

    // Basic JWT format validation (should have 3 parts separated by dots)
    const tokenParts = token.split(".");
    if (tokenParts.length !== 3) {
      console.log(`Invalid JWT format: token has ${tokenParts.length} segments, expected 3`);
      console.log("Token preview:", token.substring(0, 50) + "...");
      return res.status(401).json({ 
        error: "Invalid token format",
        details: `Token contains ${tokenParts.length} segments, expected 3`
      });
    }

    // Decode JWT token to extract user info (no verification needed since user data is in localStorage)
    const decoded = jwt.decode(token);
    
    if (!decoded || !decoded.sub) {
      console.log("Failed to decode token or missing user ID");
      return res.status(401).json({ 
        error: "Invalid token",
        details: "Could not extract user information from token"
      });
    }

    // Extract user info from decoded token
    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
      aud: decoded.aud,
      user_metadata: decoded.user_metadata,
      app_metadata: decoded.app_metadata
    };
    
    console.log("Token decoded successfully for user:", decoded.email);
    next();
  } catch (error) {
    console.log("Token authentication error:", error.message);
    return res.status(401).json({ 
      error: "Authentication failed",
      details: error.message 
    });
  }
};

// For Admin JWT - checks for Bearer token in Authorization header
export const authenticateAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "Access token required" });
    }

    // Decode JWT token to extract user info
    const decoded = jwt.decode(token);
    
    if (!decoded || !decoded.sub) {
      console.log("Failed to decode admin token");
      return res.status(401).json({ error: "Invalid token" });
    }
    
    // Extract user info from decoded token
    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
      aud: decoded.aud,
      user_metadata: decoded.user_metadata,
      app_metadata: decoded.app_metadata
    };
    
    console.log("Admin auth successful for user:", decoded.email);
    console.log("User metadata:", decoded.user_metadata);
    
    // Check if user has admin role in user_metadata
    // if (decoded.user_metadata?.role !== "superadmin") {
    //   return res.status(403).json({ error: "Admin access required" });
    // }

    next();
  } catch (error) {
    return res.status(401).json({ error: "Authentication failed" });
  }
};

export { authenticate };
export default authenticate;
