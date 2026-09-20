import express from 'express';
import {
  exportPriceSheet,
  uploadAndEnqueue,
  getJobStatus,
  getJobResults,
} from '../controller/bulkPriceController.js';
import { authenticateToken } from '../middleware/authenticate.js';
import { requireAdmin } from '../middleware/authorize.js';

const router = express.Router();

// GET /api/admin/products/bulk-price-export?category_id=&vertical=
router.get('/bulk-price-export', authenticateToken, requireAdmin, exportPriceSheet);

// POST /api/admin/products/bulk-price-update  (multipart: file)
router.post('/bulk-price-update', authenticateToken, requireAdmin, uploadAndEnqueue);

// GET /api/admin/products/bulk-price-update/:jobId
router.get('/bulk-price-update/:jobId', authenticateToken, requireAdmin, getJobStatus);

// GET /api/admin/products/bulk-price-update/:jobId/results
router.get('/bulk-price-update/:jobId/results', authenticateToken, requireAdmin, getJobResults);

export default router;
