import jwt from "jsonwebtoken";
import { supabase } from "../config/supabaseClient.js";

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

    // Verify Supabase JWT token
    const { data: user, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      console.log("Token verification failed:", error?.message || "User not found");
      return res.status(401).json({ 
        error: "Invalid or expired token",
        details: error?.message 
      });
    }

    console.log("Token auth successful for user:", user.user.email);
    req.user = user.user;
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

    // Verify Supabase JWT token
    const { data: user, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: "Invalid token" });
    }
console.log(user.user.user_metadata)
    // Check if user has admin role in user_metadata
    // if (user.user.user_metadata?.role !== "superadmin") {
    //   return res.status(403).json({ error: "Admin access required" });
    // }

    req.user = user.user;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Authentication failed" });
  }
};

export { authenticate };
export default authenticate;
