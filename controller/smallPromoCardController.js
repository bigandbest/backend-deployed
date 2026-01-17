import { supabase } from "../config/supabaseClient.js";
import smallPromoCardDao from "../dao/small-promo-card.dao.js";

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

        const card = await smallPromoCardDao.create({
            image_url: imageUrl,
            link,
            display_order: display_order ? parseInt(display_order) : 0,
            is_active: is_active === "true" || is_active === true,
            link_type: link_type || 'external',
            resource_id: resource_id || null,
            sub_resource_id: sub_resource_id || null
        });

        res.status(201).json({ success: true, card });
    } catch (err) {
        console.error("Error in addCard:", err);
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
        if (display_order !== undefined) updateData.display_order = parseInt(display_order);
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

        const card = await smallPromoCardDao.update(id, updateData);

        res.json({ success: true, card });
    } catch (err) {
        console.error("Error in updateCard:", err);
        if (err.code === 'P2025') { // Record to update not found
            return res.status(404).json({ success: false, error: "Card not found" });
        }
        res.status(500).json({ success: false, error: err.message });
    }
}

// Delete a Small Promo Card
export async function deleteCard(req, res) {
    try {
        const { id } = req.params;
        await smallPromoCardDao.delete(id);
        res.json({ success: true, message: "Card deleted successfully" });
    } catch (err) {
        console.error("Error in deleteCard:", err);
        if (err.code === 'P2025') {
            return res.status(404).json({ success: false, error: "Card not found" });
        }
        res.status(500).json({ success: false, error: err.message });
    }
}

// Get All Small Promo Cards
export async function getAllCards(req, res) {
    try {
        // Fetch all cards (no active filter)
        const cards = await smallPromoCardDao.list({ active: undefined });
        res.json({ success: true, cards });
    } catch (err) {
        console.error("Error in getAllCards:", err);
        res.status(500).json({ success: false, error: err.message });
    }
}
