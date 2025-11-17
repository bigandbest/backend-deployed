import express from "express";
import {
  adminLogin,
  adminLogout,
  getAdminMe,
} from "../controller/adminAuthController.js";
import { authenticateToken } from "../middleware/authenticate.js";

const router = express.Router();

router.post("/login", adminLogin);
router.post("/logout", adminLogout);
router.get("/me", authenticateToken, getAdminMe);

export default router;
