import express from 'express';
import {
  exportPriceSheet,
  uploadAndEnqueue,
  getJobStatus,
  getJobResults,
} from '../controller/bulkPriceController.js';

const router = express.Router();

// GET /api/admin/products/bulk-price-export?category_id=&vertical=
router.get('/bulk-price-export', exportPriceSheet);

// POST /api/admin/products/bulk-price-update  (multipart: file)
router.post('/bulk-price-update', uploadAndEnqueue);

// GET /api/admin/products/bulk-price-update/:jobId
router.get('/bulk-price-update/:jobId', getJobStatus);

// GET /api/admin/products/bulk-price-update/:jobId/results
router.get('/bulk-price-update/:jobId/results', getJobResults);

export default router;
