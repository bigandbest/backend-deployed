import { Router } from 'express';
import {
    getProductAvailability,
    validateCart,
    getOrderWithSubOrders,
    handleZonalCallback,
} from '../controller/fulfillmentController.js';
import { authenticateToken } from '../middleware/authenticate.js';

const router = Router();

// Public — availability check (no auth needed)
router.get('/products/:id/availability', getProductAvailability);

// Authenticated — cart validation
router.post('/cart/validate', authenticateToken, validateCart);

// Authenticated — order with sub-orders
router.get('/orders/:id/fulfillment', authenticateToken, getOrderWithSubOrders);


// Webhook — zonal warehouse delivery callback (should be protected by API key in prod)
router.post('/webhooks/zonal-delivery', handleZonalCallback);

export default router;
