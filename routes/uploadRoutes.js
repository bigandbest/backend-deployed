import express from "express";
import {
  uploadImage,
  uploadMiddleware,
} from "../controller/uploadController.js";
import { authenticateToken } from "../middleware/authenticate.js";

const router = express.Router();

// Upload image endpoint
router.post(
  "/image",
  authenticateToken,
  uploadMiddleware,
  uploadImage
);

export default router;
