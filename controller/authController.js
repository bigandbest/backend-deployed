import { supabase } from "../config/supabaseClient.js";
import jwt from "jsonwebtoken";
// import bcrypt from "bcrypt";
import { setSessionCookie, clearSessionCookie } from "../utils/cookieUtils.js";
import UserDAO from "../dao/user.dao.js";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { twilioClient } from "../utils/twilio.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Business User Logic - TEMPORARILY DISABLED due to missing table/schema
export const signup = async (req, res) => {
  // const {
  //   first_name,
  //   last_name,
  //   phone_no,
  //   email,
  //   pan,
  //   gstin,
  //   adhaar_no,
  //   business_type,
  // } = req.body;
  // let { password } = req.body;

  // password = await bcrypt.hash(password, 10);
  // const { data, error } = await supabase.from("business_users").insert([
  //   {
  //     first_name,
  //     last_name,
  //     phone_no,
  //     pan,
  //     gstin,
  //     adhaar_no,
  //     email,
  //     password,
  //     business_type,
  //   },
  // ]);

  // if (error) return res.status(400).json({ error: error.message });
  // res.status(201).json({ message: "Business user created" });
  res.status(503).json({ error: "Business user registration is temporarily disabled." });
};

export const login = async (req, res) => {
  // const { email, password, business_type } = req.body;

  // const { data, error } = await supabase
  //   .from("business_users")
  //   .select("*")
  //   .eq("email", email)
  //   .single();

  // if (error || !data)
  //   return res.status(400).json({ error: "Invalid credentials" });

  // const valid = await bcrypt.compare(password, data.password);
  // if (!valid) return res.status(401).json({ error: "Invalid password" });

  // const validBusinessType = data.business_type === business_type;
  // if (!validBusinessType)
  //   return res.status(403).json({ error: "Unauthorized business type" });

  // const token = jwt.sign({ id: data.id }, process.env.JWT_SECRET, {
  //   expiresIn: "7d",
  // });
  // setSessionCookie(res, token);

  // res.json({
  //   message: "Logged in",
  //   user: { id: data.id, username: data.username, email: data.email },
  // });
  res.status(503).json({ error: "Business user login is temporarily disabled." });
};

export const getAllBusinessUsers = async (req, res) => {
  // try {
  //   const { data, error } = await supabase.from("business_users").select("*");

  //   if (error) {
  //     return res.status(400).json({ error: error.message });
  //   }

  //   return res.status(200).json(data);
  // } catch (err) {
  //   return res.status(500).json({ error: "Internal server error" });
  // }
  res.status(503).json({ error: "Fetching business users is temporarily disabled." });
};

export const logout = (req, res) => {
  clearSessionCookie(res);
  res.json({ message: "Logged out" });
};

export const getMe = (req, res) => {
  res.json({ user: req.user });
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
    const fileName = `avatar_${userId}_${Date.now()}.${file.mimetype.split("/")[1]
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
