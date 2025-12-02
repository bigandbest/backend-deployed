import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

// Create Supabase client with service role key for admin operations
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Add Brand
export async function addBrand(req, res) {
  try {
    const { name } = req.body;
    const imageFile = req.file;
    let imageUrl = null;

    // Validate input
    if (!name || name.trim() === "") {
      return res.status(400).json({
        success: false,
        error: "Brand name is required",
      });
    }

    // Upload image to Supabase Storage if a file is provided
    if (imageFile) {
      const fileExt = imageFile.originalname.split(".").pop();
      const fileName = `${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("brand")
        .upload(fileName, imageFile.buffer, {
          contentType: imageFile.mimetype,
          upsert: true,
        });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        return res.status(400).json({
          success: false,
          error: `Failed to upload image: ${uploadError.message}`,
        });
      }

      const { data: urlData } = supabase.storage
        .from("brand")
        .getPublicUrl(fileName);

      imageUrl = urlData.publicUrl;
    }

    // Insert new Brand into the 'brand' table
    const { data, error } = await supabase
      .from("brand")
      .insert([{ name: name.trim(), image_url: imageUrl }])
      .select()
      .single();

    if (error) {
      console.error("Database insert error:", error);
      return res.status(400).json({
        success: false,
        error: `Failed to create brand: ${error.message}`,
      });
    }

    res.status(201).json({
      success: true,
      message: "Brand created successfully",
      brand: data,
    });
  } catch (err) {
    console.error("Unexpected error in addBrand:", err);
    res.status(500).json({
      success: false,
      error: `Internal server error: ${err.message}`,
    });
  }
}

// Edit Brand
export async function editBrand(req, res) {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const imageFile = req.file;

    // Validate input
    if (!id) {
      return res.status(400).json({
        success: false,
        error: "Brand ID is required",
      });
    }

    if (!name || name.trim() === "") {
      return res.status(400).json({
        success: false,
        error: "Brand name is required",
      });
    }

    let updateData = { name: name.trim() };

    // Update image if a new one is provided
    if (imageFile) {
      const fileExt = imageFile.originalname.split(".").pop();
      const fileName = `${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("brand")
        .upload(fileName, imageFile.buffer, {
          contentType: imageFile.mimetype,
          upsert: true,
        });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        return res.status(400).json({
          success: false,
          error: `Failed to upload image: ${uploadError.message}`,
        });
      }

      const { data: urlData } = supabase.storage
        .from("brand")
        .getPublicUrl(fileName);

      updateData.image_url = urlData.publicUrl;
    }

    // Update the record in the 'brand' table
    const { data, error } = await supabase
      .from("brand")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Database update error:", error);
      return res.status(400).json({
        success: false,
        error: `Failed to update brand: ${error.message}`,
      });
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        error: "Brand not found",
      });
    }

    res.json({
      success: true,
      message: "Brand updated successfully",
      brand: data,
    });
  } catch (err) {
    console.error("Unexpected error in editBrand:", err);
    res.status(500).json({
      success: false,
      error: `Internal server error: ${err.message}`,
    });
  }
}

// Delete Brand
export async function deleteBrand(req, res) {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: "Brand ID is required",
      });
    }

    // Check if brand exists first
    const { data: existingBrand, error: fetchError } = await supabase
      .from("brand")
      .select("id, name")
      .eq("id", id)
      .single();

    if (fetchError || !existingBrand) {
      return res.status(404).json({
        success: false,
        error: "Brand not found",
      });
    }

    // Delete the brand
    const { error } = await supabase.from("brand").delete().eq("id", id);

    if (error) {
      console.error("Database delete error:", error);
      return res.status(400).json({
        success: false,
        error: `Failed to delete brand: ${error.message}`,
      });
    }

    res.json({
      success: true,
      message: `Brand "${existingBrand.name}" deleted successfully`,
    });
  } catch (err) {
    console.error("Unexpected error in deleteBrand:", err);
    res.status(500).json({
      success: false,
      error: `Internal server error: ${err.message}`,
    });
  }
}

// View All Brands
export async function getAllBrands(req, res) {
  try {
    const { data, error } = await supabase
      .from("brand")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      console.error("Database fetch error:", error);
      return res.status(400).json({
        success: false,
        error: `Failed to fetch brands: ${error.message}`,
      });
    }

    res.json({
      success: true,
      count: data.length,
      brands: data,
    });
  } catch (err) {
    console.error("Unexpected error in getAllBrands:", err);
    res.status(500).json({
      success: false,
      error: `Internal server error: ${err.message}`,
    });
  }
}

// View a Single Brand
export async function getSingleBrand(req, res) {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: "Brand ID is required",
      });
    }

    const { data, error } = await supabase
      .from("brand")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      console.error("Database fetch error:", error);
      if (error.code === "PGRST116") {
        return res.status(404).json({
          success: false,
          error: "Brand not found",
        });
      }
      return res.status(400).json({
        success: false,
        error: `Failed to fetch brand: ${error.message}`,
      });
    }

    res.json({
      success: true,
      brand: data,
    });
  } catch (err) {
    console.error("Unexpected error in getSingleBrand:", err);
    res.status(500).json({
      success: false,
      error: `Internal server error: ${err.message}`,
    });
  }
}
