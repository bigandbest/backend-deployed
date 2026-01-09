import { supabase } from "../config/supabaseClient.js";

// Add a Small Promo Card
export async function addCard(req, res) {
    try {
        const { link, display_order, is_active, link_type, resource_id, sub_resource_id } = req.body;
        const imageFile = req.file;
        let imageUrl = null;

        if (!imageFile) {
            return res.status(400).json({ success: false, error: "Image is required" });
        }

        // Upload image to Supabase Storage
        const fileExt = imageFile.originalname.split(".").pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
            .from("addBanner") // Reusing banner bucket
            .upload(fileName, imageFile.buffer, {
                contentType: imageFile.mimetype,
                upsert: true,
            });

        if (uploadError) {
            return res.status(400).json({ success: false, error: uploadError.message });
        }

        const { data: urlData } = supabase.storage
            .from("addBanner")
            .getPublicUrl(fileName);
        imageUrl = urlData.publicUrl;

        const { data, error } = await supabase
            .from("small_promo_cards")
            .insert([
                {
                    image_url: imageUrl,
                    link,
                    display_order: display_order || 0,
                    is_active: is_active === "true" || is_active === true,
                    link_type: link_type || 'external',
                    resource_id: resource_id || null,
                    sub_resource_id: sub_resource_id || null
                },
            ])
            .select()
            .single();

        if (error) {
            return res.status(400).json({ success: false, error: error.message });
        }

        res.status(201).json({ success: true, card: data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}

// Update a Small Promo Card
export async function updateCard(req, res) {
    try {
        const { id } = req.params;
        const { link, display_order, is_active, link_type, resource_id, sub_resource_id } = req.body;
        const imageFile = req.file;

        let updateData = {};
        if (link !== undefined) updateData.link = link;
        if (display_order !== undefined) updateData.display_order = display_order;
        if (is_active !== undefined) updateData.is_active = is_active === "true" || is_active === true;
        if (link_type !== undefined) updateData.link_type = link_type;
        if (resource_id !== undefined) updateData.resource_id = resource_id;
        if (sub_resource_id !== undefined) updateData.sub_resource_id = sub_resource_id;

        // Update image if provided
        if (imageFile) {
            const fileExt = imageFile.originalname.split(".").pop();
            const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
            const { error: uploadError } = await supabase.storage
                .from("addBanner")
                .upload(fileName, imageFile.buffer, {
                    contentType: imageFile.mimetype,
                    upsert: true,
                });

            if (uploadError) {
                return res.status(400).json({ success: false, error: uploadError.message });
            }

            const { data: urlData } = supabase.storage
                .from("addBanner")
                .getPublicUrl(fileName);
            updateData.image_url = urlData.publicUrl;
        }

        const { data, error } = await supabase
            .from("small_promo_cards")
            .update(updateData)
            .eq("id", id)
            .select()
            .single();

        if (error) {
            return res.status(400).json({ success: false, error: error.message });
        }

        res.json({ success: true, card: data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}

// Delete a Small Promo Card
export async function deleteCard(req, res) {
    try {
        const { id } = req.params;
        const { error } = await supabase.from("small_promo_cards").delete().eq("id", id);
        if (error) {
            return res.status(400).json({ success: false, error: error.message });
        }
        res.json({ success: true, message: "Card deleted successfully" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}

// Get All Small Promo Cards
export async function getAllCards(req, res) {
    try {
        const { data, error } = await supabase
            .from("small_promo_cards")
            .select("*")
            .order("display_order", { ascending: true });

        if (error) {
            return res.status(400).json({ success: false, error: error.message });
        }
        res.json({ success: true, cards: data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}
