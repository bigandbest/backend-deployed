import { supabase } from "../config/supabaseClient.js";

// ========== SUBCATEGORY-SECTION MAPPING FUNCTIONS ==========

// Add subcategories to a section
export const addSubcategoriesToSection = async (req, res) => {
    try {
        const { sectionId } = req.params;
        const { subcategory_ids, display_orders } = req.body;

        if (!subcategory_ids || !Array.isArray(subcategory_ids) || subcategory_ids.length === 0) {
            return res.status(400).json({
                error: "subcategory_ids array is required and must not be empty",
            });
        }

        // Verify section exists
        const { data: section, error: sectionError } = await supabase
            .from("product_sections")
            .select("id")
            .eq("id", sectionId)
            .single();

        if (sectionError || !section) {
            return res.status(404).json({ error: "Product section not found" });
        }

        // Create subcategory mappings
        const mappings = subcategory_ids.map((subcategory_id, index) => ({
            section_id: parseInt(sectionId),
            subcategory_id: subcategory_id,
            display_order: display_orders && display_orders[index] !== undefined
                ? display_orders[index]
                : index,
            is_active: true,
        }));

        const { data, error } = await supabase
            .from("section_subcategory_mappings")
            .upsert(mappings, { onConflict: "section_id,subcategory_id" })
            .select();

        if (error) {
            console.error("Supabase error:", error);
            return res.status(500).json({ error: error.message });
        }

        res.status(200).json({
            success: true,
            data,
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

        const { error } = await supabase
            .from("section_subcategory_mappings")
            .delete()
            .eq("section_id", sectionId)
            .eq("subcategory_id", subcategoryId);

        if (error) {
            console.error("Supabase error:", error);
            return res.status(500).json({ error: error.message });
        }

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
        const { data: section, error: sectionError } = await supabase
            .from("product_sections")
            .select("id")
            .eq("id", sectionId)
            .single();

        if (sectionError || !section) {
            return res.status(404).json({ error: "Product section not found" });
        }

        // First, delete all existing mappings for this section
        const { error: deleteError } = await supabase
            .from("section_subcategory_mappings")
            .delete()
            .eq("section_id", sectionId);

        if (deleteError) {
            console.error("Error deleting existing mappings:", deleteError);
            return res.status(500).json({ error: deleteError.message });
        }

        // If mappings array is empty, we're done (all mappings removed)
        if (mappings.length === 0) {
            return res.status(200).json({
                success: true,
                message: "All subcategory mappings removed from section",
            });
        }

        // Filter invalid IDs and deduplicate by subcategory_id
        const uniqueMappingsMap = new Map();

        mappings.forEach(mapping => {
            const subId = mapping.subcategory_id;
            if (subId && subId !== 'undefined' && subId !== 'null') {
                uniqueMappingsMap.set(subId, {
                    section_id: parseInt(sectionId),
                    subcategory_id: subId,
                    display_order: mapping.display_order || 0,
                    is_active: mapping.is_active !== undefined ? mapping.is_active : true,
                });
            }
        });

        const newMappings = Array.from(uniqueMappingsMap.values());

        const { data, error } = await supabase
            .from("section_subcategory_mappings")
            .insert(newMappings)
            .select();

        if (error) {
            console.error("Supabase error:", error);
            return res.status(500).json({ error: error.message });
        }

        res.status(200).json({
            success: true,
            data,
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

        const { data, error } = await supabase
            .from("section_subcategory_mappings")
            .select(`
        id,
        subcategory_id,
        display_order,
        is_active,
        created_at,
        updated_at
      `)
            .eq("section_id", sectionId)
            .order("display_order", { ascending: true });

        if (error) {
            console.error("Supabase error:", error);
            return res.status(500).json({ error: error.message });
        }

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
                error: "mappings array is required (array of {subcategory_id, display_order})",
            });
        }

        // Update each mapping's display order
        const updates = mappings.map((mapping) =>
            supabase
                .from("section_subcategory_mappings")
                .update({ display_order: mapping.display_order })
                .eq("section_id", sectionId)
                .eq("subcategory_id", mapping.subcategory_id)
        );

        const results = await Promise.all(updates);

        // Check for errors
        const errorResults = results.filter((result) => result.error);
        if (errorResults.length > 0) {
            console.error("Supabase errors:", errorResults);
            return res.status(500).json({
                error: "Failed to update some mappings",
                details: errorResults.map((r) => r.error.message),
            });
        }

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

        // Get current status
        const { data: currentMapping, error: fetchError } = await supabase
            .from("section_subcategory_mappings")
            .select("is_active")
            .eq("section_id", sectionId)
            .eq("subcategory_id", subcategoryId)
            .single();

        if (fetchError) {
            console.error("Supabase error:", fetchError);
            return res.status(404).json({ error: "Mapping not found" });
        }

        // Toggle status
        const newStatus = !currentMapping.is_active;

        const { data, error } = await supabase
            .from("section_subcategory_mappings")
            .update({ is_active: newStatus })
            .eq("section_id", sectionId)
            .eq("subcategory_id", subcategoryId)
            .select()
            .single();

        if (error) {
            console.error("Supabase error:", error);
            return res.status(500).json({ error: error.message });
        }

        res.status(200).json({
            success: true,
            data,
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

        const { data, error } = await supabase
            .from("section_subcategory_mappings")
            .select(`
        id,
        display_order,
        is_active,
        created_at,
        product_sections:section_id (
          id,
          section_key,
          section_name,
          is_active,
          component_name
        )
      `)
            .eq("subcategory_id", subcategoryId)
            .order("display_order", { ascending: true });

        if (error) {
            console.error("Supabase error:", error);
            return res.status(500).json({ error: error.message });
        }

        // Transform data
        const sections = data.map(item => ({
            mapping_id: item.id,
            display_order: item.display_order,
            is_active: item.is_active,
            mapped_at: item.created_at,
            ...item.product_sections
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
