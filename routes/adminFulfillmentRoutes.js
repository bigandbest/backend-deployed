import { Router } from 'express';
import { authenticateToken } from '../middleware/authenticate.js';
import {
    listAdminSubOrders,
    getAdminSubOrderDetail,
    updateAdminSubOrderStatus,
    acceptAdminSubOrder,
    verifyOtpAndDeliver,
    getAdminFulfillmentStats,
    reportStockMismatch,
} from '../controller/adminFulfillmentController.js';

const router = Router();

router.use(authenticateToken);

router.get('/stats', getAdminFulfillmentStats);
router.get('/sub-orders', listAdminSubOrders);
router.get('/sub-orders/:id', getAdminSubOrderDetail);
router.post('/sub-orders/:id/accept', acceptAdminSubOrder);
router.post('/sub-orders/:id/verify-otp', verifyOtpAndDeliver);
router.patch('/sub-orders/:id/status', updateAdminSubOrderStatus);
router.post('/sub-orders/:id/stock-mismatch', reportStockMismatch);

export default router;
