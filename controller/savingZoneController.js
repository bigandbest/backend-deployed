import { supabase } from "../config/supabaseClient.js";

// --- Helper Functions ---

async function uploadImage(file, bucketName) {
    const fileExt = file.originalname.split(".").pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;

    const { error: uploadError } = await supabase.storage.from(bucketName).upload(fileName, file.buffer, { contentType: file.mimetype, upsert: true });
    if (uploadError) throw new Error(uploadError.message);

    const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(fileName);
    return urlData.publicUrl;
}

// --- Saving Zone Logic ---

// Add a Saving Zone
export async function addSavingZone(req, res) {
    try {
        const { name } = req.body;
        const imageFile = req.file;
        let imageUrl = null;

        if (imageFile) {
            imageUrl = await uploadImage(imageFile, "savingZone");
        }

        const { data, error } = await supabase.from("saving_zone").insert([{ name, image_url: imageUrl }]).select().single();
        if (error) return res.status(400).json({ success: false, error: error.message });
        res.status(201).json({ success: true, savingZone: data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}

// Update a Saving Zone
export async function updateSavingZone(req, res) {
    try {
        const { id } = req.params;
        const { name } = req.body;
        const imageFile = req.file;
        let updateData = { name };

        if (imageFile) {
            updateData.image_url = await uploadImage(imageFile, "savingZone");
        }

        const { data, error } = await supabase.from("saving_zone").update(updateData).eq("id", id).select().single();
        if (error) return res.status(400).json({ success: false, error: error.message });
        res.json({ success: true, savingZone: data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}

// Delete a Saving Zone
export async function deleteSavingZone(req, res) {
    try {
        const { id } = req.params;
        const { error } = await supabase.from("saving_zone").delete().eq("id", id);
        if (error) return res.status(400).json({ success: false, error: error.message });
        res.json({ success: true, message: "Saving Zone deleted successfully" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}

// View All Saving Zones
export async function getAllSavingZones(req, res) {
    try {
        const { data, error } = await supabase.from("saving_zone").select("*");
        if (error) return res.status(400).json({ success: false, error: error.message });
        res.json({ success: true, savingZones: data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}

// View a Single Saving Zone
export async function getSavingZoneById(req, res) {
    try {
        const { id } = req.params;
        const { data, error } = await supabase.from("saving_zone").select("*").eq("id", id).single();
        if (error) return res.status(400).json({ success: false, error: error.message });
        if (!data) return res.status(404).json({ success: false, error: "Saving Zone not found" });
        res.json({ success: true, savingZone: data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}

// --- Saving Zone Group Logic ---

// Add a Saving Zone Group
export async function addSavingZoneGroup(req, res) {
    try {
        const { name, saving_zone_id } = req.body;
        let imageUrl = null;
        const imageFile = req.files ? req.files.find(file => file.fieldname === 'image_url') : null;

        if (imageFile) {
            imageUrl = await uploadImage(imageFile, "savingZoneGroup");
        }

        if (saving_zone_id) {
            const { data: savingZoneData, error: savingZoneError } = await supabase.from("saving_zone").select("id").eq("id", saving_zone_id).single();
            if (savingZoneError || !savingZoneData) return res.status(404).json({ success: false, error: "Saving Zone not found." });
        }

        const { data, error } = await supabase.from("saving_zone_group").insert([{ name, image_url: imageUrl, saving_zone_id }]).select().single();
        if (error) throw error;
        res.status(201).json({ success: true, savingZoneGroup: data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}

// Map a Saving Zone to a Saving Zone Group
export async function mapSavingZoneToGroup(req, res) {
    try {
        const { groupId, savingZoneId } = req.body;
        const { data: groupData, error: groupError } = await supabase.from("saving_zone_group").select("id").eq("id", groupId).single();
        if (groupError || !groupData) return res.status(404).json({ success: false, error: "Saving Zone Group not found." });

        const { data: savingZoneData, error: savingZoneError } = await supabase.from("saving_zone").select("id").eq("id", savingZoneId).single();
        if (savingZoneError || !savingZoneData) return res.status(404).json({ success: false, error: "Saving Zone not found." });

        const { data, error } = await supabase.from("saving_zone_group").update({ saving_zone_id: savingZoneId }).eq("id", groupId).select().single();
        if (error) throw error;
        res.status(200).json({ success: true, message: "Saving Zone mapped to group successfully.", savingZoneGroup: data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}

// Update a Saving Zone Group
export async function updateSavingZoneGroup(req, res) {
    try {
        const { id } = req.params;
        const { name, saving_zone_id } = req.body;
        let updateData = { name };
        const imageFile = req.files ? req.files.find(file => file.fieldname === 'image_url') : null;

        if (imageFile) {
            updateData.image_url = await uploadImage(imageFile, "savingZoneGroup");
        }

        if (saving_zone_id) updateData.saving_zone_id = saving_zone_id;

        const { data, error } = await supabase.from("saving_zone_group").update(updateData).eq("id", id).select().single();
        if (error) throw error;
        res.status(200).json({ success: true, savingZoneGroup: data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}

// Delete a Saving Zone Group
export async function deleteSavingZoneGroup(req, res) {
    try {
        const { id } = req.params;
        const { error } = await supabase.from("saving_zone_group").delete().eq("id", id);
        if (error) throw error;
        res.status(204).json({ success: true, message: "Saving Zone Group deleted successfully." });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}

// Get all Saving Zone Groups
export async function getAllSavingZoneGroups(req, res) {
    try {
        const { data, error } = await supabase.from("saving_zone_group").select("*");
        if (error) throw error;
        res.status(200).json({ success: true, savingZoneGroups: data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}

// Get one Saving Zone Group by ID
export async function getSavingZoneGroupById(req, res) {
    try {
        const { id } = req.params;
        const { data, error } = await supabase.from("saving_zone_group").select("*").eq("id", id).single();
        if (error) throw error;
        if (!data) return res.status(404).json({ success: false, error: "Saving Zone Group not found." });
        res.status(200).json({ success: true, savingZoneGroup: data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}

// Get all Saving Zone Groups for a specific Saving Zone
export async function getGroupsBySavingZoneId(req, res) {
    try {
        const { savingZoneId } = req.params;
        const { data, error } = await supabase.from("saving_zone_group").select("*").eq("saving_zone_id", savingZoneId);
        if (error) throw error;
        res.status(200).json({ success: true, savingZoneGroups: data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}

// --- Saving Zone Group Product Mapping Logic ---

// Map a single product to a Saving Zone Group using IDs
export async function mapProductToSavingZoneGroup(req, res) {
    try {
        const { product_id, saving_zone_group_id } = req.body;
        if (!product_id || !saving_zone_group_id) return res.status(400).json({ error: 'product_id and saving_zone_group_id are required.' });

        const { error } = await supabase.from('saving_zone_group_product').insert([{ product_id, saving_zone_group_id }]);

        if (error) {
            if (error.code === '23505') return res.status(409).json({ error: 'Mapping already exists.' });
            return res.status(500).json({ error: error.message });
        }

        res.status(201).json({ message: 'Product mapped to Saving Zone Group successfully.' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
}

// Remove a product from a Saving Zone Group
export async function removeProductFromSavingZoneGroup(req, res) {
    try {
        const { product_id, saving_zone_group_id } = req.body;
        const { error } = await supabase.from('saving_zone_group_product').delete().eq('product_id', product_id).eq('saving_zone_group_id', saving_zone_group_id);
        if (error) return res.status(500).json({ error: error.message });
        res.status(200).json({ message: 'Mapping removed successfully.' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
}

// Get all Saving Zone Groups stocking a product
export async function getSavingZoneGroupsForProduct(req, res) {
    try {
        const { product_id } = req.params;
        const { data, error } = await supabase.from('saving_zone_group_product').select('saving_zone_group_id, saving_zone_group (id, name, image_url)').eq('product_id', product_id);
        if (error) return res.status(500).json({ error: error.message });
        res.status(200).json(data);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
}

// Get all products in a Saving Zone Group
export async function getProductsForSavingZoneGroup(req, res) {
    try {
        const { saving_zone_group_id } = req.params;
        const { data, error } = await supabase.from('saving_zone_group_product').select('product_id, products (id, name, price, rating, image, category, discount, uom)').eq('saving_zone_group_id', saving_zone_group_id);
        if (error) return res.status(500).json({ error: error.message });
        res.status(200).json(data);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
}

// Bulk map products by names and Saving Zone Group name
export async function bulkMapByNames(req, res) {
    try {
        const { saving_zone_group_name, product_names } = req.body;
        if (!saving_zone_group_name || !product_names || !Array.isArray(product_names)) return res.status(400).json({ error: 'saving_zone_group_name and product_names[] are required.' });

        const { data: savingZoneGroupData, error: savingZoneGroupError } = await supabase.from('saving_zone_group').select('id').eq('name', saving_zone_group_name).single();
        if (savingZoneGroupError || !savingZoneGroupData) return res.status(404).json({ error: 'Saving Zone Group not found.' });

        const { data: products, error: productError } = await supabase.from('products').select('id, name').in('name', product_names);
        if (productError || !products.length) return res.status(404).json({ error: 'No matching products found.' });

        const inserts = products.map(p => ({ product_id: p.id, saving_zone_group_id: savingZoneGroupData.id }));
        const { error: insertError } = await supabase.from('saving_zone_group_product').insert(inserts, { upsert: false });

        if (insertError && insertError.code !== '23505') return res.status(500).json({ error: insertError.message });

        res.status(201).json({
            message: `Mapped ${products.length} products to Saving Zone Group "${saving_zone_group_name}".`,
            mapped_products: products.map(p => p.name)
        });
    } catch (err) {
        console.error('Bulk map error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
}