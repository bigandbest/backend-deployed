import { supabase } from "../config/supabaseClient.js";

// Get About Us content
export const getAboutContent = async (req, res) => {
    try {
        // Fetch the most recently updated row
        const { data, error } = await supabase
            .from("about_us_content")
            .select("*")
            .order("updated_at", { ascending: false })
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 is no rows returned, which is fine
            throw error;
        }

        res.status(200).json({ success: true, content: data || {} });
    } catch (err) {
        console.error("Error fetching about content:", err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// Update About Us content (Upsert)
export const updateAboutContent = async (req, res) => {
    try {
        const { id, title, subtitle, heading, content } = req.body;
        const imageFile = req.file;

        const updates = {
            updated_at: new Date().toISOString(),
            title,
            subtitle,
            heading,
            content
        };

        if (id) {
            updates.id = id;
        }

        if (imageFile) {
            const fileExt = imageFile.originalname.split(".").pop();
            const fileName = `about_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
            const { error: uploadError } = await supabase.storage
                .from("addBanner")
                .upload(fileName, imageFile.buffer, {
                    contentType: imageFile.mimetype,
                    upsert: true,
                });

            if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

            const { data: urlData } = supabase.storage.from("addBanner").getPublicUrl(fileName);
            updates.banner_image_url = urlData.publicUrl;
        }

        // If no ID is provided, insert a new row (or could logic to update existing single row)
        // We will try to update if ID exists, otherwise insert
        let data, error;

        if (id) {
            ({ data, error } = await supabase
                .from("about_us_content")
                .update(updates)
                .eq("id", id)
                .select()
                .single());
        } else {
            // Check if any row exists to avoid duplicates if we want singleton behavior
            const { data: existing } = await supabase.from("about_us_content").select("id").limit(1).single();
            if (existing) {
                ({ data, error } = await supabase
                    .from("about_us_content")
                    .update(updates)
                    .eq("id", existing.id)
                    .select()
                    .single());
            } else {
                ({ data, error } = await supabase
                    .from("about_us_content")
                    .insert([updates])
                    .select()
                    .single());
            }
        }

        if (error) throw error;

        res.status(200).json({ success: true, content: data });
    } catch (err) {
        console.error("Error updating about content:", err);
        res.status(500).json({ success: false, error: err.message });
    }
};
