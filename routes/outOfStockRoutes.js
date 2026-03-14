import { Router } from 'express';
import {
  submitEnquiry,
  registerNotify,
  unregisterNotify,
  getNotifyStatus,
  getEnquiries,
  getNotifyRequests,
} from '../controller/outOfStockController.js';

const router = Router();

// User-facing routes
router.post('/enquiry', submitEnquiry);
router.post('/notify', registerNotify);
router.delete('/notify', unregisterNotify);
router.get('/notify-status', getNotifyStatus);

// Admin routes
router.get('/enquiries', getEnquiries);
router.get('/notify-requests', getNotifyRequests);

export default router;
