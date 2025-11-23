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

// Update product warehouse mapping
export const updateProductWarehouseMapping = async (req, res) => {
  try {
    const { productId } = req.params;
    const {
      warehouse_mapping_type,
      primary_warehouses,
      fallback_warehouses,
      enable_fallback,
      warehouse_notes,
      assigned_warehouse_ids,
      stock,
      stock_quantity,
      faq,
      weight_unit,
      weight_display,
      weight_value,
      portion,
      quantity,
      image,
      images,
      // Remove fields that don't exist in database schema
      initial_stock,
      auto_distribute_to_zones,
      zone_distribution_quantity,
      ...otherFields
    } = req.body;

    console.log("Updating warehouse mapping for product:", productId, req.body);

    // Validate required fields
    if (!productId) {
      return res.status(400).json({
        success: false,
        error: "Product ID is required",
      });
    }

    if (!warehouse_mapping_type) {
      return res.status(400).json({
        success: false,
        error: "Warehouse mapping type is required",
      });
    }

    // Validate mapping type
    const validTypes = [
      "nationwide",
      "zonal_with_fallback",
      "zonal_only",
      "division_only",
      "custom",
    ];
    if (!validTypes.includes(warehouse_mapping_type)) {
      return res.status(400).json({
        success: false,
        error: "Invalid warehouse mapping type",
      });
    }

    // Prepare update data with all relevant fields
    const updateData = {
      warehouse_mapping_type,
      primary_warehouses: primary_warehouses || [],
      fallback_warehouses: enable_fallback ? fallback_warehouses || [] : [],
      enable_fallback: enable_fallback || false,
      warehouse_notes: warehouse_notes || null,
      assigned_warehouse_ids: assigned_warehouse_ids || [],
      updated_at: new Date().toISOString(),
    };

    // Add stock-related fields if provided (only include fields that exist in database)
    if (typeof stock !== "undefined" && stock !== null) {
      updateData.stock = Number(stock);
    }
    if (typeof stock_quantity !== "undefined" && stock_quantity !== null) {
      updateData.stock_quantity = Number(stock_quantity);
    }
    if (faq && Array.isArray(faq)) {
      updateData.faq = faq;
    }
    // Add weight and quantity fields that exist in schema
    if (weight_unit) {
      updateData.weight_unit = weight_unit;
    }
    if (weight_display) {
      updateData.weight_display = weight_display;
    }
    if (weight_value) {
      updateData.weight_value = weight_value;
    }
    if (portion) {
      updateData.portion = portion;
    }
    if (quantity) {
      updateData.quantity = quantity;
    }
    // Add image fields that exist in schema
    if (image) {
      updateData.image = image;
    }
    if (images && Array.isArray(images)) {
      updateData.images = images;
    }
    // Note: initial_stock, auto_distribute_to_zones, zone_distribution_quantity are explicitly excluded above

    console.log("Update data being sent to Supabase:", updateData);

    // First check if the product exists
    const { data: existingProduct, error: checkError } = await supabase
      .from("products")
      .select("id")
      .eq("id", productId)
      .single();

    if (checkError || !existingProduct) {
      console.error("Product not found:", checkError);
      return res.status(404).json({
        success: false,
        error: "Product not found",
      });
    }

    // Update the product
    const { data, error } = await supabase
      .from("products")
      .update(updateData)
      .eq("id", productId)
      .select()
      .single();

    if (error) {
      console.error("Supabase error details:", error);
      console.error("Error code:", error.code);
      console.error("Error message:", error.message);
      console.error("Error details:", error.details);
      return res.status(500).json({
        success: false,
        error: error.message,
        details: error.details || null,
      });
    }

    if (!data) {
      console.log("No data returned from Supabase update");
      return res.status(404).json({
        success: false,
        error: "Product not found",
      });
    }

    console.log("Product updated successfully:", data);
    res.status(200).json({
      success: true,
      message: "Warehouse mapping updated successfully",
      product: data,
    });
  } catch (err) {
    console.error("Error updating warehouse mapping:", err);
    res.status(500).json({
      success: false,
      error: "An unexpected error occurred. Please try again.",
    });
  }
};

// Get single product for admin with warehouse details
export const getProductForAdmin = async (req, res) => {
  try {
    const { productId } = req.params;

    if (!productId) {
      return res.status(400).json({
        success: false,
        error: "Product ID is required",
      });
    }

    // Fetch product with warehouse details
    const { data, error } = await supabase
      .from("products")
      .select(
        `
        *, 
        groups(id, name, subcategories(id, name, categories(id, name))),
        subcategories(id, name, categories(id, name))
      `
      )
      .eq("id", productId)
      .single();

    if (error) {
      console.error("Supabase error:", error);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        error: "Product not found",
      });
    }

    res.status(200).json({
      success: true,
      product: data,
    });
  } catch (err) {
    console.error("Error fetching product:", err);
    res.status(500).json({
      success: false,
      error: "An unexpected error occurred. Please try again.",
    });
  }
};

// Delete product for admin
export const deleteProductForAdmin = async (req, res) => {
  try {
    const { productId } = req.params;

    if (!productId) {
      return res.status(400).json({
        success: false,
        error: "Product ID is required",
      });
    }

    console.log("Deleting product:", productId);

    // First check if product exists
    const { data: existingProduct, error: fetchError } = await supabase
      .from("products")
      .select("id, name")
      .eq("id", productId)
      .single();

    if (fetchError || !existingProduct) {
      return res.status(404).json({
        success: false,
        error: "Product not found",
      });
    }

    // Delete the product
    const { error } = await supabase
      .from("products")
      .delete()
      .eq("id", productId);

    if (error) {
      console.error("Supabase delete error:", error);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    res.status(200).json({
      success: true,
      message: "Product deleted successfully",
      deletedProduct: existingProduct,
    });
  } catch (err) {
    console.error("Error deleting product:", err);
    res.status(500).json({
      success: false,
      error: "An unexpected error occurred. Please try again.",
    });
  }
};
