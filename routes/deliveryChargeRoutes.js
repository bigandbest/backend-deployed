import express from "express";
import {
    getAllMilestones,
    getMilestoneById,
    createMilestone,
    updateMilestone,
    deleteMilestone,
    toggleMilestoneActive,
    getApplicableCharge,
} from "../controller/deliveryChargeController.js";

const router = express.Router();

// Milestone CRUD Operations
router.get("/", getAllMilestones);
router.get("/:id", getMilestoneById);
router.post("/", createMilestone);
router.put("/:id", updateMilestone);
router.delete("/:id", deleteMilestone);
router.patch("/:id/toggle-active", toggleMilestoneActive);

// Calculate delivery charge for order value
router.post("/calculate", getApplicableCharge);

export default router;
