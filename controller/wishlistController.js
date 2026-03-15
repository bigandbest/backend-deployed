import WishlistDAO from "../dao/wishlist.dao.js";
// import { supabase } from "../config/supabaseClient.js"; // REMOVE OR COMMENT OUT

// Note: Authentication is handled by authenticateToken middleware
// req.user is populated by the middleware before reaching these controllers

// Get user's wishlist
export const getWishlist = async (req, res) => {
  try {
    const userId = req.user.id;
    const wishlistItems = await WishlistDAO.listByUser(userId);

    const transformedWishlist = wishlistItems.map((item) => {
      const product = item.products;
      if (!product) return item;

      const defaultVariant = product.variants?.[0];
      const image = product.media?.[0]?.url || null;
      const price = defaultVariant?.price ?? product.price ?? null;
      const old_price = defaultVariant?.old_price ?? product.old_price ?? null;
      const availableStock = (defaultVariant?.inventory || []).reduce(
        (sum, inv) => sum + Math.max(0, (inv.stock_qty || 0) - (inv.reserved_qty || 0)),
        0
      );
      const in_stock = availableStock > 0;

      return {
        id: item.id,
        product_id: item.product_id,
        added_at: item.added_at,
        product: {
          id: product.id,
          name: product.name,
          description: product.description,
          image,
          price,
          old_price,
          rating: product.rating,
          review_count: product.review_count,
          in_stock,
          available_stock: availableStock,
        },
      };
    });

    res.status(200).json({
      success: true,
      wishlist: transformedWishlist,
      count: transformedWishlist.length,
    });
  } catch (error) {
    console.error("Error in getWishlist:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Add item to wishlist
export const addToWishlist = async (req, res) => {
  try {
    const userId = req.user.id;
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({ success: false, error: "Product ID is required" });
    }

    const exists = await WishlistDAO.check(userId, productId);
    if (exists) {
      return res.status(400).json({ success: false, error: "Product already in wishlist" });
    }

    const wishlistItem = await WishlistDAO.add(userId, productId);

    res.status(201).json({
      success: true,
      message: "Product added to wishlist",
      wishlistItem,
    });
  } catch (error) {
    console.error("Error in addToWishlist:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Remove item from wishlist
export const removeFromWishlist = async (req, res) => {
  try {
    const userId = req.user.id;
    const { productId } = req.params;

    await WishlistDAO.remove(userId, productId);

    res.status(200).json({ success: true, message: "Product removed from wishlist" });
  } catch (error) {
    console.error("Error in removeFromWishlist:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Check if product is in wishlist
export const checkWishlist = async (req, res) => {
  try {
    const { productId } = req.params;
    if (!req.user || !req.user.id) {
      return res.status(200).json({ success: true, inWishlist: false });
    }

    const exists = await WishlistDAO.check(req.user.id, productId);

    res.status(200).json({ success: true, inWishlist: exists });
  } catch (error) {
    console.error("Error in checkWishlist:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Clear entire wishlist
export const clearWishlist = async (req, res) => {
  try {
    // Only remove for this user, obviously.
    // WishlistDAO currently doesn't have clearAllByUser.
    // I can add it or just loop remove? Loop is bad.
    // Using prisma.wishlist_items.deleteMany({ where: { user_id } }) is better.
    // I'll assume DAO method is added or I add it now.
    // Let's assume I will add `clear(userId)` to DAO.
    const userId = req.user.id;
    // await WishlistDAO.clear(userId); 
    // Wait, let's just use simple DAO pattern.
    // I'll stick to what I have or improve DAO.
    // For now, I will NOT modify DAO here but I should have. 
    // I previously checked DAO and it lacked `clear`.
    // I will use direct prisma import if necessary or better yet, update DAO in next step.
    // For now let's implement the controller properly assuming DAO update incoming.

    // I'll add clear method to DAO in next step.
    await WishlistDAO.clear(userId);

    res.status(200).json({ success: true, message: "Wishlist cleared successfully" });
  } catch (error) {
    console.error("Error in clearWishlist:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};
