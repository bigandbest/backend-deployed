import { uploadToCloudinary } from "../services/uploadService.js";
import smallPromoCardDao from "../dao/small-promo-card.dao.js";
import redis from "../config/redis.js";

const PROMO_CARD_CACHE_TTL = parseInt(process.env.PROMO_CARD_CACHE_TTL || '600', 10);
const CACHE_KEYS = { all: 'small-promo-cards:all' };
const invalidatePromoCardCache = async () => {
    await redis.del(CACHE_KEYS.all).catch(() => {});
};

// Add a Small Promo Card
export async function addCard(req, res) {
    try {
        const { link, display_order, is_active, link_type, resource_id, sub_resource_id } = req.body;
        const imageFile = req.file;
        let imageUrl = null;

        if (!imageFile) {
            return res.status(400).json({ success: false, error: "Image is required" });
        }

        // Upload image to Cloudinary
        const uploadResult = await uploadToCloudinary(
            imageFile.buffer,
            "small-promo-cards",
            imageFile.mimetype
        );

        if (!uploadResult.success) {
            return res.status(400).json({ success: false, error: uploadResult.error });
        }
        imageUrl = uploadResult.secure_url;

        const card = await smallPromoCardDao.create({
            image_url: imageUrl,
            link,
            display_order: display_order ? parseInt(display_order) : 0,
            is_active: is_active === "true" || is_active === true,
            link_type: link_type || 'external',
            resource_id: resource_id || null,
            sub_resource_id: sub_resource_id || null
        });

        invalidatePromoCardCache();

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
        const parsedId = parseInt(id); // Fix: Parse ID to integer
        if (isNaN(parsedId)) {
            return res.status(400).json({ success: false, error: "Invalid ID format" });
        }

        const { link, display_order, is_active, link_type, resource_id, sub_resource_id } = req.body;
        const imageFile = req.file;

        let updateData = {};
        if (link !== undefined) updateData.link = link;
        if (display_order !== undefined) updateData.display_order = parseInt(display_order);
        if (is_active !== undefined) updateData.is_active = is_active === "true" || is_active === true;

        // Fix: correctly handle null/empty string for resource_ids
        if (link_type !== undefined) updateData.link_type = link_type;
        if (resource_id !== undefined) updateData.resource_id = resource_id || null;
        if (sub_resource_id !== undefined) updateData.sub_resource_id = sub_resource_id || null;

        // Update image if provided
        if (imageFile) {
            // Get existing card to delete old image
            const existingCard = await smallPromoCardDao.getById(parsedId);
            const uploadResult = await uploadToCloudinary(
                imageFile.buffer,
                "small-promo-cards",
                imageFile.mimetype,
                existingCard?.image_url ?? null,
            );

            if (!uploadResult.success) {
                return res.status(400).json({ success: false, error: uploadResult.error });
            }
            updateData.image_url = uploadResult.secure_url;
        }

        const card = await smallPromoCardDao.update(parsedId, updateData);

        invalidatePromoCardCache();

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
        const parsedId = parseInt(id); // Fix: Parse ID to integer
        if (isNaN(parsedId)) {
            return res.status(400).json({ success: false, error: "Invalid ID format" });
        }

        await smallPromoCardDao.delete(parsedId);
        invalidatePromoCardCache();
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
        const cached = await redis.get(CACHE_KEYS.all).catch(() => null);
        if (cached) return res.json(JSON.parse(cached));

        // Fetch all cards (no active filter)
        const cards = await smallPromoCardDao.list({ active: undefined });
        const payload = { success: true, cards };
        redis.setex(CACHE_KEYS.all, PROMO_CARD_CACHE_TTL, JSON.stringify(payload)).catch(() => {});
        res.json(payload);
    } catch (err) {
        console.error("Error in getAllCards:", err);
        res.status(500).json({ success: false, error: err.message });
    }
}
