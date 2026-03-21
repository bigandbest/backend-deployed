import VideoCardDAO from "../dao/video-card.dao.js";
import { uploadToCloudinary } from "../services/uploadService.js";

/**
 * Video Card Controller - Routes for video card operations
 * Updated to use video-card.dao.js for database operations
 */

// Add a Video Card
export async function addVideoCard(req, res) {
  try {
    console.log("addVideoCard - req.body:", req.body);
    // console.log("addVideoCard - req.file:", req.file);

    const { title, description, video_url, thumbnail_url, active, position } =
      req.body;

    // Convert string boolean values to actual booleans
    const processedActive =
      active === "true" || active === true || active === undefined
        ? true
        : false;

    const thumbnailFile = req.file;
    let processedThumbnailUrl = thumbnail_url;

    // Upload thumbnail to Cloudinary if a file is provided
    if (thumbnailFile) {
      const uploadResult = await uploadToCloudinary(
        thumbnailFile.buffer,
        "video_thumbnails",
        thumbnailFile.mimetype
      );

      if (!uploadResult.success) {
        return res
          .status(400)
          .json({ success: false, error: uploadResult.error });
      }
      processedThumbnailUrl = uploadResult.secure_url;
    }

    // Insert video card into database using DAO
    const videoCard = await VideoCardDAO.create({
      title,
      description,
      video_url,
      thumbnail_url: processedThumbnailUrl,
      active: processedActive,
      position: position ? parseInt(position) : 0,
    });

    res.status(201).json({
      success: true,
      message: "Video card added successfully",
      videoCard,
    });
  } catch (error) {
    console.error("Error adding video card:", error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// Update a Video Card
export async function updateVideoCard(req, res) {
  try {
    const { id } = req.params;
    const parsedId = parseInt(id);

    if (isNaN(parsedId)) {
      return res.status(400).json({ success: false, error: "Invalid ID format" });
    }

    const { title, description, video_url, thumbnail_url, active, position } =
      req.body;

    const processedActive = active === "true" || active === true ? true : false;

    const thumbnailFile = req.file;
    let processedThumbnailUrl = thumbnail_url;

    // Upload new thumbnail if provided
    if (thumbnailFile) {
      // Get existing card to delete old thumbnail
      const existingCard = await VideoCardDAO.getById(parsedId);
      const uploadResult = await uploadToCloudinary(
        thumbnailFile.buffer,
        "video_thumbnails",
        thumbnailFile.mimetype,
        existingCard?.thumbnail_url ?? null,
      );

      if (!uploadResult.success) {
        return res
          .status(400)
          .json({ success: false, error: uploadResult.error });
      }
      processedThumbnailUrl = uploadResult.secure_url;
    }

    // Update video card in database using DAO
    const updateData = {
      title,
      description,
      video_url,
      active: processedActive,
      position: position ? parseInt(position) : 0,
    };

    if (processedThumbnailUrl) {
      updateData.thumbnail_url = processedThumbnailUrl;
    }

    const videoCard = await VideoCardDAO.update(parsedId, updateData);

    res.status(200).json({
      success: true,
      message: "Video card updated successfully",
      videoCard,
    });
  } catch (error) {
    console.error("Error updating video card:", error);
    if (error.code === 'P2025') {
      return res.status(404).json({ success: false, error: "Video card not found" });
    }
    res.status(500).json({ success: false, error: error.message });
  }
}

// Delete a Video Card
export async function deleteVideoCard(req, res) {
  try {
    const { id } = req.params;
    const parsedId = parseInt(id);

    if (isNaN(parsedId)) {
      return res.status(400).json({ success: false, error: "Invalid ID format" });
    }

    await VideoCardDAO.delete(parsedId);

    res.status(200).json({
      success: true,
      message: "Video card deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting video card:", error);
    if (error.code === 'P2025') {
      return res.status(404).json({ success: false, error: "Video card not found" });
    }
    res.status(500).json({ success: false, error: error.message });
  }
}

// Get all Video Cards
export async function getAllVideoCards(req, res) {
  try {
    const videoCards = await VideoCardDAO.getAll();

    res.status(200).json({
      success: true,
      videoCards,
    });
  } catch (error) {
    console.error("Error fetching video cards:", error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// Get active Video Cards
export async function getActiveVideoCards(req, res) {
  try {
    const videoCards = await VideoCardDAO.getActive();

    res.status(200).json({
      success: true,
      videoCards,
    });
  } catch (error) {
    console.error("Error fetching active video cards:", error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// Get a single Video Card by ID
export async function getVideoCardById(req, res) {
  try {
    const { id } = req.params;
    const parsedId = parseInt(id);

    if (isNaN(parsedId)) {
      return res.status(400).json({ success: false, error: "Invalid ID format" });
    }

    const videoCard = await VideoCardDAO.getById(parsedId);

    if (!videoCard) {
      return res
        .status(404)
        .json({ success: false, error: "Video card not found" });
    }

    res.status(200).json({
      success: true,
      videoCard,
    });
  } catch (error) {
    console.error("Error fetching video card:", error);
    res.status(500).json({ success: false, error: error.message });
  }
}
