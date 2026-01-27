import { uploadToCloudinary } from "../services/uploadService.js";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 1, // Only 1 file at a time
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG, PNG, and WebP images are allowed"), false);
    }
  },
});

// Upload image to Cloudinary
export const uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image file provided",
      });
    }

    const file = req.file;

    // Validate file size (additional check)
    if (file.size > 5 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: "File size too large. Maximum 5MB allowed.",
      });
    }

    console.log("Uploading file to Cloudinary:", file.originalname);

    // Upload to Cloudinary using the service
    const result = await uploadToCloudinary(
      file.buffer,
      "product-images", // Using 'product-images' folder in Cloudinary
      file.mimetype,
    );

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: "Failed to upload image to Cloudinary",
        error: result.error,
      });
    }

    res.status(200).json({
      success: true,
      message: "Image uploaded successfully",
      imageUrl: result.secure_url,
      fileName: result.public_id, // Using public_id as fileName
      fileSize: file.size,
    });
  } catch (error) {
    console.error("Upload controller error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during upload",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

export const uploadMiddleware = upload.single("image");
