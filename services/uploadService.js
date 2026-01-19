import cloudinary from "../config/cloudinary.js";
import { v4 as uuidv4 } from "uuid";

/**
 * Upload a file to Cloudinary
 * @param {Buffer} fileBuffer - The file buffer to upload
 * @param {string} folder - The folder to upload to (default: 'uploads')
 * @param {string} mimeType - The mime type of the file
 * @returns {Promise<{success: boolean, secure_url: string, public_id: string, error?: any}>}
 */
export const uploadToCloudinary = async (
  fileBuffer,
  folder = "uploads",
  mimeType,
) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        resource_type: "auto",
        timeout: 120000, // 120 seconds timeout to prevent 499 errors
      },
      (error, result) => {
        if (error) {
          console.error("Cloudinary upload error:", error);
          resolve({
            success: false,
            error: error.message || "Cloudinary upload failed",
          });
        } else {
          resolve({
            success: true,
            secure_url: result.secure_url,
            public_id: result.public_id,
          });
        }
      },
    );

    // Handle stream errors to prevent unhandled rejections
    uploadStream.on("error", (error) => {
      console.error("Cloudinary stream error:", error);
      resolve({
        success: false,
        error: "Stream error: " + error.message,
      });
    });

    try {
      uploadStream.end(fileBuffer);
    } catch (err) {
      console.error("Error writing to upload stream:", err);
      resolve({
        success: false,
        error: "Stream write error: " + err.message,
      });
    }
  });
};

/**
 * Delete a file from Cloudinary
 * @param {string} publicId - The public ID of the file to delete
 * @returns {Promise<{success: boolean, error?: any}>}
 */
export const deleteFromCloudinary = async (publicId) => {
  try {
    if (!publicId) return { success: false, error: "No public ID provided" };

    const result = await cloudinary.uploader.destroy(publicId);
    if (result.result === "ok") {
      return { success: true };
    } else {
      return { success: false, error: result };
    }
  } catch (error) {
    console.error("Cloudinary delete error:", error);
    return { success: false, error: error.message };
  }
};
