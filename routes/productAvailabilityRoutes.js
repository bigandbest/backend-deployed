import express from "express";
import {
  checkProductAvailability,
  checkCartAvailability,
  autoTransferInventory,
  monitorAndAutoTransfer,
} from "../controller/productAvailabilityController.js";

const router = express.Router();

// Check single product availability for a pincode
router.get("/check", checkProductAvailability);

// Check cart availability for a pincode
router.post("/check-cart", checkCartAvailability);

// Manual inventory transfer from zonal to division warehouse
router.post("/transfer", autoTransferInventory);

// Monitor and auto-transfer low stock items (can be called by cron job)
router.post("/monitor-transfer", monitorAndAutoTransfer);

export default router;
