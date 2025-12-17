import { supabase } from "../config/supabaseClient.js";

// Note: Authentication is handled by authenticateToken middleware
// req.user is populated by the middleware before reaching these controllers

// Get user's wishlist
export const getWishlist = async (req, res) => {
  try {
    // User is already authenticated by middleware
    const userId = req.user.id;

    const { data: wishlistItems, error } = await supabase
      .from("wishlist_items")
      .select(`
        *,
        products (
          id,
          name,
          price,
          old_price,
          image,
          rating,
          review_count,
          stock,
          category
        )
      `)
      .eq("user_id", userId);

    if (error) {
      console.error("Error fetching wishlist:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to fetch wishlist",
      });
    }

    res.status(200).json({
      success: true,
      wishlist: wishlistItems,
      count: wishlistItems.length,
    });
  } catch (error) {
    console.error("Error in getWishlist:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Add item to wishlist
export const addToWishlist = async (req, res) => {
  try {
    const userId = req.user.id;
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({
        success: false,
        error: "Product ID is required",
      });
    }

    // Check if already in wishlist
    const { data: existing } = await supabase
      .from("wishlist_items")
      .select("id")
      .eq("user_id", userId)
      .eq("product_id", productId)
      .single();

    if (existing) {
      return res.status(400).json({
        success: false,
        error: "Product already in wishlist",
      });
    }

    // Add to wishlist
    const { data: wishlistItem, error } = await supabase
      .from("wishlist_items")
      .insert({
        user_id: userId,
        product_id: productId,
      })
      .select()
      .single();

    if (error) {
      console.error("Error adding to wishlist:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to add to wishlist",
      });
    }

    res.status(201).json({
      success: true,
      message: "Product added to wishlist",
      wishlistItem,
    });
  } catch (error) {
    console.error("Error in addToWishlist:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Remove item from wishlist
export const removeFromWishlist = async (req, res) => {
  try {
    const userId = req.user.id;
    const { productId } = req.params;

    const { error } = await supabase
      .from("wishlist_items")
      .delete()
      .eq("user_id", userId)
      .eq("product_id", productId);

    if (error) {
      console.error("Error removing from wishlist:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to remove from wishlist",
      });
    }

    res.status(200).json({
      success: true,
      message: "Product removed from wishlist",
    });
  } catch (error) {
    console.error("Error in removeFromWishlist:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Check if product is in wishlist
export const checkWishlist = async (req, res) => {
  try {
    const { productId } = req.params;

    // If user is not authenticated, return false (optional auth)
    if (!req.user || !req.user.id) {
      return res.status(200).json({
        success: true,
        inWishlist: false,
      });
    }

    const { data: wishlistItem } = await supabase
      .from("wishlist_items")
      .select("id")
      .eq("user_id", req.user.id)
      .eq("product_id", productId)
      .single();

    res.status(200).json({
      success: true,
      inWishlist: !!wishlistItem,
    });
  } catch (error) {
    console.error("Error in checkWishlist:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Clear entire wishlist
export const clearWishlist = async (req, res) => {
  try {
    const userId = req.user.id;

    const { error } = await supabase
      .from("wishlist_items")
      .delete()
      .eq("user_id", userId);

    if (error) {
      console.error("Error clearing wishlist:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to clear wishlist",
      });
    }

    res.status(200).json({
      success: true,
      message: "Wishlist cleared successfully",
    });
  } catch (error) {
    console.error("Error in clearWishlist:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};
