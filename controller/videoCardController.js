import VideoCardDAO from "../dao/video-card.dao.js";
import { supabase } from "../config/supabaseClient.js";
import crypto from "crypto";

/**
 * Video Card Controller - Routes for video card operations
 * Updated to use video-card.dao.js for database operations
 */

// Add a Video Card
export async function addVideoCard(req, res) {
  try {
    console.log("addVideoCard - req.body:", req.body);
    console.log("addVideoCard - req.files:", req.files);

    const { title, description, video_url, thumbnail_url, active, position } =
      req.body;

    // Convert string boolean values to actual booleans
    const processedActive =
      active === "true" || active === true || active === undefined
        ? true
        : false;

    // For now, disable file upload since we're testing text fields
    const thumbnailFile = null;
    let processedThumbnailUrl = thumbnail_url;

    // Upload thumbnail to Supabase Storage if a file is provided
    if (thumbnailFile) {
      const fileExt = thumbnailFile.originalname.split(".").pop();
      const fileName = `video_thumb_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from("video_thumbnails")
        .upload(fileName, thumbnailFile.buffer, {
          contentType: thumbnailFile.mimetype,
          upsert: true,
        });

      if (uploadError)
        return res
          .status(400)
          .json({ success: false, error: uploadError.message });

      const { data: urlData } = supabase.storage
        .from("video_thumbnails")
        .getPublicUrl(fileName);
      processedThumbnailUrl = urlData.publicUrl;
    }

    // Insert video card into database using DAO
    const videoCard = await VideoCardDAO.create({
      title,
      description,
      video_url,
      thumbnail_url: processedThumbnailUrl,
      active: processedActive,
      position: position || 0,
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
    console.log("updateVideoCard - req.body:", req.body);
    console.log("updateVideoCard - req.params:", req.params);
    console.log("updateVideoCard - req.files:", req.files);

    const { id } = req.params;
    const { title, description, video_url, thumbnail_url, active, position } =
      req.body;

    if (!title && !description && !video_url) {
      return res.status(400).json({
        success: false,
        error:
          "Request body is empty or malformed. Please check that form data is being sent correctly.",
      });
    }

    const processedActive = active === "true" || active === true ? true : false;

    // For now, disable file upload since we're testing text fields
    const thumbnailFile = null;
    let processedThumbnailUrl = thumbnail_url;

    // Upload new thumbnail if provided
    if (thumbnailFile) {
      const fileExt = thumbnailFile.originalname.split(".").pop();
      const fileName = `video_thumb_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from("video_thumbnails")
        .upload(fileName, thumbnailFile.buffer, {
          contentType: thumbnailFile.mimetype,
          upsert: true,
        });

      if (uploadError)
        return res
          .status(400)
          .json({ success: false, error: uploadError.message });

      const { data: urlData } = supabase.storage
        .from("video_thumbnails")
        .getPublicUrl(fileName);
      processedThumbnailUrl = urlData.publicUrl;
    }

    // Update video card in database using DAO
    const videoCard = await VideoCardDAO.update(id, {
      title,
      description,
      video_url,
      thumbnail_url: processedThumbnailUrl,
      active: processedActive,
      position,
    });

    res.status(200).json({
      success: true,
      message: "Video card updated successfully",
      videoCard,
    });
  } catch (error) {
    console.error("Error updating video card:", error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// Delete a Video Card
export async function deleteVideoCard(req, res) {
  try {
    const { id } = req.params;

    await VideoCardDAO.delete(id);

    res.status(200).json({
      success: true,
      message: "Video card deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting video card:", error);
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

    const videoCard = await VideoCardDAO.getById(id);

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
