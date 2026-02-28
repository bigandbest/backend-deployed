import express from 'express';
import { authenticateToken } from '../middleware/authenticate.js';
import { requireAdmin } from '../middleware/authorize.js';
import {
    getSellerProductRequests,
    approveSellerProduct,
    rejectSellerProduct,
    getWithdrawalRequests,
    updateWithdrawalStatus,
    getUnallocatedSellers,
    allocateSellerWarehouse,
    getPincodeRequests,
    approvePincodeRequest,
    rejectPincodeRequest
} from '../controller/adminSellerController.js';

const router = express.Router();

// Require admin authentication for all routes
router.use(authenticateToken, requireAdmin);

// Seller Product Requests
router.get('/products/requests', getSellerProductRequests);
router.post('/products/requests/:id/approve', approveSellerProduct);
router.post('/products/requests/:id/reject', rejectSellerProduct);

// Seller Wallet Withdrawals
router.get('/withdrawals', getWithdrawalRequests);
router.post('/withdrawals/:id/status', updateWithdrawalStatus); // Status in body (COMPLETED/FAILED)
// Seller Verification and Warehouse Allocation
router.get('/unallocated', getUnallocatedSellers);
router.post('/:id/allocate', allocateSellerWarehouse);

// Seller Pincode Requests
router.get('/pincode-requests', getPincodeRequests);
router.post('/pincode-requests/:id/approve', approvePincodeRequest);
router.post('/pincode-requests/:id/reject', rejectPincodeRequest);

export default router;
