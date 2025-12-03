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
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      console.log("No authorization token found");
      return res.status(401).json({ error: "Access token required" });
    }

    // Verify Supabase JWT token
    const { data: user, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      console.log("Token verification failed:", error?.message);
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    console.log("Token auth successful for user:", user.user.email);
    req.user = user.user;
    next();
  } catch (error) {
    console.log("Token authentication error:", error.message);
    return res.status(401).json({ error: "Authentication failed" });
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

    // Check if user has admin role in user_metadata
    if (user.user.user_metadata?.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    req.user = user.user;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Authentication failed" });
  }
};

export { authenticate };
export default authenticate;
