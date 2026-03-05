import express from 'express';
import { authenticateToken } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import {
    getPendingRiders,
    reviewDocument,
    allocateRiderWarehouse,
    reassignRiderWarehouse,
} from '../controller/riderAdminController.js';

const router = express.Router();

const requireAdmin = requireRole('ADMIN');

// Admin rider management routes
router.get('/pending', authenticateToken, requireAdmin, getPendingRiders);
router.put('/documents/:id/review', authenticateToken, requireAdmin, reviewDocument);
router.post('/:riderId/allocate', authenticateToken, requireAdmin, allocateRiderWarehouse);
router.put('/:riderId/reassign', authenticateToken, requireAdmin, reassignRiderWarehouse);

export default router;
