// routes/membershipAdminRoutes.js — admin view of free membership (Release 1)
import express from "express";
import { getSummary, listPlans, updatePlan, listMembers, getMember } from "../controller/membershipAdminController.js";
import { authenticateToken } from "../middleware/authenticate.js";
import { requireAdmin } from "../middleware/authorize.js";

const router = express.Router();

router.use(authenticateToken, requireAdmin);

// Malformed ids would otherwise reach Prisma and surface as a 500.
router.param("id", (req, res, next, id) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? next() : res.status(400).json({ success: false, error: "Invalid id" }));

router.get("/summary", getSummary);
router.get("/plans", listPlans);
router.put("/plans/:id", updatePlan);
router.get("/members", listMembers);
router.get("/members/:id", getMember);

export default router;
