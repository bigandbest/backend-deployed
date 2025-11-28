import express from "express";
import {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  checkWishlist,
  clearWishlist,
} from "../controller/wishlistController.js";

const router = express.Router();

// Get user's wishlist (requires authentication)
router.get("/", getWishlist);

// Add item to wishlist (requires authentication)
router.post("/", addToWishlist);

// Check if product is in wishlist
router.get("/check/:productId", checkWishlist);

// Remove item from wishlist (requires authentication)
router.delete("/:productId", removeFromWishlist);

// Clear entire wishlist (requires authentication)
router.delete("/", clearWishlist);

export default router;
