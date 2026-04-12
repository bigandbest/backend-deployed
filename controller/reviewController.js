import reviewDao from "../dao/review.dao.js";
import { redisDel } from "../lib/redis.js";
import { reviewsKey, productKey } from "../lib/cacheKeys.js";

// Get all reviews for a product
export const getProductReviews = async (req, res) => {
  try {
    const { productId } = req.params;
    const { limit = 50, offset = 0, sortBy = 'created_at', order = 'desc' } = req.query;

    const page = Math.floor(offset / limit) + 1;

    // Get reviews and total count
    const { reviews, total } = await reviewDao.getReviewsByProductId(productId, {
      page,
      limit: parseInt(limit),
      sortBy,
      order
    });

    // Get stats
    const stats = await reviewDao.getReviewStats(productId);

    res.status(200).json({
      success: true,
      reviews,
      totalReviews: total,
      averageRating: stats.averageRating,
      ratingDistribution: stats.breakdown,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: total,
      }
    });
  } catch (error) {
    console.error("Error in getProductReviews:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Add a new review
export const addReview = async (req, res) => {
  try {
    const { productId } = req.params;
    const { rating, comment, user_name, user_email } = req.body;
    const userId = req.user?.id; // From auth middleware

    // Validation
    if (!rating || !comment || !user_name) {
      return res.status(400).json({
        success: false,
        error: "Rating, comment, and user name are required",
      });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        error: "Rating must be between 1 and 5",
      });
    }

    // Check if user already reviewed this product
    if (userId) {
      const existingReview = await reviewDao.checkExistingReview(productId, userId);
      if (existingReview) {
        return res.status(400).json({
          success: false,
          error: "You have already reviewed this product. Please update your existing review.",
        });
      }
    }

    // Insert review
    const review = await reviewDao.createReview({
      product_id: productId,
      user_id: userId || null,
      user_name,
      user_email: user_email || null,
      rating: parseInt(rating),
      comment,
      is_verified_purchase: false, // Can be updated later based on order history
    });

    // Bust cached review list and product (rating average is embedded there)
    await Promise.all([
      redisDel(reviewsKey(productId)),
      redisDel(productKey(productId)),
    ]);

    res.status(201).json({
      success: true,
      message: "Review added successfully",
      review,
    });
  } catch (error) {
    console.error("Error in addReview:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Update a review
export const updateReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { rating, comment } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    // Validation
    if (rating && (rating < 1 || rating > 5)) {
      return res.status(400).json({
        success: false,
        error: "Rating must be between 1 and 5",
      });
    }

    // Verify ownership
    const existingReview = await reviewDao.getReviewById(parseInt(reviewId));
    if (!existingReview) {
      return res.status(404).json({
        success: false,
        error: "Review not found",
      });
    }

    // Check ownership by ID (UUID check)
    // Assuming review.user_id is the same UUID format as userId
    if (existingReview.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: "You don't have permission to update this review",
      });
    }

    const updateData = {};
    if (rating) updateData.rating = parseInt(rating);
    if (comment) updateData.comment = comment;

    const updatedReview = await reviewDao.updateReview(parseInt(reviewId), updateData);

    res.status(200).json({
      success: true,
      message: "Review updated successfully",
      review: updatedReview,
    });
  } catch (error) {
    console.error("Error in updateReview:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Delete a review
export const deleteReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    // Verify ownership
    const existingReview = await reviewDao.getReviewById(parseInt(reviewId));

    if (!existingReview) {
      return res.status(404).json({
        success: false,
        error: "Review not found",
      });
    }

    if (existingReview.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: "You don't have permission to delete this review",
      });
    }

    await reviewDao.deleteReview(parseInt(reviewId));

    res.status(200).json({
      success: true,
      message: "Review deleted successfully",
    });
  } catch (error) {
    console.error("Error in deleteReview:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Mark review as helpful
export const markReviewHelpful = async (req, res) => {
  try {
    const { reviewId } = req.params;

    const existingReview = await reviewDao.getReviewById(parseInt(reviewId));

    if (!existingReview) {
      return res.status(404).json({
        success: false,
        error: "Review not found",
      });
    }

    await reviewDao.markHelpful(parseInt(reviewId));

    res.status(200).json({
      success: true,
      message: "Review marked as helpful",
    });
  } catch (error) {
    console.error("Error in markReviewHelpful:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};
