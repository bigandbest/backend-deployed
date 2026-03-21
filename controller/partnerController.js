import { uploadToCloudinary } from "../services/uploadService.js";
import partnerDao from "../dao/partner.dao.js";

// Get all partners (for admin)
export const getAllPartners = async (req, res) => {
  try {
    const partners = await partnerDao.list({ active: undefined });
    res.status(200).json({ success: true, partners });
  } catch (err) {
    console.error("Error fetching partners:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// Get active partners (for frontend)
export const getActivePartners = async (req, res) => {
  try {
    const partners = await partnerDao.list({ active: true });
    res.status(200).json({ success: true, partners });
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
      return res
        .status(400)
        .json({ success: false, error: "Name and Image are required" });
    }

    // Upload image
    console.log(
      "Uploading partner image to Cloudinary:",
      imageFile.originalname,
    );
    const uploadResult = await uploadToCloudinary(
      imageFile.buffer,
      "addBanner",
      imageFile.mimetype,
    );

    if (!uploadResult.success) {
      throw new Error(`Upload failed: ${uploadResult.error}`);
    }

    const image_url = uploadResult.secure_url;

    const partner = await partnerDao.create({
      name,
      image_url,
      active: active === "true" || active === true,
      sort_order: parseInt(sort_order) || 0,
    });

    res.status(201).json({ success: true, partner });
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

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (active !== undefined)
      updates.active = active === "true" || active === true;
    if (sort_order !== undefined) updates.sort_order = parseInt(sort_order);

    if (imageFile) {
      // Get existing partner to delete old image
      const existingPartner = await partnerDao.getById(id);
      console.log(
        "Uploading partner update image to Cloudinary:",
        imageFile.originalname,
      );
      const uploadResult = await uploadToCloudinary(
        imageFile.buffer,
        "addBanner",
        imageFile.mimetype,
        existingPartner?.image_url ?? null,
      );

      if (!uploadResult.success) {
        throw new Error(`Upload failed: ${uploadResult.error}`);
      }

      updates.image_url = uploadResult.secure_url;
    }

    const partner = await partnerDao.update(id, updates);
    res.status(200).json({ success: true, partner });
  } catch (err) {
    console.error("Error updating partner:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// Delete partner
export const deletePartner = async (req, res) => {
  try {
    const { id } = req.params;
    await partnerDao.delete(id);
    res
      .status(200)
      .json({ success: true, message: "Partner deleted successfully" });
  } catch (err) {
    console.error("Error deleting partner:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};
