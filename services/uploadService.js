import cloudinary from "../config/cloudinary.js";

/**
 * Extract the Cloudinary public_id from a secure_url.
 * e.g. "https://res.cloudinary.com/demo/image/upload/v123/brand/abc.jpg"
 *  → "brand/abc"
 */
const extractPublicId = (url) => {
  if (!url || !url.includes("cloudinary.com")) return null;
  try {
    // Remove query string
    const cleanUrl = url.split("?")[0];
    // Everything after /upload/ (and optional version segment like v1234567890/)
    const match = cleanUrl.match(/\/upload\/(?:v\d+\/)?(.+)$/);
    if (!match) return null;
    // Strip file extension
    return match[1].replace(/\.[^/.]+$/, "");
  } catch {
    return null;
  }
};

/**
 * Upload a file to Cloudinary.
 * If `oldImageUrl` is provided, the previous Cloudinary asset is deleted first
 * so it doesn't accumulate orphaned files.
 *
 * @param {Buffer} fileBuffer
 * @param {string} folder           - Cloudinary folder (default: 'uploads')
 * @param {string} mimeType
 * @param {string} [oldImageUrl]    - Existing image URL to delete before upload
 * @returns {Promise<{success: boolean, secure_url?: string, public_id?: string, error?: any}>}
 */
export const uploadToCloudinary = async (
  fileBuffer,
  folder = "uploads",
  mimeType,
  oldImageUrl = null,
) => {
  // Delete old image from Cloudinary if one exists
  if (oldImageUrl) {
    const oldPublicId = extractPublicId(oldImageUrl);
    if (oldPublicId) {
      try {
        await cloudinary.uploader.destroy(oldPublicId);
        console.log(`🗑️  Deleted old Cloudinary asset: ${oldPublicId}`);
      } catch (err) {
        // Non-fatal — log and continue with the upload
        console.warn(`⚠️  Could not delete old Cloudinary asset (${oldPublicId}):`, err.message);
      }
    }
  }

  return new Promise((resolve) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        resource_type: "auto",
        timeout: 120000,
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
 * Delete a file from Cloudinary by public_id.
 * @param {string} publicId
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
