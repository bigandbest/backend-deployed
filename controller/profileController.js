import { v2 as cloudinary } from "cloudinary";
import multer from "multer";
import userDao from "../dao/user.dao.js";

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Please upload only image files"), false);
    }
  },
});

export const uploadProfileImage = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "User not authenticated",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No image file provided",
      });
    }

    // Delete old image from Cloudinary if it exists
    const existingUser = await userDao.getUserById(userId);
    if (existingUser?.photo_url) {
      try {
        // Extract public_id from Cloudinary URL (last path segment without extension)
        const urlParts = existingUser.photo_url.split("/");
        const fileWithExt = urlParts[urlParts.length - 1];
        const folder = urlParts[urlParts.length - 2];
        const publicId = `${folder}/${fileWithExt.split(".")[0]}`;
        await cloudinary.uploader.destroy(publicId);
      } catch (deleteError) {
        console.error("Failed to delete old Cloudinary image:", deleteError);
      }
    }

    // Upload new image to Cloudinary from buffer
    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: "profile-images",
          public_id: `profile_${userId}_${Date.now()}`,
          overwrite: true,
          resource_type: "image",
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      stream.end(req.file.buffer);
    });

    const imageUrl = uploadResult.secure_url;

    // Update user profile with new image URL
    const data = await userDao.updateUser(userId, {
      photo_url: imageUrl,
      avatar: imageUrl,
    });

    res.json({
      success: true,
      message: "Profile image uploaded successfully",
      imageUrl: imageUrl,
      user: data,
    });
  } catch (error) {
    console.error("Profile image upload error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to upload profile image",
    });
  }
};

export const deleteProfileImage = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "User not authenticated",
      });
    }

    // Get current user data to find the image URL
    const userData = await userDao.getUserById(userId);

    if (!userData) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Delete from Cloudinary if image exists
    if (userData?.photo_url) {
      try {
        const urlParts = userData.photo_url.split("/");
        const fileWithExt = urlParts[urlParts.length - 1];
        const folder = urlParts[urlParts.length - 2];
        const publicId = `${folder}/${fileWithExt.split(".")[0]}`;
        await cloudinary.uploader.destroy(publicId);
      } catch (storageError) {
        console.error("Cloudinary deletion error:", storageError);
      }
    }

    // Update user profile to remove image URL
    const data = await userDao.updateUser(userId, {
      photo_url: null,
      avatar: null,
    });

    res.json({
      success: true,
      message: "Profile image deleted successfully",
      user: data,
    });
  } catch (error) {
    console.error("Profile image deletion error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to delete profile image",
    });
  }
};

export const getUserProfile = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "User not authenticated",
      });
    }

    let data = await userDao.getUserById(userId);

    // If user doesn't exist in database, create them
    if (!data) {
      console.log("Creating user record in users table for:", userId);
      try {
        data = await userDao.createUser({
          id: userId,
          email: req.user.email || null,
          name: req.user.name || req.user.user_metadata?.name || null,
          phone: req.user.phone || req.user.user_metadata?.phone || null,
          role: req.user.role === "authenticated" ? "USER" : req.user.role?.toUpperCase() || "USER",
          is_active: true,
        });
      } catch (createError) {
        console.error("Error creating user record:", createError);
        // If creation fails, return a basic user object
        return res.json({
          success: true,
          user: {
            id: userId,
            email: req.user.email || null,
            name: req.user.name || req.user.user_metadata?.name || null,
            phone: req.user.phone || req.user.user_metadata?.phone || null,
            role: "USER",
          },
        });
      }
    }

    res.json({
      success: true,
      user: data,
    });
  } catch (error) {
    console.error("Get user profile error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch user profile",
    });
  }
};

export const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "User not authenticated",
      });
    }

    const { name, phone, first_name, last_name, email } = req.body;

    if (email !== undefined) {
      const normalizedEmail = String(email).trim().toLowerCase();
      const isValidEmail =
        normalizedEmail === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
      if (!isValidEmail) {
        return res.status(400).json({
          success: false,
          error: "Please provide a valid email address",
        });
      }
    }

    // Build update object with only provided fields
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (first_name !== undefined) updateData.first_name = first_name;
    if (last_name !== undefined) updateData.last_name = last_name;
    if (email !== undefined) {
      const normalizedEmail = String(email).trim().toLowerCase();
      updateData.email = normalizedEmail || null;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        error: "No fields to update",
      });
    }

    const data = await userDao.updateUser(userId, updateData);

    res.json({
      success: true,
      message: "Profile updated successfully",
      user: data,
    });
  } catch (error) {
    console.error("Update user profile error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to update profile",
    });
  }
};

// Export multer middleware with error handling
export const uploadMiddleware = (req, res, next) => {
  upload.single("profileImage")(req, res, (err) => {
    if (err) {
      console.error("Multer error:", err);
      return res.status(400).json({
        success: false,
        error: err.message || "File upload error",
      });
    }
    next();
  });
};
