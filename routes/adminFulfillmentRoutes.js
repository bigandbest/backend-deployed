import { Router } from 'express';
import { authenticateToken } from '../middleware/authenticate.js';
import {
    listAdminSubOrders,
    getAdminSubOrderDetail,
    updateAdminSubOrderStatus,
    getAdminFulfillmentStats,
} from '../controller/adminFulfillmentController.js';

const router = Router();

router.use(authenticateToken);

router.get('/stats', getAdminFulfillmentStats);
router.get('/sub-orders', listAdminSubOrders);
router.get('/sub-orders/:id', getAdminSubOrderDetail);
router.patch('/sub-orders/:id/status', updateAdminSubOrderStatus);

export default router;
