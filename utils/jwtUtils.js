import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
const DEFAULT_EXPIRY = "7d";
const REFRESH_TOKEN_EXPIRY = "30d";


export function generateToken(payload, expiresIn = DEFAULT_EXPIRY) {
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is not defined in environment variables");
  }

  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

/**
 * Verify and decode a JWT token
 * @param {string} token - JWT token to verify
 * @returns {Object} Decoded token payload
 */
export function verifyToken(token) {
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is not defined in environment variables");
  }

  if (!token) {
    throw new Error("Token is required");
  }

  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      throw new Error("Token has expired");
    }
    if (error.name === "JsonWebTokenError") {
      throw new Error("Invalid token");
    }
    throw error;
  }
}

/**
 * Decode a JWT token without verification (for extracting payload)
 * @param {string} token - JWT token to decode
 * @returns {Object|null} Decoded token payload or null if invalid
 */
export function decodeToken(token) {
  if (!token) {
    return null;
  }

  try {
    return jwt.decode(token);
  } catch (error) {
    return null;
  }
}

/**
 * Generate a refresh token with longer expiry
 * @param {Object} payload - Data to encode in the token
 * @returns {string} Refresh token
 */
export function generateRefreshToken(payload) {
  return generateToken(payload, REFRESH_TOKEN_EXPIRY);
}

/**
 * Extract token from Authorization header
 * @param {string} authHeader - Authorization header value
 * @returns {string|null} Extracted token or null
 */
export function extractTokenFromHeader(authHeader) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.split(" ")[1];
}
