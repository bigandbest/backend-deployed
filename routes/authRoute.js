import express from "express";
import {
  signup,
  login,
  logout,
  getMe,
  uploadAvatar,
  updateUserAvatar,
  removeUserAvatar,
  sendOTP,
  verifyOTP,
  getBusinessUsers,
  registerFCMTokenHandler,
} from "../controller/authController.js";
import authenticate from "../middleware/authenticate.js";

const router = express.Router();

router.post("/signup", signup);
router.post("/login", login);
router.post("/logout", logout);
router.get("/me", authenticate, getMe);
router.post("/upload-avatar", authenticate, uploadAvatar, updateUserAvatar);
router.delete("/remove-avatar", authenticate, removeUserAvatar);
router.get("/business-users", getBusinessUsers);

// OTP Routes (MessageBot)
router.post("/send-otp", sendOTP);
router.post("/verify-otp", verifyOTP);

// FCM Push Notification Token
router.post("/register-fcm-token", authenticate, registerFCMTokenHandler);

export default router;
