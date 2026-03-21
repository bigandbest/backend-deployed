import { uploadToCloudinary } from "../services/uploadService.js";
import BrandDAO from "../dao/brand.dao.js";

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

    // Upload image to Cloudinary if a file is provided
    if (imageFile) {
      console.log(
        "Uploading brand image to Cloudinary:",
        imageFile.originalname,
      );
      const uploadResult = await uploadToCloudinary(
        imageFile.buffer,
        "brand",
        imageFile.mimetype,
      );

      if (!uploadResult.success) {
        return res.status(400).json({
          success: false,
          error: `Failed to upload image: ${uploadResult.error}`,
        });
      }

      imageUrl = uploadResult.secure_url;
    }

    // Insert new Brand using DAO
    const data = await BrandDAO.createBrand({
      name: name.trim(),
      image_url: imageUrl,
    });

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
      // Fetch existing brand to get the old image URL for cleanup
      const existingBrand = await BrandDAO.getBrandById(id);

      console.log(
        "Uploading brand update image to Cloudinary:",
        imageFile.originalname,
      );
      const uploadResult = await uploadToCloudinary(
        imageFile.buffer,
        "brand",
        imageFile.mimetype,
        existingBrand?.image_url ?? null,  // ← delete old image first
      );

      if (!uploadResult.success) {
        return res.status(400).json({
          success: false,
          error: `Failed to upload image: ${uploadResult.error}`,
        });
      }

      updateData.image_url = uploadResult.secure_url;
    }

    // Update the record using DAO
    const data = await BrandDAO.updateBrand(id, updateData);

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

    // Check if brand exists first using DAO
    const existingBrand = await BrandDAO.getBrandById(id);

    if (!existingBrand) {
      return res.status(404).json({
        success: false,
        error: "Brand not found",
      });
    }

    // Delete the brand using DAO
    await BrandDAO.deleteBrand(id);

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
    // Using DAO to fetch brands with default pagination
    const { items, total } = await BrandDAO.listBrands({ limit: 1000 });

    res.json({
      success: true,
      count: total,
      brands: items,
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

    const data = await BrandDAO.getBrandById(id);

    if (!data) {
      return res.status(404).json({
        success: false,
        error: "Brand not found",
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
