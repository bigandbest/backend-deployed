import { uploadToCloudinary } from "../services/uploadService.js";
import prisma from "../config/prisma.js";
import CategoryDAO from "../dao/category.dao.js";

// Add new category
export const addCategory = async (req, res) => {
  try {
    const categoryData = { ...req.body };
    // Parse boolean fields manually because multer converts everything to strings
    if (categoryData.active !== undefined)
      categoryData.active = categoryData.active === "true";
    if (categoryData.featured !== undefined)
      categoryData.featured = categoryData.featured === "true";

    let imageUrl = categoryData.image_url;

    // Handle image upload if file is provided
    if (req.file) {
      console.log(
        "Uploading category image to Cloudinary:",
        req.file.originalname,
      );
      const uploadResult = await uploadToCloudinary(
        req.file.buffer,
        "categories",
        req.file.mimetype,
      );

      if (!uploadResult.success) {
        return res.status(400).json({
          success: false,
          error: `Failed to upload image: ${uploadResult.error}`,
        });
      }

      imageUrl = uploadResult.secure_url;
    }

    const data = await CategoryDAO.createCategory({
      ...categoryData,
      image_url: imageUrl,
    });

    // Error handling is managed by try/catch block now, as Prisma throws on error.
    /* if (error) { ... } removed */

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
    const updates = { ...req.body };

    // Parse boolean fields
    if (updates.active !== undefined)
      updates.active = updates.active === "true";
    if (updates.featured !== undefined)
      updates.featured = updates.featured === "true";

    let imageUrl = updates.image_url;

    // Handle image upload if file is provided
    if (req.file) {
      console.log(
        "Uploading category image to Cloudinary:",
        req.file.originalname,
      );
      // Fetch existing category to delete old image
      const existingCategory = await CategoryDAO.getCategoryById(id);
      const uploadResult = await uploadToCloudinary(
        req.file.buffer,
        "categories",
        req.file.mimetype,
        existingCategory?.image_url ?? null,
      );

      if (!uploadResult.success) {
        return res.status(400).json({
          success: false,
          error: `Failed to upload image: ${uploadResult.error}`,
        });
      }

      imageUrl = uploadResult.secure_url;
    }

    // Whitelist allowed fields to prevent unknown argument errors
    const allowedFields = ["name", "description", "featured", "icon", "active"];
    const updateData = {};

    allowedFields.forEach((field) => {
      if (updates[field] !== undefined) {
        updateData[field] = updates[field];
      }
    });

    // Add image_url if processed
    if (imageUrl) {
      updateData.image_url = imageUrl;
    }

    const data = await CategoryDAO.updateCategory(id, updateData);

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

// Get all categories (simple list)
export const getAllCategories = async (req, res) => {
  try {
    const categories = await CategoryDAO.listCategories(false);
    res.json({
      success: true,
      categories: categories || [],
    });
  } catch (err) {
    console.error("Error fetching categories:", err);
    res.status(500).json({
      success: false,
      error: "An unexpected error occurred",
    });
  }
};

// Delete category
// Check if category has products
// Using prisma via simple query since CategoryDAO doesn't expose raw checking yet.
// Or we can rely on listCategories with count? Or getCategoryById?
// Let's use listCategories filter? No.
// We'll use supabase for this check for now or import ProductDAO?
// Let's import ProductDAO? No, circular dependency potential if not careful? No.
// Actually, let's use supabase for the product check as it's a specific logic.
// Or just use CategoryDAO.deleteCategory and handle FK error?
// Prisma throws P2003 on FK constraint.
// But we need to handle "reassign" logic.

// I will try to use Supabase for the check to minimize risk of changing logic flow too much
// until we have `ProductDAO.countByCategoryId`.

// Actually, I can use `CategoryDAO` to delete subcategories and groups as requested in controller.
// But `CategoryDAO` methods `deleteSubcategory` takes ID.
// Controller Logic:
// 1. Check products.
// 2. Delete/Reassign products.
// 3. Delete groups.
// 4. Delete subcategories.
// 5. Delete category.

// I'll keep the `supabase` check for products and product deletion for now as `ProductDAO` wasn't fully checked for this.
// But I will replace steps 3, 4, 5 with DAO.

// ... products logic ... (keeping lines 132-180 unchanged basically, or just lightly touched)
/* note: I am replacing lines 126-213, so I must rewrite the logic */

// Delete category
export const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const options = req.body || {};

    // Check if category has products
    const productCount = await prisma.products.count({
      where: { category_id: id },
    });

    if (productCount > 0) {
      if (options.forceDelete) {
        // Force delete: delete all related products
        await prisma.products.deleteMany({
          where: { category_id: id },
        });
      } else if (options.reassignProductsTo) {
        // Reassign products to another category
        await prisma.products.updateMany({
          where: { category_id: id },
          data: { category_id: options.reassignProductsTo },
        });
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
    // Using DAO `getSubcategoriesByCategoryId`
    const subcategories = await CategoryDAO.getSubcategoriesByCategoryId(id);

    if (subcategories && subcategories.length > 0) {
      const subcategoryIds = subcategories.map((sub) => sub.id);

      // Delete related section mappings first
      await prisma.section_subcategory_mappings.deleteMany({
        where: { subcategory_id: { in: subcategoryIds } },
      });

      // Bulk delete groups
      await prisma.groups.deleteMany({
        where: { subcategory_id: { in: subcategoryIds } },
      });

      // Bulk delete subcategories
      await prisma.subcategories.deleteMany({
        where: { category_id: id },
      });
    }

    // Delete the category using DAO
    await CategoryDAO.deleteCategory(id);

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
    // Use Prisma through CategoryDAO - false for activeOnly to show all in admin
    const subcategories = await CategoryDAO.listSubcategories(false);

    res.status(200).json({
      success: true,
      subcategories,
      total: subcategories.length,
    });
  } catch (error) {
    console.error("Server error in getAllSubcategories:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
};

// Get subcategories by category ID
export const getSubcategoriesByCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;

    // Use Prisma through CategoryDAO
    const subcategories =
      await CategoryDAO.getSubcategoriesByCategoryId(categoryId);

    res.status(200).json({
      success: true,
      subcategories: subcategories,
      total: subcategories.length,
    });
  } catch (error) {
    console.error("Server error in getSubcategoriesByCategory:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Add new subcategory
export const addSubcategory = async (req, res) => {
  try {
    const subcategoryData = { ...req.body };
    // Parse boolean fields
    if (subcategoryData.active !== undefined)
      subcategoryData.active = subcategoryData.active === "true";
    if (subcategoryData.featured !== undefined)
      subcategoryData.featured = subcategoryData.featured === "true";
    // Parse integer fields
    if (subcategoryData.sort_order !== undefined)
      subcategoryData.sort_order = parseInt(subcategoryData.sort_order);

    let imageUrl = subcategoryData.image_url;

    // Handle image upload if file is provided
    if (req.file) {
      console.log(
        "Uploading subcategory image to Cloudinary:",
        req.file.originalname,
      );
      const uploadResult = await uploadToCloudinary(
        req.file.buffer,
        "subcategories",
        req.file.mimetype,
      );

      if (!uploadResult.success) {
        return res.status(400).json({
          success: false,
          error: `Failed to upload image: ${uploadResult.error}`,
        });
      }

      imageUrl = uploadResult.secure_url;
    }

    const data = await CategoryDAO.createSubcategory({
      ...subcategoryData,
      image_url: imageUrl,
    });

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
    const updates = { ...req.body };
    // Parse boolean fields
    if (updates.active !== undefined)
      updates.active = updates.active === "true";
    if (updates.featured !== undefined)
      updates.featured = updates.featured === "true";
    // Parse integer fields
    if (updates.sort_order !== undefined)
      updates.sort_order = parseInt(updates.sort_order);

    let imageUrl = updates.image_url;

    // Handle image upload if file is provided
    if (req.file) {
      console.log(
        "Uploading subcategory image to Cloudinary:",
        req.file.originalname,
      );
      // Fetch existing subcategory to delete old image
      const existingSub = await CategoryDAO.getSubcategoryById(id);
      const uploadResult = await uploadToCloudinary(
        req.file.buffer,
        "subcategories",
        req.file.mimetype,
        existingSub?.image_url ?? null,
      );

      if (!uploadResult.success) {
        return res.status(400).json({
          success: false,
          error: `Failed to upload image: ${uploadResult.error}`,
        });
      }

      imageUrl = uploadResult.secure_url;
    }

    // Whitelist allowed fields
    const allowedFields = [
      "name",
      "description",
      "featured",
      "icon",
      "active",
      "sort_order",
      "category_id",
    ];
    const updateData = {};

    allowedFields.forEach((field) => {
      if (updates[field] !== undefined) {
        updateData[field] = updates[field];
      }
    });

    if (imageUrl) {
      updateData.image_url = imageUrl;
    }

    // Set updated_at manually since it exists in subcategories schema
    updateData.updated_at = new Date();

    const data = await CategoryDAO.updateSubcategory(id, updateData);

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

    // Delete related section mappings first
    await prisma.section_subcategory_mappings.deleteMany({
      where: { subcategory_id: id },
    });

    // Delete related groups first
    // Delete related groups first
    // Note: Using Supabase for bulk delete of groups to be efficient/safe
    // unless CategoryDAO has deleteGroupsBySubcategoryId. It currently doesn't.
    // I'll stick to Supabase for the bulk delete part.
    // Delete related groups first
    await prisma.groups.deleteMany({
      where: { subcategory_id: id },
    });

    // Delete the subcategory
    await CategoryDAO.deleteSubcategory(id);

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
    // Use Prisma through CategoryDAO - false for activeOnly to show all in admin
    const groups = await CategoryDAO.listGroups(false);

    res.status(200).json({
      success: true,
      groups,
      total: groups.length,
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

    // Use Prisma through CategoryDAO
    const groups = await CategoryDAO.getGroupsBySubcategoryId(subcategoryId);

    res.status(200).json({
      success: true,
      groups: groups,
      total: groups.length,
    });
  } catch (error) {
    console.error("Server error in getGroupsBySubcategory:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Add new group
export const addGroup = async (req, res) => {
  try {
    const groupData = { ...req.body };
    // Parse boolean fields
    if (groupData.active !== undefined)
      groupData.active = groupData.active === "true";
    if (groupData.featured !== undefined)
      groupData.featured = groupData.featured === "true";
    // Parse integer fields
    if (groupData.sort_order !== undefined)
      groupData.sort_order = parseInt(groupData.sort_order);

    let imageUrl = groupData.image_url;

    // Handle image upload if file is provided
    if (req.file) {
      console.log(
        "Uploading group image to Cloudinary:",
        req.file.originalname,
      );
      const uploadResult = await uploadToCloudinary(
        req.file.buffer,
        "groups",
        req.file.mimetype,
      );

      if (!uploadResult.success) {
        return res.status(400).json({
          success: false,
          error: `Failed to upload image: ${uploadResult.error}`,
        });
      }

      imageUrl = uploadResult.secure_url;
    }

    const data = await CategoryDAO.createGroup({
      ...groupData,
      image_url: imageUrl,
    });

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
    const updates = { ...req.body };
    // Parse boolean fields
    if (updates.active !== undefined)
      updates.active = updates.active === "true";
    if (updates.featured !== undefined)
      updates.featured = updates.featured === "true";
    // Parse integer fields
    if (updates.sort_order !== undefined)
      updates.sort_order = parseInt(updates.sort_order);

    let imageUrl = updates.image_url;

    // Handle image upload if file is provided
    if (req.file) {
      console.log(
        "Uploading group image to Cloudinary:",
        req.file.originalname,
      );
      // Fetch existing group to delete old image
      const existingGroup = await CategoryDAO.getGroupById(id);
      const uploadResult = await uploadToCloudinary(
        req.file.buffer,
        "groups",
        req.file.mimetype,
        existingGroup?.image_url ?? null,
      );

      if (!uploadResult.success) {
        return res.status(400).json({
          success: false,
          error: `Failed to upload image: ${uploadResult.error}`,
        });
      }

      imageUrl = uploadResult.secure_url;
    }

    // Whitelist allowed fields
    const allowedFields = [
      "name",
      "description",
      "featured",
      "icon",
      "active",
      "sort_order",
      "subcategory_id",
    ];
    const updateData = {};

    allowedFields.forEach((field) => {
      if (updates[field] !== undefined) {
        updateData[field] = updates[field];
      }
    });

    if (imageUrl) {
      updateData.image_url = imageUrl;
    }

    updateData.updated_at = new Date();

    const data = await CategoryDAO.updateGroup(id, updateData);

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
// Delete group
export const deleteGroup = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if group exists first to avoid P2025 errors
    const existingGroup = await prisma.groups.findUnique({
      where: { id },
    });

    if (!existingGroup) {
      console.log(`Group ${id} already deleted (idempotent check)`);
      return res.status(200).json({
        success: true,
        message: "Group deleted successfully",
      });
    }

    // Delete related product section groups first (explicit cleanup)
    await prisma.product_section_groups.deleteMany({
      where: { group_id: id },
    });

    await CategoryDAO.deleteGroup(id);

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
    // Use DAO's full hierarchy method - false for activeOnly to show all in admin
    const categories = await CategoryDAO.getFullHierarchy(false);
    // DAO returns structure that matches controller's expected output?
    // DAO returns: categories -> subcategories -> groups
    // The controller response format: `categories: hierarchy`
    // Hierarchy in original code:
    /*
     const hierarchy = categories.map((category) => ({
      ...category,
      subcategories: ...
    */
    // DAO `getFullHierarchy` matches this nested structure essentially.

    // We can just return the DAO result.

    /*
     const hierarchy = categories.map((category) => ({
      ...
    */
    // Since DAO already nests it, we don't need the manual mapping logic.

    res.status(200).json({
      success: true,
      categories: categories,
      total: categories.length,
    });
  } catch (error) {
    console.error("Server error in getCategoriesHierarchy:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get ALL categories with subcategories - direct Prisma query, no DAO layer, no filtering
// GET /api/categories/all-with-subcategories
export const getAllCategoriesWithSubs = async (req, res) => {
  try {
    const categories = await prisma.categories.findMany({
      include: {
        subcategories: {
          include: {
            groups: {
              orderBy: { sort_order: "asc" },
            },
          },
          orderBy: { sort_order: "asc" },
        },
      },
      orderBy: { name: "asc" },
    });

    res.status(200).json({
      success: true,
      categories: categories,
      total: categories.length,
    });
  } catch (error) {
    console.error("Error in getAllCategoriesWithSubs:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Get subcategory details with category info
export const getSubcategoryDetails = async (req, res) => {
  try {
    const { subcategoryId } = req.params;

    const subcategory = await prisma.subcategories.findUnique({
      where: {
        id: subcategoryId,
        active: true,
      },
      include: {
        categories: {
          select: {
            id: true,
            name: true,
            image_url: true,
            icon: true,
          },
        },
      },
    });

    if (!subcategory) {
      // Assuming not found or not active -> return null or handle error?
      // Original code returned single(), likely implies null if not found
      // But single() error handling was separate.
      // We'll return 404 if not found or empty if desired.
      // Keeping it consistent with data being returned.
    }

    res.status(200).json({
      success: true,
      subcategory: subcategory,
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
    const section = await prisma.product_sections.findUnique({
      where: { section_key: sectionKey },
      select: { id: true },
    });

    if (!section) {
      return res.status(404).json({ error: "Section not found" });
    }

    // Get subcategory mappings for this section with subcategory inclusion
    const mappings = await prisma.section_subcategory_mappings.findMany({
      where: {
        section_id: section.id,
        is_active: true,
        subcategory: {
          active: true,
        },
      },
      include: {
        subcategory: {
          include: {
            categories: {
              select: {
                id: true,
                name: true,
                image_url: true,
                icon: true,
              },
            },
          },
        },
      },
      orderBy: { display_order: "asc" },
    });

    // Flatten and format structure
    const orderedSubcategories = mappings
      .map((m) =>
        m.subcategory
          ? { ...m.subcategory, display_order: m.display_order }
          : null,
      )
      .filter(Boolean);

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
    const section = await prisma.product_sections.findUnique({
      where: { section_key: sectionKey },
      select: { id: true },
    });

    if (!section) {
      return res.status(404).json({ error: "Section not found" });
    }

    // Get category mappings
    const categoryMappings = await prisma.product_section_categories.findMany({
      where: { section_id: section.id },
      select: { category_id: true },
    });

    // Get subcategory mappings
    const subcategoryMappings =
      await prisma.section_subcategory_mappings.findMany({
        where: { section_id: section.id, is_active: true },
        select: { subcategory_id: true, display_order: true },
        orderBy: { display_order: "asc" },
      });

    // Get all categories and subcategories (active)
    const [allCategories, allSubcategories] = await Promise.all([
      prisma.categories.findMany({
        where: { active: true },
        orderBy: { name: "asc" },
      }),
      prisma.subcategories.findMany({
        where: { active: true },
        orderBy: { sort_order: "asc" },
      }),
    ]);

    const hasCategoryMappings = categoryMappings && categoryMappings.length > 0;
    const hasSubcategoryMappings =
      subcategoryMappings && subcategoryMappings.length > 0;

    let filteredCategories;

    if (hasCategoryMappings || hasSubcategoryMappings) {
      // Only return categories/subcategories that are mapped through admin dashboard
      const mappedCategoryIds = new Set(categoryMappings.map(m => m.category_id));
      const mappedSubcategoryIds = new Set(subcategoryMappings.map(m => m.subcategory_id));

      // Also include categories that have mapped subcategories
      const categoriesWithMappedSubs = allSubcategories
        .filter(sub => mappedSubcategoryIds.has(sub.id))
        .map(sub => sub.category_id);
      categoriesWithMappedSubs.forEach(id => mappedCategoryIds.add(id));

      // Filter categories to only mapped ones
      filteredCategories = allCategories
        .filter(category => mappedCategoryIds.has(category.id))
        .map((category) => {
          let subcategories;

          if (hasSubcategoryMappings) {
            // Only include subcategories that are mapped for this section
            subcategories = allSubcategories
              .filter(sub => sub.category_id === category.id && mappedSubcategoryIds.has(sub.id))
              .map(sub => {
                const mapping = subcategoryMappings.find(m => m.subcategory_id === sub.id);
                return {
                  ...sub,
                  display_order: mapping ? mapping.display_order : 999,
                };
              })
              .sort((a, b) => a.display_order - b.display_order);
          } else {
            // No subcategory mappings, show all active subs under mapped categories
            subcategories = allSubcategories.filter(
              sub => sub.category_id === category.id,
            );
          }

          return { ...category, subcategories };
        })
        .filter(category => category.subcategories.length > 0 || hasCategoryMappings);
    } else {
      // No mappings at all — return empty
      filteredCategories = [];
    }

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
