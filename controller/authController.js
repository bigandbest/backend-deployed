import { supabase } from "../config/supabaseClient.js";
import jwt from "jsonwebtoken";
import { setSessionCookie, clearSessionCookie } from "../utils/cookieUtils.js";
import UserDAO from "../dao/user.dao.js";
import AuthService from "../services/authService.js";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { twilioClient } from "../utils/twilio.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * User signup with password-based authentication
 */
export const signup = async (req, res) => {
  try {
    const { email, password, name, phone } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "Email and password are required",
      });
    }

    // Create user with role USER by default
    const result = await AuthService.signup({
      email,
      password,
      name,
      phone,
      role: "USER",
    });

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      user: result.user,
      token: result.token,
      refreshToken: result.refreshToken,
    });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * User login with email and password
 */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "Email and password are required",
      });
    }

    // Authenticate user
    const result = await AuthService.login(email, password);

    res.json({
      success: true,
      message: "Logged in successfully",
      user: result.user,
      token: result.token,
      refreshToken: result.refreshToken,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(401).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Logout user
 */
export const logout = (req, res) => {
  clearSessionCookie(res);
  res.json({
    success: true,
    message: "Logged out successfully",
  });
};

/**
 * Get current user info
 */
export const getMe = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        error: "Not authenticated",
      });
    }

    const user = await AuthService.getUserById(req.user.id);

    res.json({
      success: true,
      user,
    });
  } catch (error) {
    console.error("GetMe error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// Multer configuration for avatar upload
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only JPEG, PNG, and WebP are allowed."));
    }
  },
});

export const uploadAvatar = upload.single("avatar");

export const updateUserAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const userId = req.user.id;
    const file = req.file;
    const fileName = `avatar_${userId}_${Date.now()}.${
      file.mimetype.split("/")[1]
    }`;

    // Upload to Supabase Storage (Storage usage is allowed/retained)
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (uploadError) {
      return res.status(500).json({ error: "Failed to upload image" });
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = supabase.storage.from("avatars").getPublicUrl(fileName);

    // Update user record using DAO
    const updatedUser = await UserDAO.updateUser(userId, { avatar: publicUrl });

    res.json({ success: true, avatarUrl: publicUrl, user: updatedUser });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const removeUserAvatar = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user to find avatar filename using DAO
    const user = await UserDAO.getUserById(userId);
    if (user && user.avatar) {
      const fileName = user.avatar.split("/").pop();
      // Remove from storage
      await supabase.storage.from("avatars").remove([fileName]);
    }

    // Update user record to remove avatar using DAO
    const updatedUser = await UserDAO.updateUser(userId, { avatar: null });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Twilio OTP Functions
export const sendOTP = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res
        .status(400)
        .json({ success: false, message: "Phone number is required" });
    }

    // Format phone number: Add +91 if not present
    const formattedPhone = phone.toString().startsWith("+")
      ? phone
      : `+91${phone}`;

    const response = await twilioClient.verify.v2
      .services(process.env.TWILIO_VERIFY_SID)
      .verifications.create({
        to: formattedPhone,
        channel: "sms",
      });

    res.json({
      success: true,
      message: "OTP sent successfully",
      status: response.status,
    });
  } catch (err) {
    console.error("Twilio Send OTP Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const verifyOTP = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res
        .status(400)
        .json({ success: false, message: "Phone number and OTP are required" });
    }

    // Format phone number: Add +91 if not present
    const formattedPhone = phone.toString().startsWith("+")
      ? phone
      : `+91${phone}`;

    const response = await twilioClient.verify.v2
      .services(process.env.TWILIO_VERIFY_SID)
      .verificationChecks.create({
        to: formattedPhone,
        code: otp,
      });

    if (response.status === "approved") {
      // User is verified
      return res.json({ success: true, message: "OTP verified" });
    }

    res.status(400).json({ success: false, message: "Invalid OTP" });
  } catch (err) {
    console.error("Twilio Verify OTP Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
