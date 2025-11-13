import { supabase } from "../config/supabaseClient.js";

// Get product grid settings
export const getProductGridSettings = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("product_grid_settings")
      .select("is_visible")
      .single();

    if (error) {
      console.error("Error fetching product grid settings:", error);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    res.status(200).json({
      success: true,
      data: data,
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    res.status(500).json({
      success: false,
      error: "An unexpected error occurred",
    });
  }
};

// Update product grid settings
export const updateProductGridSettings = async (req, res) => {
  try {
    const { is_visible } = req.body;

    const { data, error } = await supabase
      .from("product_grid_settings")
      .update({ is_visible })
      .eq("id", "1")
      .select();

    if (error) {
      console.error("Error updating product grid settings:", error);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    res.status(200).json({
      success: true,
      data: data[0],
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    res.status(500).json({
      success: false,
      error: "An unexpected error occurred",
    });
  }
};