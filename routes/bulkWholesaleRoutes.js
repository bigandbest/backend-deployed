import express from 'express';
import { getBulkWholesaleSettings, saveBulkWholesaleSettings, getAllProductsWithBulkSettings } from '../controller/bulkWholesaleController.js';

const router = express.Router();

// Get bulk wholesale settings for a product
router.get('/:productId', getBulkWholesaleSettings);

// Get all products with bulk settings
router.get('/products/all', getAllProductsWithBulkSettings);

// Save bulk wholesale settings
router.post('/save', saveBulkWholesaleSettings);

export default router;