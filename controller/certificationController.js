import { uploadToCloudinary } from "../services/uploadService.js";
import CertificationDAO from "../dao/certification.dao.js";

// Get all certifications (for admin)
export const getAllCertifications = async (req, res) => {
  try {
    const data = await CertificationDAO.listCertifications(false);

    res.status(200).json({ success: true, certifications: data });
  } catch (err) {
    console.error("Error fetching certifications:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// Get active certifications (for frontend)
export const getActiveCertifications = async (req, res) => {
  try {
    const data = await CertificationDAO.listCertifications(true);

    res.status(200).json({ success: true, certifications: data });
  } catch (err) {
    console.error("Error fetching active certifications:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// Add certification
export const addCertification = async (req, res) => {
  try {
    const { name, description, active, sort_order } = req.body;
    const imageFile = req.file;

    if (!name || !imageFile) {
      return res
        .status(400)
        .json({ success: false, error: "Name and Image are required" });
    }

    // Upload image
    console.log(
      "Uploading certification image to Cloudinary:",
      imageFile.originalname,
    );
    const uploadResult = await uploadToCloudinary(
      imageFile.buffer,
      "addBanner",
      imageFile.mimetype,
    );

    if (!uploadResult.success) {
      return res
        .status(500)
        .json({ success: false, error: uploadResult.error });
    }

    const image_url = uploadResult.secure_url;

    const data = await CertificationDAO.createCertification({
      name,
      image_url,
      description,
      active: active === "true" || active === true,
      sort_order: parseInt(sort_order || 0),
    });

    res.status(201).json({ success: true, certification: data });
  } catch (err) {
    console.error("Error adding certification:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// Update certification
export const updateCertification = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, active, sort_order } = req.body;
    const imageFile = req.file;

    const updates = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (active !== undefined)
      updates.active = active === "true" || active === true;
    if (sort_order !== undefined) updates.sort_order = sort_order;

    console.log(
      "Uploading certification update image to Cloudinary:",
      imageFile.originalname,
    );
    const uploadResult = await uploadToCloudinary(
      imageFile.buffer,
      "addBanner",
      imageFile.mimetype,
    );

    if (!uploadResult.success) {
      return res
        .status(500)
        .json({ success: false, error: uploadResult.error });
    }

    updates.image_url = uploadResult.secure_url;

    const data = await CertificationDAO.updateCertification(id, updates);

    res.status(200).json({ success: true, certification: data });
  } catch (err) {
    console.error("Error updating certification:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// Delete certification
export const deleteCertification = async (req, res) => {
  try {
    const { id } = req.params;
    await CertificationDAO.deleteCertification(id);

    res
      .status(200)
      .json({ success: true, message: "Certification deleted successfully" });
  } catch (err) {
    console.error("Error deleting certification:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};
