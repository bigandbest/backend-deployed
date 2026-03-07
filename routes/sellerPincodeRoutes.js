import express from 'express';
import * as sellerPincodeController from '../controller/sellerPincodeController.js';
import { authenticateToken } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';

const router = express.Router();

// Seller Endpoints
router.post('/request', authenticateToken, requireRole('SELLER'), sellerPincodeController.requestPincode);
router.get('/my-requests', authenticateToken, requireRole('SELLER'), sellerPincodeController.getMyRequests);

// Admin Endpoints
router.get('/admin/pending', authenticateToken, requireRole('ADMIN'), sellerPincodeController.getPendingRequests);
router.post('/admin/approve/:id', authenticateToken, requireRole('ADMIN'), sellerPincodeController.approveRequest);
router.post('/admin/reject/:id', authenticateToken, requireRole('ADMIN'), sellerPincodeController.rejectRequest);

export default router;
