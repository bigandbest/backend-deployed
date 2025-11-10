import express from 'express';
import { getBulkProducts, updateBulkSettings, getProductBulkSettings, getVariantBulkSettings } from '../controller/bulkProductController.js';

const router = express.Router();

router.get('/products', getBulkProducts);
router.get('/product/:product_id', getProductBulkSettings);
router.put('/settings/:product_id', updateBulkSettings);
router.get('/variant/:variant_id', getVariantBulkSettings);

export default router;