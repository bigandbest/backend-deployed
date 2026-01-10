import express from "express";
import {
    getChargeSettings,
    updateChargeSettings,
} from "../controller/chargeSettingsController.js";

const router = express.Router();

// Charge Settings Operations
router.get("/", getChargeSettings);
router.put("/", updateChargeSettings);

export default router;
