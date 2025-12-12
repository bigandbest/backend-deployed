import express from "express";
import {
  createWalletOrder,
  getAllWalletOrders,
  getUserWalletOrders,
} from "../controller/walletOrderController.js";

const router = express.Router();

// Wallet Orders Routes

// Create wallet order (prepaid via wallet)
router.post("/create", createWalletOrder);

// Get all wallet orders (Admin)
router.get("/all", getAllWalletOrders);

// Get user's wallet orders
router.get("/user/:user_id", getUserWalletOrders);

export default router;
