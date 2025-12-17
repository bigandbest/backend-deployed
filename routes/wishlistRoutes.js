import express from "express";
import {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  checkWishlist,
  clearWishlist,
} from "../controller/wishlistController.js";
import { authenticateToken } from "../middleware/authenticate.js";

const router = express.Router();

// Get user's wishlist (requires authentication)
router.get("/", authenticateToken, getWishlist);

// Add item to wishlist (requires authentication)
router.post("/", authenticateToken, addToWishlist);

// Check if product is in wishlist (optional authentication)
router.get("/check/:productId", checkWishlist);

// Remove item from wishlist (requires authentication)
router.delete("/:productId", authenticateToken, removeFromWishlist);

// Clear entire wishlist (requires authentication)
router.delete("/", authenticateToken, clearWishlist);

export default router;
