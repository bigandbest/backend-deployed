import { supabase } from "../config/supabaseClient.js";
import quickPickDao from "../dao/quick-pick.dao.js";
import quickPickGroupDao from "../dao/quick-pick-group.dao.js";
import quickPickGroupProductDao from "../dao/quickpick-group-product.dao.js";
import productDao from "../dao/product.dao.js";

// --- Quick Pick Controllers ---

// Add a Quick Pick
export async function addQuickPick(req, res) {
    try {
        const { name } = req.body;
        const imageFile = req.file;
        let imageUrl = null;

        // Upload image to Supabase Storage if a file is provided
        if (imageFile) {
            const fileExt = imageFile.originalname.split(".").pop();
            const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
            const { error: uploadError } = await supabase.storage.from("quickPick").upload(fileName, imageFile.buffer, { contentType: imageFile.mimetype, upsert: true });

            if (uploadError) return res.status(400).json({ success: false, error: uploadError.message });
            const { data: urlData } = supabase.storage.from("quickPick").getPublicUrl(fileName);
            imageUrl = urlData.publicUrl;
        }

        // Insert new Quick Pick into the 'quick_pick' table
        const data = await quickPickDao.create({ name, image_url: imageUrl });
        res.status(201).json({ success: true, quickPick: data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}

// Update a Quick Pick
export async function updateQuickPick(req, res) {
    try {
        const { id } = req.params;
        const { name } = req.body;
        const imageFile = req.file;
        let updateData = { name };

        // Update image if a new one is provided
        if (imageFile) {
            const fileExt = imageFile.originalname.split(".").pop();
            const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
            const { error: uploadError } = await supabase.storage.from("quickPick").upload(fileName, imageFile.buffer, { contentType: imageFile.mimetype, upsert: true });
            if (uploadError) return res.status(400).json({ success: false, error: uploadError.message });
            const { data: urlData } = supabase.storage.from("quickPick").getPublicUrl(fileName);
            updateData.image_url = urlData.publicUrl;
        }

        // Update the record in the 'quick_pick' table
        const data = await quickPickDao.update(id, updateData);
        res.json({ success: true, quickPick: data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}

// Delete a Quick Pick
export async function deleteQuickPick(req, res) {
    try {
        const { id } = req.params;
        // The foreign key constraint with ON DELETE CASCADE will handle deleting the mapping entries in product_group
        await quickPickDao.delete(id);
        res.json({ success: true, message: "Quick Pick deleted successfully" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}

// View All Quick Picks
export async function getAllQuickPicks(req, res) {
    try {
        const data = await quickPickDao.list();
        res.json({ success: true, quickPicks: data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}

// View a Single Quick Pick
export async function getQuickPickById(req, res) {
    try {
        const { id } = req.params;
        const data = await quickPickDao.getById(id);

        if (!data) return res.status(404).json({ success: false, error: "Quick Pick not found" });

        res.json({ success: true, quickPick: data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}

// --- Quick Pick Group Controllers ---

// Helper function to upload an image to Supabase Storage
async function uploadImage(file, bucketName) {
    const fileExt = file.originalname.split(".").pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;

    const { error: uploadError } = await supabase.storage.from(bucketName).upload(fileName, file.buffer, { contentType: file.mimetype, upsert: true });
    if (uploadError) throw new Error(uploadError.message);

    const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(fileName);
    return urlData.publicUrl;
}

// Add a new Quick Pick Group and optionally map a Quick Pick to it
export async function addQuickPickGroup(req, res) {
    try {
        const { name, quick_pick_id } = req.body;
        let imageUrl = null;

        const imageFile = req.files ? req.files.find(file => file.fieldname === 'image_url') : null;

        if (imageFile) {
            imageUrl = await uploadImage(imageFile, "quickPickGroup");
        }

        if (quick_pick_id) {
            const quickPickData = await quickPickDao.getById(quick_pick_id);
            if (!quickPickData) {
                return res.status(404).json({ success: false, error: "Quick Pick not found." });
            }
        }

        const data = await quickPickGroupDao.create({ name, image_url: imageUrl, quick_pick_id });
        res.status(201).json({ success: true, quickPickGroup: data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}

// Map a Quick Pick to a Quick Pick Group
export async function mapQuickPickToGroup(req, res) {
    try {
        const { groupId, quickPickId } = req.body;

        const groupData = await quickPickGroupDao.getById(groupId);
        if (!groupData) return res.status(404).json({ success: false, error: "Quick Pick Group not found." });

        const quickPickData = await quickPickDao.getById(quickPickId);
        if (!quickPickData) return res.status(404).json({ success: false, error: "Quick Pick not found." });

        const data = await quickPickGroupDao.update(groupId, { quick_pick_id: quickPickId });

        res.status(200).json({ success: true, message: "Quick Pick mapped to group successfully.", quickPickGroup: data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}

// Update a Quick Pick Group
export async function updateQuickPickGroup(req, res) {
    try {
        const { id } = req.params;
        const { name, quick_pick_id } = req.body;
        let updateData = { name };

        const imageFile = req.files ? req.files.find(file => file.fieldname === 'image_url') : null;

        if (imageFile) {
            const imageUrl = await uploadImage(imageFile, "quickPickGroup");
            updateData.image_url = imageUrl;
        }

        if (quick_pick_id) {
            updateData.quick_pick_id = quick_pick_id;
        }

        const data = await quickPickGroupDao.update(id, updateData);

        res.status(200).json({ success: true, quickPickGroup: data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}

// Delete a Quick Pick Group
export async function deleteQuickPickGroup(req, res) {
    try {
        const { id } = req.params;
        await quickPickGroupDao.delete(id);
        res.status(204).json({ success: true, message: "Quick Pick Group deleted successfully." });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}

// Get all Quick Pick Groups
export async function getAllQuickPickGroups(req, res) {
    try {
        const data = await quickPickGroupDao.listAll();
        res.status(200).json({ success: true, quickPickGroups: data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}

// Get one Quick Pick Group by ID
export async function getQuickPickGroupById(req, res) {
    try {
        const { id } = req.params;
        const data = await quickPickGroupDao.getById(id);
        if (!data) return res.status(404).json({ success: false, error: "Quick Pick Group not found." });
        res.status(200).json({ success: true, quickPickGroup: data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}

// Get all Quick Pick Groups for a specific Quick Pick
export async function getGroupsByQuickPickId(req, res) {
    try {
        const { quickPickId } = req.params;
        const data = await quickPickGroupDao.listByQuickPick(quickPickId);
        res.status(200).json({ success: true, quickPickGroups: data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}

// --- Quick Pick Group Product Mapping Controllers ---

// Map a single product to a Quick Pick Group
export const mapProductToQuickPickGroup = async (req, res) => {
    try {
        const { product_id, quick_pick_group_id } = req.body;
        if (!product_id || !quick_pick_group_id) {
            return res.status(400).json({ error: 'product_id and quick_pick_group_id are required.' });
        }
        await quickPickGroupProductDao.link(quick_pick_group_id, product_id);
        res.status(201).json({ message: 'Product mapped to Quick Pick Group successfully.' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
};

// Remove a product from a Quick Pick Group
export const removeProductFromQuickPickGroup = async (req, res) => {
    try {
        const { product_id, quick_pick_group_id } = req.body;
        await quickPickGroupProductDao.deleteByMapping(product_id, quick_pick_group_id);
        res.status(200).json({ message: 'Mapping removed successfully.' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
};

// Get all Quick Pick Groups stocking a product
export const getQuickPickGroupsForProduct = async (req, res) => {
    try {
        const { product_id } = req.params;
        const data = await quickPickGroupProductDao.listGroupsByProduct(product_id);
        res.status(200).json(data);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
};

// Get all products in a Quick Pick Group
export const getProductsForQuickPickGroup = async (req, res) => {
    try {
        const { quick_pick_group_id } = req.params;
        const data = await quickPickGroupProductDao.listProductsByGroup(quick_pick_group_id);
        res.status(200).json(data);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
};

// Bulk map products by names and Quick Pick Group name
export const bulkMapByNames = async (req, res) => {
    try {
        const { quick_pick_group_name, product_names } = req.body;
        if (!quick_pick_group_name || !product_names || !Array.isArray(product_names)) {
            return res.status(400).json({ error: 'quick_pick_group_name and product_names[] are required.' });
        }
        const quickPickGroupData = await quickPickGroupDao.getByName(quick_pick_group_name);
        if (!quickPickGroupData) {
            return res.status(404).json({ error: 'Quick Pick Group not found.' });
        }
        const products = await productDao.getProductsByNames(product_names);
        if (!products || !products.length) {
            return res.status(404).json({ error: 'No matching products found.' });
        }
        const inserts = products.map(p => ({
            product_id: p.id,
            quick_pick_group_id: quickPickGroupData.id
        }));
        await quickPickGroupProductDao.createMany(inserts);
        res.status(201).json({
            message: `Mapped ${products.length} products to Quick Pick Group "${quick_pick_group_name}".`,
            mapped_products: products.map(p => p.name)
        });
    } catch (err) {
        console.error('Bulk map error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
};