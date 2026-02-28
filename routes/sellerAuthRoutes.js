import express from 'express';
import { authenticateToken } from '../middleware/authenticate.js';
import {
    registerSeller,
    loginSeller,
    getSellerMe,
    logoutSeller,
    verifySellerToken,
    updateSellerProfile,
    updateSellerKyc,
    updateSellerBankDetails,
} from '../controller/sellerAuthController.js';

const router = express.Router();

// Public routes
router.post('/register', registerSeller);
router.post('/login', loginSeller);
router.post('/verify-token', verifySellerToken);

// Protected routes
router.get('/me', authenticateToken, getSellerMe);
router.put('/profile', authenticateToken, updateSellerProfile);
router.put('/kyc', authenticateToken, updateSellerKyc);
router.put('/bank', authenticateToken, updateSellerBankDetails);
router.post('/logout', logoutSeller);

export default router;
