import express from "express";
import { getDashboard } from "../controller/adminDashboardController.js";
import { authenticateToken } from "../middleware/authenticate.js";
import { requireAdmin } from "../middleware/authorize.js";

const router = express.Router();
router.use(authenticateToken, requireAdmin);
router.get("/", getDashboard);

export default router;
