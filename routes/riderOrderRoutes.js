import express from 'express';
import { authenticateToken } from '../middleware/authenticate.js';
import {
    getAssignableOrders,
    acceptOrder,
    completeDelivery,
    getMyOrders,
    getOrderDetails,
} from '../controller/riderOrderController.js';

const router = express.Router();

// All rider order routes require authentication
router.get('/assignable', authenticateToken, getAssignableOrders);
router.post('/:orderId/accept', authenticateToken, acceptOrder);
router.post('/:orderId/complete', authenticateToken, completeDelivery);
router.get('/my-orders', authenticateToken, getMyOrders);
router.get('/:orderId/details', authenticateToken, getOrderDetails);

export default router;
