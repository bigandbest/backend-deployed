import express from 'express';
import { getProductVariants } from '../controller/productController.js';

const router = express.Router();

// Get product variants by product ID
router.get('/product/:productId/variants', getProductVariants);

export default router;
