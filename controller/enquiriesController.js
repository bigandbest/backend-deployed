import { supabase } from "../config/supabaseClient.js";

// Get enquiries count
export const getEnquiriesCount = async (req, res) => {
  try {
    const { status } = req.query;

    let query = supabase
      .from("enquiries")
      .select("*", { count: "exact", head: true });

    if (status) {
      query = query.eq("status", status);
    }

    // Only count enquiries where type is not 'custom_printing'
    query = query.or("type.is.null,type.neq.custom_printing");

    const { count, error } = await query;

    if (error) {
      console.error("Error fetching enquiries count:", error);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    res.status(200).json({
      success: true,
      count: count || 0,
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    res.status(500).json({
      success: false,
      error: "An unexpected error occurred",
    });
  }
};