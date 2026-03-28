import express from 'express';
import { authenticateToken } from '../middleware/authenticate.js';
import {
    getAssignableOrders,
    acceptOrder,
    completeDelivery,
    getMyOrders,
    getOrderDetails,
    // Sub-order fulfillment
    getMySubOrders,
    markPickupComplete,
    markSubOrderDelivered,
} from '../controller/riderOrderController.js';

const router = express.Router();

// All rider order routes require authentication
router.get('/assignable', authenticateToken, getAssignableOrders);
router.post('/:orderId/accept', authenticateToken, acceptOrder);
router.post('/:orderId/complete', authenticateToken, completeDelivery);
router.get('/my-orders', authenticateToken, getMyOrders);
router.get('/:orderId/details', authenticateToken, getOrderDetails);

// Sub-order fulfillment routes (new)
router.get('/sub-orders', authenticateToken, getMySubOrders);
router.post('/:sub_order_id/pickup-complete', authenticateToken, markPickupComplete);
router.post('/:sub_order_id/delivered', authenticateToken, markSubOrderDelivered);

export default router;

