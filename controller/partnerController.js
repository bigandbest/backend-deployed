import { supabase } from "../config/supabaseClient.js";

// Get all partners (for admin)
export const getAllPartners = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from("partners")
            .select("*")
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: false });

        if (error) throw error;

        res.status(200).json({ success: true, partners: data });
    } catch (err) {
        console.error("Error fetching partners:", err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// Get active partners (for frontend)
export const getActivePartners = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from("partners")
            .select("*")
            .eq("active", true)
            .order("sort_order", { ascending: true });

        if (error) throw error;

        res.status(200).json({ success: true, partners: data });
    } catch (err) {
        console.error("Error fetching active partners:", err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// Add partner
export const addPartner = async (req, res) => {
    try {
        const { name, active, sort_order } = req.body;
        const imageFile = req.file;

        if (!name || !imageFile) {
            return res.status(400).json({ success: false, error: "Name and Image are required" });
        }

        // Upload image
        const fileExt = imageFile.originalname.split(".").pop();
        const fileName = `partner_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
            .from("addBanner")
            .upload(fileName, imageFile.buffer, {
                contentType: imageFile.mimetype,
                upsert: true,
            });

        if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

        const { data: urlData } = supabase.storage.from("addBanner").getPublicUrl(fileName);
        const image_url = urlData.publicUrl;

        const { data, error } = await supabase
            .from("partners")
            .insert([{
                name,
                image_url,
                active: active === 'true' || active === true,
                sort_order: sort_order || 0
            }])
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({ success: true, partner: data });
    } catch (err) {
        console.error("Error adding partner:", err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// Update partner
export const updatePartner = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, active, sort_order } = req.body;
        const imageFile = req.file;

        const updates = { updated_at: new Date().toISOString() };
        if (name !== undefined) updates.name = name;
        if (active !== undefined) updates.active = active === 'true' || active === true;
        if (sort_order !== undefined) updates.sort_order = sort_order;

        if (imageFile) {
            const fileExt = imageFile.originalname.split(".").pop();
            const fileName = `partner_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
            const { error: uploadError } = await supabase.storage
                .from("addBanner")
                .upload(fileName, imageFile.buffer, {
                    contentType: imageFile.mimetype,
                    upsert: true,
                });

            if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

            const { data: urlData } = supabase.storage.from("addBanner").getPublicUrl(fileName);
            updates.image_url = urlData.publicUrl;
        }

        const { data, error } = await supabase
            .from("partners")
            .update(updates)
            .eq("id", id)
            .select()
            .single();

        if (error) throw error;

        res.status(200).json({ success: true, partner: data });
    } catch (err) {
        console.error("Error updating partner:", err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// Delete partner
export const deletePartner = async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from("partners")
            .delete()
            .eq("id", id);

        if (error) throw error;

        res.status(200).json({ success: true, message: "Partner deleted successfully" });
    } catch (err) {
        console.error("Error deleting partner:", err);
        res.status(500).json({ success: false, error: err.message });
    }
};
