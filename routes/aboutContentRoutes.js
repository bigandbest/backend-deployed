import express from "express";
import multer from "multer";
import { getAboutContent, updateAboutContent } from "../controller/aboutContentController.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get("/", getAboutContent);
router.post("/", upload.single("image"), updateAboutContent); // POST handles create/update

export default router;
