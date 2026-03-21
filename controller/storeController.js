import { uploadToCloudinary } from "../services/uploadService.js";
import StoreDAO from "../dao/store.dao.js";

// Add Store
export async function addStore(req, res) {
  try {
    const { name, link } = req.body;
    const imageFile = req.file; // multer middleware for file upload

    let imageUrl = null;

    if (imageFile) {
      console.log(
        "Uploading store image to Cloudinary:",
        imageFile.originalname,
      );
      const uploadResult = await uploadToCloudinary(
        imageFile.buffer,
        "Store",
        imageFile.mimetype,
      );

      if (!uploadResult.success) {
        return res
          .status(400)
          .json({ success: false, error: uploadResult.error });
      }

      imageUrl = uploadResult.secure_url;
    }

    const data = await StoreDAO.create({ name, link, image: imageUrl });

    res.status(201).json({ success: true, store: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// Update Store
export async function updateStore(req, res) {
  try {
    const { id } = req.params;
    const { name, link } = req.body;
    const imageFile = req.file;

    let updateData = { name, link };

    if (imageFile) {
      // Get existing store to delete old image
      const existingStore = await StoreDAO.getById(id);
      console.log(
        "Uploading store update image to Cloudinary:",
        imageFile.originalname,
      );
      const uploadResult = await uploadToCloudinary(
        imageFile.buffer,
        "Store",
        imageFile.mimetype,
        existingStore?.image ?? null,
      );

      if (!uploadResult.success) {
        return res
          .status(400)
          .json({ success: false, error: uploadResult.error });
      }

      updateData.image = uploadResult.secure_url;
    }

    const data = await StoreDAO.update(id, updateData);

    res.json({ success: true, store: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// Delete Store
export async function deleteStore(req, res) {
  try {
    const { id } = req.params;

    await StoreDAO.delete(id);

    res.json({ success: true, message: "Store deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// View All Stores
export async function getAllStores(req, res) {
  try {
    const data = await StoreDAO.listAll();

    res.json({ success: true, data: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
