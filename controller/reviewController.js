import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Get all reviews for a product
export const getProductReviews = async (req, res) => {
  try {
    const { productId } = req.params;
    const { limit = 50, offset = 0, sortBy = 'created_at', order = 'desc' } = req.query;

    const { data: reviews, error, count } = await supabase
      .from("product_reviews")
      .select("*", { count: 'exact' })
      .eq("product_id", productId)
      .order(sortBy, { ascending: order === 'asc' })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("Error fetching reviews:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to fetch reviews",
      });
    }

    // Calculate average rating
    const avgRating = reviews.length > 0
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
      : 0;

    // Calculate rating distribution
    const ratingDistribution = {
      5: reviews.filter(r => r.rating === 5).length,
      4: reviews.filter(r => r.rating === 4).length,
      3: reviews.filter(r => r.rating === 3).length,
      2: reviews.filter(r => r.rating === 2).length,
      1: reviews.filter(r => r.rating === 1).length,
    };

    res.status(200).json({
      success: true,
      reviews,
      totalReviews: count,
      averageRating: parseFloat(avgRating.toFixed(1)),
      ratingDistribution,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: count,
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
      const { data: existingReview } = await supabase
        .from("product_reviews")
        .select("id")
        .eq("product_id", productId)
        .eq("user_id", userId)
        .single();

      if (existingReview) {
        return res.status(400).json({
          success: false,
          error: "You have already reviewed this product. Please update your existing review.",
        });
      }
    }

    // Insert review
    const { data: review, error } = await supabase
      .from("product_reviews")
      .insert({
        product_id: productId,
        user_id: userId || null,
        user_name,
        user_email: user_email || null,
        rating: parseInt(rating),
        comment,
        is_verified_purchase: false, // Can be updated later based on order history
      })
      .select()
      .single();

    if (error) {
      console.error("Error adding review:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to add review",
      });
    }

    // Update product rating (optional - you can calculate on-the-fly)
    await updateProductRating(productId);

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

    const updateData = {};
    if (rating) updateData.rating = parseInt(rating);
    if (comment) updateData.comment = comment;

    const { data: review, error } = await supabase
      .from("product_reviews")
      .update(updateData)
      .eq("id", reviewId)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      console.error("Error updating review:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to update review",
      });
    }

    if (!review) {
      return res.status(404).json({
        success: false,
        error: "Review not found or you don't have permission to update it",
      });
    }

    // Update product rating
    await updateProductRating(review.product_id);

    res.status(200).json({
      success: true,
      message: "Review updated successfully",
      review,
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

    // Get review to find product_id before deletion
    const { data: review } = await supabase
      .from("product_reviews")
      .select("product_id")
      .eq("id", reviewId)
      .eq("user_id", userId)
      .single();

    if (!review) {
      return res.status(404).json({
        success: false,
        error: "Review not found or you don't have permission to delete it",
      });
    }

    const { error } = await supabase
      .from("product_reviews")
      .delete()
      .eq("id", reviewId)
      .eq("user_id", userId);

    if (error) {
      console.error("Error deleting review:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to delete review",
      });
    }

    // Update product rating
    await updateProductRating(review.product_id);

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

// Helper function to update product rating
async function updateProductRating(productId) {
  try {
    const { data: reviews } = await supabase
      .from("product_reviews")
      .select("rating")
      .eq("product_id", productId);

    if (reviews && reviews.length > 0) {
      const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
      const reviewCount = reviews.length;

      // Update product table
      await supabase
        .from("products")
        .update({
          rating: parseFloat(avgRating.toFixed(1)),
          review_count: reviewCount,
        })
        .eq("id", productId);
    } else {
      // No reviews, reset to default
      await supabase
        .from("products")
        .update({
          rating: 0,
          review_count: 0,
        })
        .eq("id", productId);
    }
  } catch (error) {
    console.error("Error updating product rating:", error);
  }
}

// Mark review as helpful
export const markReviewHelpful = async (req, res) => {
  try {
    const { reviewId } = req.params;

    const { data: review, error } = await supabase
      .from("product_reviews")
      .select("helpful_count")
      .eq("id", reviewId)
      .single();

    if (error || !review) {
      return res.status(404).json({
        success: false,
        error: "Review not found",
      });
    }

    const { error: updateError } = await supabase
      .from("product_reviews")
      .update({ helpful_count: (review.helpful_count || 0) + 1 })
      .eq("id", reviewId);

    if (updateError) {
      return res.status(500).json({
        success: false,
        error: "Failed to update helpful count",
      });
    }

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
