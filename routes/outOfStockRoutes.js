import { Router } from 'express';
import {
  submitEnquiry,
  registerNotify,
  unregisterNotify,
  getNotifyStatus,
  getEnquiries,
  getNotifyRequests,
} from '../controller/outOfStockController.js';
import { authenticateToken } from '../middleware/authenticate.js';
import { requireAdmin } from '../middleware/authorize.js';

const router = Router();

// User-facing routes
router.post('/enquiry', submitEnquiry);
router.post('/notify', registerNotify);
router.delete('/notify', unregisterNotify);
router.get('/notify-status', getNotifyStatus);

// /enquiries: admin sees all, a signed-in customer sees only their own (the mobile app uses this)
router.get('/enquiries', authenticateToken, getEnquiries);
// Admin only
router.get('/notify-requests', authenticateToken, requireAdmin, getNotifyRequests);

export default router;
