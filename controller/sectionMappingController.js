import prisma from "../config/prisma.js";

// ========== SUBCATEGORY-SECTION MAPPING FUNCTIONS ==========

// Add subcategories to a section
export const addSubcategoriesToSection = async (req, res) => {
  try {
    const { sectionId } = req.params;
    const { subcategory_ids, display_orders } = req.body;

    if (
      !subcategory_ids ||
      !Array.isArray(subcategory_ids) ||
      subcategory_ids.length === 0
    ) {
      return res.status(400).json({
        error: "subcategory_ids array is required and must not be empty",
      });
    }

    // Verify section exists
    const section = await prisma.product_sections.findUnique({
      where: { id: parseInt(sectionId) },
      select: { id: true },
    });

    if (!section) {
      return res.status(404).json({ error: "Product section not found" });
    }

    // Create subcategory mappings
    // Prisma doesn't have a direct upsertMany with onConflict support in the same way,
    // but since we want to upsert, we can iterate or use a transaction with upserts.
    // For simplicity and correctness with display_orders, we'll iterate.

    const upsertPromises = subcategory_ids.map((subcategory_id, index) => {
      const display_order =
        display_orders && display_orders[index] !== undefined
          ? display_orders[index]
          : index;

      // We need a unique constraint to upsert properly.
      // The schema likely doesn't have a named composite unique constraint we can reference easily
      // without knowing its exact name, but usually it works if @unique is defined in schema.
      // Looking at schema, it doesn't seem to have @@unique([section_id, subcategory_id]) explicitly defined in the file snippet I saw?
      // Wait, looking at lines 896-909 of provided schema, no unique constraint is listed at table level.
      // But the Supabase code used `upsert` on conflict `section_id,subcategory_id`.
      // This suggests there IS a unique constraint.
      // If Prisma doesn't know about it, we might fail.
      // However, safe bet is to check if exists, update if so, create if not.

      return prisma.section_subcategory_mappings
        .findFirst({
          where: {
            section_id: parseInt(sectionId),
            subcategory_id: subcategory_id,
          },
        })
        .then((existing) => {
          if (existing) {
            return prisma.section_subcategory_mappings.update({
              where: { id: existing.id },
              data: {
                display_order,
                is_active: true,
              },
            });
          } else {
            return prisma.section_subcategory_mappings.create({
              data: {
                section_id: parseInt(sectionId),
                subcategory_id: subcategory_id,
                display_order,
                is_active: true,
              },
            });
          }
        });
    });

    const results = await Promise.all(upsertPromises);

    res.status(200).json({
      success: true,
      data: results,
      message: `${subcategory_ids.length} subcategory/subcategories mapped to section successfully`,
    });
  } catch (error) {
    console.error("Error adding subcategories to section:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Remove a subcategory from a section
export const removeSubcategoryFromSection = async (req, res) => {
  try {
    const { sectionId, subcategoryId } = req.params;

    await prisma.section_subcategory_mappings.deleteMany({
      where: {
        section_id: parseInt(sectionId),
        subcategory_id: subcategoryId,
      },
    });

    res.status(200).json({
      success: true,
      message: "Subcategory removed from section successfully",
    });
  } catch (error) {
    console.error("Error removing subcategory from section:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Bulk update subcategory mappings for a section
export const updateSubcategoryMappings = async (req, res) => {
  try {
    const { sectionId } = req.params;
    const { mappings } = req.body;

    if (!mappings || !Array.isArray(mappings)) {
      return res.status(400).json({
        error: "mappings array is required",
      });
    }

    // Verify section exists
    const section = await prisma.product_sections.findUnique({
      where: { id: parseInt(sectionId) },
      select: { id: true },
    });

    if (!section) {
      return res.status(404).json({ error: "Product section not found" });
    }

    // Transaction to ensure atomicity
    await prisma.$transaction(async (tx) => {
      // First, delete all existing mappings for this section
      await tx.section_subcategory_mappings.deleteMany({
        where: { section_id: parseInt(sectionId) },
      });

      // If mappings array is empty, we're done
      if (mappings.length === 0) {
        return;
      }

      // Filter invalid IDs and deduplicate by subcategory_id
      const uniqueMappingsMap = new Map();

      mappings.forEach((mapping) => {
        const subId = mapping.subcategory_id;
        if (subId && subId !== "undefined" && subId !== "null") {
          uniqueMappingsMap.set(subId, {
            section_id: parseInt(sectionId),
            subcategory_id: subId,
            display_order: mapping.display_order || 0,
            is_active:
              mapping.is_active !== undefined ? mapping.is_active : true,
          });
        }
      });

      const newMappings = Array.from(uniqueMappingsMap.values());

      if (newMappings.length > 0) {
        await tx.section_subcategory_mappings.createMany({
          data: newMappings,
        });
      }
    });

    // Fetch the updated mappings to return
    const updatedMappings = await prisma.section_subcategory_mappings.findMany({
      where: { section_id: parseInt(sectionId) },
    });

    res.status(200).json({
      success: true,
      data: updatedMappings,
      message: "Subcategory mappings updated successfully",
    });
  } catch (error) {
    console.error("Error updating subcategory mappings:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get all subcategory mappings for a section
export const getSubcategoryMappingsForSection = async (req, res) => {
  try {
    const { sectionId } = req.params;

    const data = await prisma.section_subcategory_mappings.findMany({
      where: { section_id: parseInt(sectionId) },
      orderBy: { display_order: "asc" },
      select: {
        id: true,
        subcategory_id: true,
        display_order: true,
        is_active: true,
        created_at: true,
        updated_at: true,
      },
    });

    res.status(200).json({
      success: true,
      data,
      total: data.length,
    });
  } catch (error) {
    console.error("Error fetching subcategory mappings:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Update display order for subcategory mappings
export const updateMappingDisplayOrder = async (req, res) => {
  try {
    const { sectionId } = req.params;
    const { mappings } = req.body;

    if (!mappings || !Array.isArray(mappings)) {
      return res.status(400).json({
        error:
          "mappings array is required (array of {subcategory_id, display_order})",
      });
    }

    // Update each mapping's display order
    const updatePromises = mappings.map((mapping) =>
      prisma.section_subcategory_mappings.updateMany({
        where: {
          section_id: parseInt(sectionId),
          subcategory_id: mapping.subcategory_id,
        },
        data: { display_order: mapping.display_order },
      }),
    );

    await Promise.all(updatePromises);

    res.status(200).json({
      success: true,
      message: "Display order updated successfully",
    });
  } catch (error) {
    console.error("Error updating display order:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Toggle mapping active status
export const toggleMappingStatus = async (req, res) => {
  try {
    const { sectionId, subcategoryId } = req.params;

    // Find mapping
    const currentMapping = await prisma.section_subcategory_mappings.findFirst({
      where: {
        section_id: parseInt(sectionId),
        subcategory_id: subcategoryId,
      },
    });

    if (!currentMapping) {
      return res.status(404).json({ error: "Mapping not found" });
    }

    // Toggle status
    const newStatus = !currentMapping.is_active;

    const updatedMapping = await prisma.section_subcategory_mappings.update({
      where: { id: currentMapping.id },
      data: { is_active: newStatus },
    });

    res.status(200).json({
      success: true,
      data: updatedMapping,
      message: `Mapping ${newStatus ? "activated" : "deactivated"} successfully`,
    });
  } catch (error) {
    console.error("Error toggling mapping status:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get sections for a specific subcategory
export const getSectionsForSubcategory = async (req, res) => {
  try {
    const { subcategoryId } = req.params;

    const data = await prisma.section_subcategory_mappings.findMany({
      where: { subcategory_id: subcategoryId },
      include: {
        section: {
          select: {
            id: true,
            section_key: true,
            section_name: true,
            is_active: true,
            component_name: true,
          },
        },
      },
      orderBy: { display_order: "asc" },
    });

    // Transform data
    const sections = data.map((item) => ({
      mapping_id: item.id,
      display_order: item.display_order,
      is_active: item.is_active,
      mapped_at: item.created_at,
      ...item.section,
    }));

    res.status(200).json({
      success: true,
      data: sections,
    });
  } catch (error) {
    console.error("Error fetching sections for subcategory:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get categories for a specific section (supports ID or section_key)
export const getCategoriesForSection = async (req, res) => {
  try {
    const { sectionId } = req.params;
    let resolvedSectionId = parseInt(sectionId);

    // If sectionId is not a number, try to look it up as a section_key
    if (isNaN(resolvedSectionId)) {
      const section = await prisma.product_sections.findUnique({
        where: { section_key: sectionId },
        select: { id: true },
      });

      if (!section) {
        return res.status(404).json({
          error: "Product section not found",
        });
      }
      resolvedSectionId = section.id;
    }

    // Fetch subcategories mappings with active status
    const mappings = await prisma.section_subcategory_mappings.findMany({
      where: {
        section_id: resolvedSectionId,
        is_active: true,
      },
      select: { subcategory_id: true },
    });

    if (!mappings || mappings.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        count: 0,
      });
    }

    // Extract IDs
    const subcategoryIds = mappings.map((m) => m.subcategory_id);

    // Fetch subcategories and their parent categories
    const subcategories = await prisma.subcategories.findMany({
      where: { id: { in: subcategoryIds } },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            image_url: true,
            // image field not found in previous check but 'image_url' confirmed in other usages or inferred.
            // Wait, schema says `image_url` for `categories`.
            // Original code queried `image`. Let's use `image_url`.
          },
        },
      },
    });

    // Extract unique categories
    const categoriesMap = new Map();

    subcategories.forEach((item) => {
      const category = item.category;
      if (category && !categoriesMap.has(category.id)) {
        categoriesMap.set(category.id, category);
      }
    });

    const categories = Array.from(categoriesMap.values());

    res.status(200).json({
      success: true,
      data: categories,
      count: categories.length,
    });
  } catch (error) {
    console.error("Error fetching categories for section:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
