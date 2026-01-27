import express from "express";
import {
    getUsers,
    createUser,
    updateUser,
    deleteUser,
    toggleUserStatus,
} from "../controller/adminUserController.js";
import { authenticateToken } from "../middleware/authenticate.js";

const router = express.Router();

// Admin User Management Routes
router.get("/", getUsers);
router.post("/", createUser);
router.put("/:userId", updateUser);
router.delete("/:userId", deleteUser);
router.patch("/:userId/status", toggleUserStatus);

export default router;
