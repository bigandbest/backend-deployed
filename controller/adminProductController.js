import { supabase } from "../config/supabaseClient.js";

// Get all products for admin with full details and joins
export const getAllProductsForAdmin = async (req, res) => {
  try {
    // Fetch with join to groups, subcategories and categories
    const { data, error } = await supabase
      .from("products")
      .select(
        `
        *, 
        groups(id, name, subcategories(id, name, categories(id, name))),
        subcategories(id, name, categories(id, name))
      `
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase error:", error);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    res.status(200).json({
      success: true,
      products: data || [],
      total: data?.length || 0,
    });
  } catch (err) {
    console.error("Error fetching products:", err);
    res.status(500).json({
      success: false,
      error: "An unexpected error occurred. Please try again.",
    });
  }
};