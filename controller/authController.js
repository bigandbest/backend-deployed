import {
  uploadToCloudinary,
  deleteFromCloudinary,
} from "../services/uploadService.js";
import jwt from "jsonwebtoken";
import { setSessionCookie, clearSessionCookie } from "../utils/cookieUtils.js";
import UserDAO from "../dao/user.dao.js";
import AuthService from "../services/authService.js";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { sendOTP as sendOTPService, verifyOTP as verifyOTPService } from "../services/otpService.js";
import { registerFCMToken, sendToUser } from "../services/fcmService.js";
import { NotificationTemplates } from "../notifications/templates.js";
import { RedisKeys, RedisTTL } from "../config/redis-keys.js";
import { checkRateLimit } from "../utils/redisHelpers.js";

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
    // Upload to Cloudinary
    const uploadResult = await uploadToCloudinary(
      file.buffer,
      "avatars",
      file.mimetype,
    );

    if (!uploadResult.success) {
      return res.status(500).json({ error: "Failed to upload image" });
    }

    const publicUrl = uploadResult.secure_url;

    /* Public URL already obtained from Cloudinary response */

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
    // Get user to find avatar filename using DAO
    const user = await UserDAO.getUserById(userId);
    if (user && user.avatar) {
      // Extract public_id from Cloudinary URL if possible, or just skip delete if we don't store public_id
      // Assuming naive approach: just nullify in DB for now as we don't strictly track public_id in User model yet
      // Ideally we should extract public_id from URL:
      // URL: https://res.cloudinary.com/demo/image/upload/v1234567890/avatars/filename.jpg
      const urlParts = user.avatar.split("/");
      const publicIdWithExt = urlParts
        .slice(urlParts.indexOf("avatars"))
        .join("/");
      const publicId = publicIdWithExt.split(".")[0];

      await deleteFromCloudinary(publicId);
    }

    // Update user record to remove avatar using DAO
    const updatedUser = await UserDAO.updateUser(userId, { avatar: null });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/** Normalize phone to 91XXXXXXXXXX (no + prefix) */
function normalizePhone(phone) {
  let p = phone.toString().replace(/[\s\-\+]/g, '');
  if (p.startsWith('91') && p.length === 12) return p;
  if (p.length === 10 && /^[6-9]/.test(p)) return '91' + p;
  return null;
}

// MessageBot OTP Functions
export const sendOTP = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, message: "Phone number is required" });
    }

    const normalized = normalizePhone(phone);
    if (!normalized) {
      return res.status(400).json({ success: false, message: "Invalid Indian mobile number" });
    }

    // IP rate limit: 10 req/min
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const ipLimit = await checkRateLimit(RedisKeys.rateLimitIp(ip), 10, RedisTTL.RATE_LIMIT_IP);
    if (!ipLimit.allowed) {
      return res.status(429).json({ success: false, message: "Too many requests", retry_after: ipLimit.retryAfter });
    }

    const { referenceId } = await sendOTPService(normalized);

    return res.json({
      success: true,
      message: "OTP sent successfully",
      expires_in: parseInt(process.env.OTP_EXPIRY_SECONDS || '600'),
      reference_id: referenceId,
    });
  } catch (err) {
    console.error("Send OTP Error:", err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message,
      code: err.code,
      ...(err.retryAfter ? { retry_after: err.retryAfter } : {}),
    });
  }
};

export const verifyOTP = async (req, res) => {
  try {
    const { phone, otp, fcm_token, device } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({ success: false, message: "Phone number and OTP are required" });
    }

    const normalized = normalizePhone(phone);
    if (!normalized) {
      return res.status(400).json({ success: false, message: "Invalid Indian mobile number" });
    }

    const result = await verifyOTPService(normalized, otp.toString());

    if (result === 'expired') {
      return res.status(400).json({ success: false, message: "OTP expired", code: "OTP_EXPIRED" });
    }
    if (result === 'locked') {
      return res.status(429).json({ success: false, message: "Too many attempts. Locked for 30 minutes.", code: "TOO_MANY_ATTEMPTS", retry_after: 1800 });
    }
    if (result === 'invalid') {
      return res.status(400).json({ success: false, message: "Invalid OTP", code: "INVALID_OTP" });
    }

    // OTP valid — upsert user
    const authResult = await AuthService.loginOrSignupWithOTP('+' + normalized);

    // Register FCM token if provided
    if (fcm_token && authResult.user?.id) {
      await registerFCMToken(authResult.user.id, fcm_token, device || 'unknown').catch(() => {});
      // Notify other devices about new login
      await sendToUser(
        authResult.user.id,
        NotificationTemplates.NEW_LOGIN(device || 'new device')
      ).catch(() => {});
    }

    return res.json({
      success: true,
      message: "OTP verified",
      is_new_user: authResult.isNewUser ?? false,
      user: authResult.user,
      token: authResult.token,
      refreshToken: authResult.refreshToken,
    });
  } catch (err) {
    console.error("Verify OTP Error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const registerFCMTokenHandler = async (req, res) => {
  try {
    const { token, device } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, message: "FCM token is required" });
    }
    await registerFCMToken(req.user.id, token, device || 'unknown');
    return res.json({ success: true });
  } catch (err) {
    console.error("Register FCM Token Error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Get all business users
 */
export const getBusinessUsers = async (req, res) => {
  try {
    const businessUsers = await UserDAO.getBusinessUsers();

    // Map phone to phone_no for frontend compatibility
    const formattedUsers = businessUsers.map((user) => ({
      ...user,
      phone_no: user.phone,
    }));

    res.json(formattedUsers);
  } catch (error) {
    console.error("Error fetching business users:", error);
    res.status(500).json({ error: "Failed to fetch business users" });
  }
};
