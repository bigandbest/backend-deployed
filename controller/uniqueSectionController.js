import { supabase } from "../config/supabaseClient.js";

// Add Unique Section
export async function addUniqueSection(req, res) {
  try {
    const { name, section_type } = req.body; // Changed to section_type
    const imageFile = req.file;
    let imageUrl = null;

    // Upload image to Supabase Storage if a file is provided
    if (imageFile) {
      const fileExt = imageFile.originalname.split(".").pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from("uniqueSection").upload(fileName, imageFile.buffer, { contentType: imageFile.mimetype, upsert: true });

      if (uploadError) return res.status(400).json({ success: false, error: uploadError.message });
      const { data: urlData } = supabase.storage.from("uniqueSection").getPublicUrl(fileName);
      imageUrl = urlData.publicUrl;
    }

    // Insert new Unique Section into the 'unique_section' table
    // Changed field to section_type
    const { data, error } = await supabase.from("unique_section").insert([{ name, image_url: imageUrl, section_type }]).select().single();
    if (error) { console.error(error); return res.status(400).json({ success: false, error: error.message }); }
    res.status(201).json({ success: true, uniqueSection: data });
  } catch (err) {
    console.error("Add Unique Section Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
}

// Edit Unique Section
export async function editUniqueSection(req, res) {
  try {
    const { id } = req.params;
    // Changed to section_type
    const { name, section_type } = req.body;
    const imageFile = req.file;
    // Changed to section_type
    let updateData = { name, section_type };

    // Update image if a new one is provided
    if (imageFile) {
      const fileExt = imageFile.originalname.split(".").pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from("uniqueSection").upload(fileName, imageFile.buffer, { contentType: imageFile.mimetype, upsert: true });
      if (uploadError) return res.status(400).json({ success: false, error: uploadError.message });
      const { data: urlData } = supabase.storage.from("uniqueSection").getPublicUrl(fileName);
      updateData.image_url = urlData.publicUrl;
    }

    // Update the record in the 'unique_section' table
    const { data, error } = await supabase.from("unique_section").update(updateData).eq("id", id).select().single();
    if (error) return res.status(400).json({ success: false, error: error.message });
    res.json({ success: true, uniqueSection: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// Delete Unique Section
export async function deleteUniqueSection(req, res) {
  try {
    const { id } = req.params;
    const { error } = await supabase.from("unique_section").delete().eq("id", id);
    if (error) return res.status(400).json({ success: false, error: error.message });
    res.json({ success: true, message: "Unique Section deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// View All Unique Sections
export async function getAllUniqueSections(req, res) {
  try {
    const { data, error } = await supabase.from("unique_section").select("*");
    if (error) return res.status(400).json({ success: false, error: error.message });
    res.json({ success: true, uniqueSections: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// View a Single Unique Section
export async function getSingleUniqueSection(req, res) {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from("unique_section")
      .select("*")
      .eq("id", id)
      .single();

    if (error) return res.status(400).json({ success: false, error: error.message });
    if (!data) return res.status(404).json({ success: false, error: "Unique Section not found" });

    res.json({ success: true, uniqueSection: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// In uniqueSectionController.js
export async function getUniqueSectionsByType(req, res) {
  try {
    const { section_type } = req.params;

    const { data, error } = await supabase
      .from("unique_section")
      .select("*")
      .eq("section_type", section_type);

    if (error) return res.status(400).json({ success: false, error: error.message });

    res.json({ success: true, uniqueSections: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// --- Unique Section Product Mapping Logic (Merged) ---

// Map a single product to a Unique Section using IDs
export const mapProductToUniqueSection = async (req, res) => {
  try {
    const { product_id, unique_section_id } = req.body;

    if (!product_id || !unique_section_id) {
      return res.status(400).json({ error: 'product_id and unique_section_id are required.' });
    }

    const { error } = await supabase
      .from('unique_section_product')
      .insert([{ product_id, unique_section_id }]);

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Mapping already exists.' });
      }
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json({ message: 'Product mapped to Unique Section successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

// Remove a product from a Unique Section
export const removeProductFromUniqueSection = async (req, res) => {
  try {
    const { product_id, unique_section_id } = req.body;

    const { error } = await supabase
      .from('unique_section_product')
      .delete()
      .eq('product_id', product_id)
      .eq('unique_section_id', unique_section_id);

    if (error) return res.status(500).json({ error: error.message });

    res.status(200).json({ message: 'Mapping removed successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

// Get all Unique Sections stocking a product
export const getUniqueSectionsForProduct = async (req, res) => {
  try {
    const { product_id } = req.params;

    const { data, error } = await supabase
      .from('unique_section_product')
      .select('unique_section_id, unique_section (id, name, image_url, section_type)')
      .eq('product_id', product_id);

    if (error) return res.status(500).json({ error: error.message });

    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

// Get all products from a Unique Section
export const getProductsForUniqueSection = async (req, res) => {
  try {
    const { unique_section_id } = req.params;

    const { data, error } = await supabase
      .from('unique_section_product')
      .select('product_id, products (id, name, price, rating, image, category)')
      .eq('unique_section_id', unique_section_id);

    if (error) return res.status(500).json({ error: error.message });

    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

// Bulk map products by names and Unique Section name
export const bulkMapUniqueSectionByNames = async (req, res) => {
  try {
    const { section_name, product_names } = req.body;

    if (!section_name || !product_names || !Array.isArray(product_names)) {
      return res.status(400).json({ error: 'section_name and product_names[] are required.' });
    }

    const { data: sectionData, error: sectionError } = await supabase
      .from('unique_section')
      .select('id')
      .eq('name', section_name)
      .single();

    if (sectionError || !sectionData) {
      return res.status(404).json({ error: 'Unique Section not found.' });
    }

    const { data: products, error: productError } = await supabase
      .from('products')
      .select('id, name')
      .in('name', product_names);

    if (productError || !products.length) {
      return res.status(404).json({ error: 'No matching products found.' });
    }

    const inserts = products.map(p => ({
      product_id: p.id,
      unique_section_id: sectionData.id
    }));

    const { error: insertError } = await supabase
      .from('unique_section_product')
      .insert(inserts, { upsert: false });

    if (insertError && insertError.code !== '23505') {
      return res.status(500).json({ error: insertError.message });
    }

    res.status(201).json({
      message: `Mapped ${products.length} products to Unique Section "${section_name}".`,
      mapped_products: products.map(p => p.name)
    });

  } catch (err) {
    console.error('Bulk map error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
};
