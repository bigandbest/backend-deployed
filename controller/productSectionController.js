import { supabase } from "../config/supabaseClient.js";

// Get all product sections
export const getAllProductSections = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("product_sections")
      .select("*")
      .order("display_order", { ascending: true });

    if (error) {
      console.error("Supabase error:", error);
      return res.status(500).json({ error: error.message });
    }

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Error fetching product sections:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get active product sections only
export const getActiveProductSections = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("product_sections")
      .select("*")
      .eq("is_active", true)
      .order("display_order", { ascending: true });

    if (error) {
      console.error("Supabase error:", error);
      return res.status(500).json({ error: error.message });
    }

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Error fetching active product sections:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get single product section by ID
export const getProductSectionById = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("product_sections")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return res.status(404).json({ error: "Product section not found" });
      }
      console.error("Supabase error:", error);
      return res.status(500).json({ error: error.message });
    }

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Error fetching product section:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Update product section
export const updateProductSection = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Remove id from update data if present
    delete updateData.id;
    delete updateData.created_at;

    const { data, error } = await supabase
      .from("product_sections")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return res.status(404).json({ error: "Product section not found" });
      }
      console.error("Supabase error:", error);
      return res.status(500).json({ error: error.message });
    }

    res.status(200).json({
      success: true,
      data,
      message: "Product section updated successfully",
    });
  } catch (error) {
    console.error("Error updating product section:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Toggle section active status
export const toggleSectionStatus = async (req, res) => {
  try {
    const { id } = req.params;

    // Get current status
    const { data: currentSection, error: fetchError } = await supabase
      .from("product_sections")
      .select("is_active")
      .eq("id", id)
      .single();

    if (fetchError) {
      if (fetchError.code === "PGRST116") {
        return res.status(404).json({ error: "Product section not found" });
      }
      console.error("Supabase error:", fetchError);
      return res.status(500).json({ error: fetchError.message });
    }

    // Toggle status
    const newStatus = !currentSection.is_active;

    const { data, error } = await supabase
      .from("product_sections")
      .update({ is_active: newStatus })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Supabase error:", error);
      return res.status(500).json({ error: error.message });
    }

    res.status(200).json({
      success: true,
      data,
      message: `Section ${
        newStatus ? "activated" : "deactivated"
      } successfully`,
    });
  } catch (error) {
    console.error("Error toggling section status:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Update display order for multiple sections
export const updateSectionOrder = async (req, res) => {
  try {
    const { sections } = req.body;

    if (!sections || !Array.isArray(sections)) {
      return res.status(400).json({
        error: "sections array is required",
      });
    }

    // Update each section's display order
    const updates = sections.map((section) =>
      supabase
        .from("product_sections")
        .update({ display_order: section.display_order })
        .eq("id", section.id)
    );

    const results = await Promise.all(updates);

    // Check for errors
    const errorResults = results.filter((result) => result.error);
    if (errorResults.length > 0) {
      console.error("Supabase errors:", errorResults);
      return res.status(500).json({
        error: "Failed to update some sections",
        details: errorResults.map((r) => r.error.message),
      });
    }

    res.status(200).json({
      success: true,
      message: "Section order updated successfully",
    });
  } catch (error) {
    console.error("Error updating section order:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ========== PRODUCT-SECTION ASSIGNMENT FUNCTIONS ==========

// Add products to a section
export const addProductsToSection = async (req, res) => {
  try {
    const { id } = req.params; // section_id
    const { product_ids } = req.body;

    if (!product_ids || !Array.isArray(product_ids) || product_ids.length === 0) {
      return res.status(400).json({
        error: "product_ids array is required and must not be empty",
      });
    }

    // Verify section exists
    const { data: section, error: sectionError } = await supabase
      .from("product_sections")
      .select("id")
      .eq("id", id)
      .single();

    if (sectionError || !section) {
      return res.status(404).json({ error: "Product section not found" });
    }

    // Get current max display_order for this section
    const { data: maxOrderData } = await supabase
      .from("product_section_products")
      .select("display_order")
      .eq("section_id", id)
      .order("display_order", { ascending: false })
      .limit(1);

    let nextOrder = maxOrderData && maxOrderData.length > 0 ? maxOrderData[0].display_order + 1 : 0;

    // Create assignments
    // section_id is INTEGER, product_id is UUID
    const assignments = product_ids.map((product_id) => ({
      product_id: product_id, // UUID - keep as string
      section_id: parseInt(id), // INTEGER - parse to int
      display_order: nextOrder++,
    }));

    const { data, error } = await supabase
      .from("product_section_products")
      .upsert(assignments, { onConflict: "product_id,section_id" })
      .select();

    if (error) {
      console.error("Supabase error:", error);
      return res.status(500).json({ error: error.message });
    }

    res.status(200).json({
      success: true,
      data,
      message: `${product_ids.length} product(s) added to section successfully`,
    });
  } catch (error) {
    console.error("Error adding products to section:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Remove a product from a section
export const removeProductFromSection = async (req, res) => {
  try {
    const { id, productId } = req.params; // section_id, product_id

    const { error } = await supabase
      .from("product_section_products")
      .delete()
      .eq("section_id", id)
      .eq("product_id", productId);

    if (error) {
      console.error("Supabase error:", error);
      return res.status(500).json({ error: error.message });
    }

    res.status(200).json({
      success: true,
      message: "Product removed from section successfully",
    });
  } catch (error) {
    console.error("Error removing product from section:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get all products in a section
export const getProductsInSection = async (req, res) => {
  try {
    const { id } = req.params; // section_id
    const { page = 1, limit = 50 } = req.query;

    const offset = (page - 1) * limit;

    // Get products with their details
    const { data, error, count } = await supabase
      .from("product_section_products")
      .select(`
        id,
        display_order,
        created_at,
        products:product_id (
          id,
          name,
          price,
          old_price,
          image,
          active,
          stock,
          category_id,
          subcategory_id,
          group_id
        )
      `, { count: 'exact' })
      .eq("section_id", id)
      .order("display_order", { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("Supabase error:", error);
      return res.status(500).json({ error: error.message });
    }

    // Transform data to flatten product details
    const products = data.map(item => ({
      assignment_id: item.id,
      display_order: item.display_order,
      assigned_at: item.created_at,
      ...item.products
    }));

    res.status(200).json({
      success: true,
      data: products,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching products in section:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Update product order within a section
export const updateProductOrderInSection = async (req, res) => {
  try {
    const { id } = req.params; // section_id
    const { products } = req.body; // Array of { product_id, display_order }

    if (!products || !Array.isArray(products)) {
      return res.status(400).json({
        error: "products array is required",
      });
    }

    // Update each product's display order
    const updates = products.map((product) =>
      supabase
        .from("product_section_products")
        .update({ display_order: product.display_order })
        .eq("section_id", id)
        .eq("product_id", product.product_id)
    );

    const results = await Promise.all(updates);

    // Check for errors
    const errorResults = results.filter((result) => result.error);
    if (errorResults.length > 0) {
      console.error("Supabase errors:", errorResults);
      return res.status(500).json({
        error: "Failed to update some products",
        details: errorResults.map((r) => r.error.message),
      });
    }

    res.status(200).json({
      success: true,
      message: "Product order updated successfully",
    });
  } catch (error) {
    console.error("Error updating product order:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get sections for a specific product
export const getSectionsForProduct = async (req, res) => {
  try {
    const { productId } = req.params;

    const { data, error } = await supabase
      .from("product_section_products")
      .select(`
        id,
        display_order,
        product_sections:section_id (
          id,
          section_key,
          section_name,
          is_active,
          component_name
        )
      `)
      .eq("product_id", productId)
      .order("display_order", { ascending: true });

    if (error) {
      console.error("Supabase error:", error);
      return res.status(500).json({ error: error.message });
    }

    // Transform data
    const sections = data.map(item => ({
      assignment_id: item.id,
      display_order: item.display_order,
      ...item.product_sections
    }));

    res.status(200).json({
      success: true,
      data: sections,
    });
  } catch (error) {
    console.error("Error fetching sections for product:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
