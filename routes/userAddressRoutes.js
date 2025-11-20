import express from "express";
import {
  getUserAddresses,
  getAddressById,
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
  getDefaultAddress,
} from "../controller/userAddressController.js";
import { authenticateToken } from "../middleware/authenticate.js";

const router = express.Router();

// Get all addresses for logged-in user
router.get("/", authenticateToken, getUserAddresses);

// Get default address
router.get("/default", authenticateToken, getDefaultAddress);

// Get a specific address by ID
router.get("/:id", authenticateToken, getAddressById);

// Create a new address
router.post("/", authenticateToken, createAddress);

// Update an address
router.put("/:id", authenticateToken, updateAddress);

// Delete an address (soft delete)
router.delete("/:id", authenticateToken, deleteAddress);

// Set an address as default
router.patch("/:id/set-default", authenticateToken, setDefaultAddress);

export default router;
