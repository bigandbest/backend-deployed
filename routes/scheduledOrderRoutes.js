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
import {
    createTimeSlot,
    updateTimeSlot,
    deleteTimeSlot,
    getAllTimeSlots,
    assignSlotToWarehouse,
    updateWarehouseSlotConfig,
    removeSlotFromWarehouse,
    getWarehouseSlots,
    getAvailableSlotsForWarehouse,
    getSlotAvailability
} from "../controller/schedulingController.js";
import { authenticateToken, authenticateAdmin } from "../middleware/authenticate.js";

const router = express.Router();

// User routes (protected with JWT authentication)
router.post("/", authenticateToken, createScheduledOrder);
router.get("/", authenticateToken, getUserScheduledOrders);
router.get("/:id", authenticateToken, getScheduledOrderById);
router.put("/:id", authenticateToken, updateScheduledOrder);
router.delete("/:id", authenticateToken, cancelScheduledOrder);

// User routes for scheduling slots
router.get("/available-slots/:warehouseId", authenticateToken, getAvailableSlotsForWarehouse);
router.get("/slot-availability", authenticateToken, getSlotAvailability);

// Admin routes (protected with admin authentication)
router.get("/admin/all", authenticateAdmin, getAllScheduledOrders);
router.post("/admin/:id/execute", authenticateAdmin, manuallyExecuteOrder);

// Admin routes for time slot management
router.post("/admin/slots", authenticateAdmin, createTimeSlot);
router.put("/admin/slots/:id", authenticateAdmin, updateTimeSlot);
router.delete("/admin/slots/:id", authenticateAdmin, deleteTimeSlot);
router.get("/admin/slots", authenticateAdmin, getAllTimeSlots);

// Admin routes for warehouse slot configuration
router.post("/admin/warehouse-slots", authenticateAdmin, assignSlotToWarehouse);
router.put("/admin/warehouse-slots/:id", authenticateAdmin, updateWarehouseSlotConfig);
router.delete("/admin/warehouse-slots/:id", authenticateAdmin, removeSlotFromWarehouse);
router.get("/admin/warehouse/:warehouseId/slots", authenticateAdmin, getWarehouseSlots);

export default router;

