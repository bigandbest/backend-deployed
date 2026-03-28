// routes/internalReferralRoutes.js
// Internal routes called by order/delivery systems
import express from "express";
import {
  onUserRegistered,
  onOrderPlaced,
  onOrderDelivered,
  onOrderReturned,
  processReturnWindowExpired,
  cronProcessExpiredRewards,
  cronSendExpiryReminders,
  cronProcessReturnWindows,
} from "../controller/referralController.js";

const router = express.Router();

// Internal hooks (called by other services)
router.post("/user-registered", onUserRegistered);
router.post("/order-placed", onOrderPlaced);
router.post("/order-delivered", onOrderDelivered);
router.post("/order-returned", onOrderReturned);
router.post("/return-window-expired", processReturnWindowExpired);

// Cron endpoints
router.post("/process-expired-rewards", cronProcessExpiredRewards);
router.post("/send-expiry-reminders", cronSendExpiryReminders);
router.post("/process-return-windows", cronProcessReturnWindows);

export default router;
