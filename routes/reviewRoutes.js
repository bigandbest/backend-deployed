import express from "express";
import {
  getProductReviews,
  addReview,
  updateReview,
  deleteReview,
  markReviewHelpful,
} from "../controller/reviewController.js";

const router = express.Router();

// Get all reviews for a product
router.get("/product/:productId", getProductReviews);

// Add a new review (authentication optional, but recommended)
router.post("/product/:productId", addReview);

// Update a review (requires authentication)
router.put("/:reviewId", updateReview);

// Delete a review (requires authentication)
router.delete("/:reviewId", deleteReview);

// Mark review as helpful
router.post("/:reviewId/helpful", markReviewHelpful);

export default router;
