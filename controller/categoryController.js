import { supabase } from "../config/supabaseClient.js";

// Add new category
export const addCategory = async (req, res) => {
  try {
    const categoryData = req.body;
    let imageUrl = categoryData.image_url;

    // Handle image upload if file is provided
    if (req.file) {
      const fileExt = req.file.originalname.split(".").pop();
      const fileName = `${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("categories")
        .upload(fileName, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: true,
        });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        return res.status(400).json({
          success: false,
          error: `Failed to upload image: ${uploadError.message}`,
        });
      }

      const { data: urlData } = supabase.storage
        .from("categories")
        .getPublicUrl(fileName);

      imageUrl = urlData.publicUrl;
    }

    const { data, error } = await supabase
      .from("categories")
      .insert([{
        ...categoryData,
        image_url: imageUrl,
      }])
      .select("id, name, icon, featured, description, image_url, active")
      .single();

    if (error) {
      console.error("Error adding category:", error);
      return res.status(500).json({ success: false, error: error.message });
    }

    res.status(201).json({
      success: true,
      category: data,
      message: "Category added successfully",
    });
  } catch (error) {
    console.error("Error in addCategory:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Update category (for toggling active status or other updates)
export const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    let imageUrl = updates.image_url;

    // Handle image upload if file is provided
    if (req.file) {
      const fileExt = req.file.originalname.split(".").pop();
      const fileName = `${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("categories")
        .upload(fileName, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: true,
        });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        return res.status(400).json({
          success: false,
          error: `Failed to upload image: ${uploadError.message}`,
        });
      }

      const { data: urlData } = supabase.storage
        .from("categories")
        .getPublicUrl(fileName);

      imageUrl = urlData.publicUrl;
    }

    const { data, error } = await supabase
      .from("categories")
      .update({
        ...updates,
        image_url: imageUrl,
      })
      .eq("id", id)
      .select("id, name, icon, featured, description, image_url, active")
      .single();

    if (error) {
      console.error("Error updating category:", error);
      return res.status(500).json({ success: false, error: error.message });
    }

    res.status(200).json({
      success: true,
      category: data,
      message: "Category updated successfully",
    });
  } catch (error) {
    console.error("Error in updateCategory:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Delete category
export const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const options = req.body || {};

    // Check if category has products
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("id")
      .eq("category_id", id)
      .limit(1);

    if (productsError) {
      console.error("Error checking products:", productsError);
      return res.status(500).json({ success: false, error: productsError.message });
    }

    if (products && products.length > 0) {
      if (options.forceDelete) {
        // Force delete: delete all related products
        const { error: deleteProductsError } = await supabase
          .from("products")
          .delete()
          .eq("category_id", id);

        if (deleteProductsError) {
          console.error("Error deleting products:", deleteProductsError);
          return res.status(500).json({
            success: false,
            error: "Failed to delete related products"
          });
        }
      } else if (options.reassignProductsTo) {
        // Reassign products to another category
        const { error: reassignError } = await supabase
          .from("products")
          .update({ category_id: options.reassignProductsTo })
          .eq("category_id", id);

        if (reassignError) {
          console.error("Error reassigning products:", reassignError);
          return res.status(500).json({
            success: false,
            error: "Failed to reassign products"
          });
        }
      } else {
        // Return error indicating category has products
        return res.status(400).json({
          success: false,
          hasProducts: true,
          error: "Category has products. Please reassign or force delete.",
        });
      }
    }

    // Delete subcategories and groups
    const { data: subcategories } = await supabase
      .from("subcategories")
      .select("id")
      .eq("category_id", id);

    if (subcategories && subcategories.length > 0) {
      const subcategoryIds = subcategories.map(sub => sub.id);

      // Delete groups
      await supabase
        .from("groups")
        .delete()
        .in("subcategory_id", subcategoryIds);

      // Delete subcategories
      await supabase
        .from("subcategories")
        .delete()
        .eq("category_id", id);
    }

    // Delete the category
    const { error } = await supabase
      .from("categories")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting category:", error);
      return res.status(500).json({ success: false, error: error.message });
    }

    res.status(200).json({
      success: true,
      message: "Category deleted successfully",
    });
  } catch (error) {
    console.error("Error in deleteCategory:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Get all subcategories with their category info
export const getAllSubcategories = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("subcategories")
      .select(
        `
        *,
        categories (
          id,
          name,
          image_url,
          icon
        )
      `
      )
      .eq("active", true)
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("Supabase error:", error);
      return res.status(500).json({ error: error.message });
    }

    res.status(200).json({
      success: true,
      subcategories: data,
      total: data.length,
    });
  } catch (error) {
    console.error("Server error in getAllSubcategories:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get subcategories by category ID
export const getSubcategoriesByCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;

    const { data, error } = await supabase
      .from("subcategories")
      .select("*")
      .eq("category_id", categoryId)
      .eq("active", true)
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("Supabase error:", error);
      return res.status(500).json({ error: error.message });
    }

    res.status(200).json({
      success: true,
      subcategories: data,
      total: data.length,
    });
  } catch (error) {
    console.error("Server error in getSubcategoriesByCategory:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Add new subcategory
export const addSubcategory = async (req, res) => {
  try {
    const subcategoryData = req.body;
    let imageUrl = subcategoryData.image_url;

    // Handle image upload if file is provided
    if (req.file) {
      const fileExt = req.file.originalname.split(".").pop();
      const fileName = `${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("subcategories")
        .upload(fileName, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: true,
        });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        return res.status(400).json({
          success: false,
          error: `Failed to upload image: ${uploadError.message}`,
        });
      }

      const { data: urlData } = supabase.storage
        .from("subcategories")
        .getPublicUrl(fileName);

      imageUrl = urlData.publicUrl;
    }

    const { data, error } = await supabase
      .from("subcategories")
      .insert([{
        ...subcategoryData,
        image_url: imageUrl,
      }])
      .select("id, name, icon, description, category_id, featured, active, sort_order, image_url")
      .single();

    if (error) {
      console.error("Error adding subcategory:", error);
      return res.status(500).json({ success: false, error: error.message });
    }

    res.status(201).json({
      success: true,
      subcategory: data,
      message: "Subcategory added successfully",
    });
  } catch (error) {
    console.error("Error in addSubcategory:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Update subcategory
export const updateSubcategory = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    let imageUrl = updates.image_url;

    // Handle image upload if file is provided
    if (req.file) {
      const fileExt = req.file.originalname.split(".").pop();
      const fileName = `${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("subcategories")
        .upload(fileName, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: true,
        });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        return res.status(400).json({
          success: false,
          error: `Failed to upload image: ${uploadError.message}`,
        });
      }

      const { data: urlData } = supabase.storage
        .from("subcategories")
        .getPublicUrl(fileName);

      imageUrl = urlData.publicUrl;
    }

    const { data, error } = await supabase
      .from("subcategories")
      .update({
        ...updates,
        image_url: imageUrl,
      })
      .eq("id", id)
      .select("id, name, icon, description, category_id, featured, active, sort_order, image_url")
      .single();

    if (error) {
      console.error("Error updating subcategory:", error);
      return res.status(500).json({ success: false, error: error.message });
    }

    res.status(200).json({
      success: true,
      subcategory: data,
      message: "Subcategory updated successfully",
    });
  } catch (error) {
    console.error("Error in updateSubcategory:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Delete subcategory
export const deleteSubcategory = async (req, res) => {
  try {
    const { id } = req.params;

    // Delete related groups first
    await supabase
      .from("groups")
      .delete()
      .eq("subcategory_id", id);

    // Delete the subcategory
    const { error } = await supabase
      .from("subcategories")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting subcategory:", error);
      return res.status(500).json({ success: false, error: error.message });
    }

    res.status(200).json({
      success: true,
      message: "Subcategory deleted successfully",
    });
  } catch (error) {
    console.error("Error in deleteSubcategory:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Get all groups with their subcategory and category info
export const getAllGroups = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("groups")
      .select(
        `
        *,
        subcategories (
          id,
          name,
          image_url,
          icon,
          categories (
            id,
            name,
            image_url,
            icon
          )
        )
      `
      )
      .eq("active", true)
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("Supabase error:", error);
      return res.status(500).json({ error: error.message });
    }

    res.status(200).json({
      success: true,
      groups: data,
      total: data.length,
    });
  } catch (error) {
    console.error("Server error in getAllGroups:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get groups by subcategory ID
export const getGroupsBySubcategory = async (req, res) => {
  try {
    const { subcategoryId } = req.params;

    const { data, error } = await supabase
      .from("groups")
      .select("*")
      .eq("subcategory_id", subcategoryId)
      .eq("active", true)
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("Supabase error:", error);
      return res.status(500).json({ error: error.message });
    }

    res.status(200).json({
      success: true,
      groups: data,
      total: data.length,
    });
  } catch (error) {
    console.error("Server error in getGroupsBySubcategory:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Add new group
export const addGroup = async (req, res) => {
  try {
    const groupData = req.body;
    let imageUrl = groupData.image_url;

    // Handle image upload if file is provided
    if (req.file) {
      const fileExt = req.file.originalname.split(".").pop();
      const fileName = `${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("groups")
        .upload(fileName, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: true,
        });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        return res.status(400).json({
          success: false,
          error: `Failed to upload image: ${uploadError.message}`,
        });
      }

      const { data: urlData } = supabase.storage
        .from("groups")
        .getPublicUrl(fileName);

      imageUrl = urlData.publicUrl;
    }

    const { data, error } = await supabase
      .from("groups")
      .insert([{
        ...groupData,
        image_url: imageUrl,
      }])
      .select("id, name, icon, description, subcategory_id, featured, active, sort_order, image_url")
      .single();

    if (error) {
      console.error("Error adding group:", error);
      return res.status(500).json({ success: false, error: error.message });
    }

    res.status(201).json({
      success: true,
      group: data,
      message: "Group added successfully",
    });
  } catch (error) {
    console.error("Error in addGroup:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Update group
export const updateGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    let imageUrl = updates.image_url;

    // Handle image upload if file is provided
    if (req.file) {
      const fileExt = req.file.originalname.split(".").pop();
      const fileName = `${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("groups")
        .upload(fileName, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: true,
        });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        return res.status(400).json({
          success: false,
          error: `Failed to upload image: ${uploadError.message}`,
        });
      }

      const { data: urlData } = supabase.storage
        .from("groups")
        .getPublicUrl(fileName);

      imageUrl = urlData.publicUrl;
    }

    const { data, error } = await supabase
      .from("groups")
      .update({
        ...updates,
        image_url: imageUrl,
      })
      .eq("id", id)
      .select("id, name, icon, description, subcategory_id, featured, active, sort_order, image_url")
      .single();

    if (error) {
      console.error("Error updating group:", error);
      return res.status(500).json({ success: false, error: error.message });
    }

    res.status(200).json({
      success: true,
      group: data,
      message: "Group updated successfully",
    });
  } catch (error) {
    console.error("Error in updateGroup:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Delete group
export const deleteGroup = async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from("groups")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting group:", error);
      return res.status(500).json({ success: false, error: error.message });
    }

    res.status(200).json({
      success: true,
      message: "Group deleted successfully",
    });
  } catch (error) {
    console.error("Error in deleteGroup:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Get categories with their subcategories and groups (full hierarchy)
export const getCategoriesHierarchy = async (req, res) => {
  try {
    // Get categories
    const { data: categories, error: catError } = await supabase
      .from("categories")
      .select("*")
      .eq("active", true)
      .order("name");

    if (catError) {
      console.error("Categories error:", catError);
      return res.status(500).json({ error: catError.message });
    }

    // Get subcategories with category_id
    const { data: subcategories, error: subError } = await supabase
      .from("subcategories")
      .select("*")
      .eq("active", true)
      .order("sort_order");

    if (subError) {
      console.error("Subcategories error:", subError);
      return res.status(500).json({ error: subError.message });
    }

    // Get groups with subcategory_id
    const { data: groups, error: groupError } = await supabase
      .from("groups")
      .select("*")
      .eq("active", true)
      .order("sort_order");

    if (groupError) {
      console.error("Groups error:", groupError);
      return res.status(500).json({ error: groupError.message });
    }

    // Build hierarchy
    const hierarchy = categories.map((category) => ({
      ...category,
      subcategories: subcategories
        .filter((sub) => sub.category_id === category.id)
        .map((subcategory) => ({
          ...subcategory,
          groups: groups.filter(
            (group) => group.subcategory_id === subcategory.id
          ),
        })),
    }));

    res.status(200).json({
      success: true,
      categories: hierarchy,
      total: hierarchy.length,
    });
  } catch (error) {
    console.error("Server error in getCategoriesHierarchy:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get subcategory details with category info
export const getSubcategoryDetails = async (req, res) => {
  try {
    const { subcategoryId } = req.params;

    const { data, error } = await supabase
      .from("subcategories")
      .select(
        `
        *,
        categories (
          id,
          name,
          image_url,
          icon
        )
      `
      )
      .eq("id", subcategoryId)
      .eq("active", true)
      .single();

    if (error) {
      console.error("Supabase error:", error);
      return res.status(500).json({ error: error.message });
    }

    res.status(200).json({
      success: true,
      subcategory: data,
    });
  } catch (error) {
    console.error("Server error in getSubcategoryDetails:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get subcategories for a specific section (by section key)
export const getSubcategoriesForSection = async (req, res) => {
  try {
    const { sectionKey } = req.params;

    // First, get the section ID from the section key
    const { data: section, error: sectionError } = await supabase
      .from("product_sections")
      .select("id")
      .eq("section_key", sectionKey)
      .single();

    if (sectionError || !section) {
      return res.status(404).json({ error: "Section not found" });
    }

    // Get subcategory mappings for this section
    const { data: mappings, error: mappingsError } = await supabase
      .from("section_subcategory_mappings")
      .select("subcategory_id, display_order, is_active")
      .eq("section_id", section.id)
      .eq("is_active", true)
      .order("display_order", { ascending: true });

    if (mappingsError) {
      console.error("Mappings error:", mappingsError);
      return res.status(500).json({ error: mappingsError.message });
    }

    if (!mappings || mappings.length === 0) {
      return res.status(200).json({
        success: true,
        subcategories: [],
        total: 0,
      });
    }

    // Get subcategory IDs from mappings
    const subcategoryIds = mappings.map(m => m.subcategory_id);

    // Fetch subcategory details with their category info
    const { data: subcategories, error: subError } = await supabase
      .from("subcategories")
      .select(`
        *,
        categories (
          id,
          name,
          image_url,
          icon
        )
      `)
      .in("id", subcategoryIds)
      .eq("active", true);

    if (subError) {
      console.error("Subcategories error:", subError);
      return res.status(500).json({ error: subError.message });
    }

    // Merge subcategory data with display_order from mappings
    const orderedSubcategories = mappings
      .map(mapping => {
        const subcategory = subcategories.find(s => s.id === mapping.subcategory_id);
        if (subcategory) {
          return {
            ...subcategory,
            display_order: mapping.display_order,
          };
        }
        return null;
      })
      .filter(s => s !== null);

    res.status(200).json({
      success: true,
      subcategories: orderedSubcategories,
      total: orderedSubcategories.length,
    });
  } catch (error) {
    console.error("Server error in getSubcategoriesForSection:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get categories for a specific section (by section key)
export const getCategoriesForSection = async (req, res) => {
  try {
    const { sectionKey } = req.params;

    // First, get the section ID from the section key
    const { data: section, error: sectionError } = await supabase
      .from("product_sections")
      .select("id")
      .eq("section_key", sectionKey)
      .single();

    if (sectionError || !section) {
      return res.status(404).json({ error: "Section not found" });
    }

    // Get category mappings for this section
    const { data: categoryMappings, error: categoryMappingsError } = await supabase
      .from("product_section_categories")
      .select("category_id")
      .eq("section_id", section.id);

    if (categoryMappingsError) {
      console.error("Category mappings error:", categoryMappingsError);
      return res.status(500).json({ error: categoryMappingsError.message });
    }

    // Get subcategory mappings for this section
    const { data: subcategoryMappings, error: subcategoryMappingsError } = await supabase
      .from("section_subcategory_mappings")
      .select("subcategory_id, display_order, is_active")
      .eq("section_id", section.id)
      .eq("is_active", true)
      .order("display_order", { ascending: true });

    if (subcategoryMappingsError) {
      console.error("Subcategory mappings error:", subcategoryMappingsError);
      return res.status(500).json({ error: subcategoryMappingsError.message });
    }

    // If no mappings exist, return empty result
    if ((!categoryMappings || categoryMappings.length === 0) &&
      (!subcategoryMappings || subcategoryMappings.length === 0)) {
      return res.status(200).json({
        success: true,
        categories: [],
        total: 0,
      });
    }

    // Get all categories
    const { data: allCategories, error: catError } = await supabase
      .from("categories")
      .select("*")
      .eq("active", true)
      .order("name");

    if (catError) {
      console.error("Categories error:", catError);
      return res.status(500).json({ error: catError.message });
    }

    // Get all subcategories
    const { data: allSubcategories, error: subError } = await supabase
      .from("subcategories")
      .select("*")
      .eq("active", true)
      .order("sort_order");

    if (subError) {
      console.error("Subcategories error:", subError);
      return res.status(500).json({ error: subError.message });
    }

    // Build category IDs set from both category and subcategory mappings
    const categoryIdsSet = new Set();

    // Add directly mapped categories
    if (categoryMappings && categoryMappings.length > 0) {
      categoryMappings.forEach(m => categoryIdsSet.add(m.category_id));
    }

    // Add categories from mapped subcategories
    if (subcategoryMappings && subcategoryMappings.length > 0) {
      const mappedSubcategoryIds = subcategoryMappings.map(m => m.subcategory_id);
      allSubcategories
        .filter(sub => mappedSubcategoryIds.includes(sub.id))
        .forEach(sub => categoryIdsSet.add(sub.category_id));
    }

    // Filter categories and build hierarchy
    const filteredCategories = allCategories
      .filter(cat => categoryIdsSet.has(cat.id))
      .map(category => {
        // Get subcategories for this category
        let subcategories = allSubcategories.filter(sub => sub.category_id === category.id);

        // If we have subcategory mappings, filter and order them
        if (subcategoryMappings && subcategoryMappings.length > 0) {
          const mappedSubIds = subcategoryMappings.map(m => m.subcategory_id);
          subcategories = subcategories.filter(sub => mappedSubIds.includes(sub.id));

          // Add display_order from mappings
          subcategories = subcategories.map(sub => {
            const mapping = subcategoryMappings.find(m => m.subcategory_id === sub.id);
            return {
              ...sub,
              display_order: mapping ? mapping.display_order : 999,
            };
          });

          // Sort by display_order
          subcategories.sort((a, b) => a.display_order - b.display_order);
        }

        return {
          ...category,
          subcategories,
        };
      });

    res.status(200).json({
      success: true,
      categories: filteredCategories,
      total: filteredCategories.length,
    });
  } catch (error) {
    console.error("Server error in getCategoriesForSection:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
