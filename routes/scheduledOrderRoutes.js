import express from "express";
import {
    createScheduledOrder,
    getUserScheduledOrders,
    getScheduledOrderById,
    updateScheduledOrder,
    cancelScheduledOrder,
    getAllScheduledOrders,
    manuallyExecuteOrder
} from "../controller/scheduledOrderController.js";
import { authenticateToken, authenticateAdmin } from "../middleware/authenticate.js";

const router = express.Router();

// User routes (protected with JWT authentication)
router.post("/", authenticateToken, createScheduledOrder);
router.get("/", authenticateToken, getUserScheduledOrders);
router.get("/:id", authenticateToken, getScheduledOrderById);
router.put("/:id", authenticateToken, updateScheduledOrder);
router.delete("/:id", authenticateToken, cancelScheduledOrder);

// Admin routes (protected with admin authentication)
router.get("/admin/all", authenticateAdmin, getAllScheduledOrders);
router.post("/admin/:id/execute", authenticateAdmin, manuallyExecuteOrder);

export default router;
