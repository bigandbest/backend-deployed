import express from "express";
import { createOnlinePaymentOrder } from "../controller/onlinePaymentOrderController.js";

const router = express.Router();

// Create online payment order (Razorpay, etc.)
router.post("/create", createOnlinePaymentOrder);

export default router;
