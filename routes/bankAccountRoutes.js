import express from 'express';
import { authenticateToken } from '../middleware/authenticate.js';
import {
    getBankAccount,
    saveBankAccount,
    getAllBankAccounts,
    getRiderBankAccount,
    getAdminProfileContact,
} from '../controller/bankAccountController.js';

const router = express.Router();

// Admin routes
router.get('/admin/bank-account', authenticateToken, getBankAccount);
router.post('/admin/bank-account', authenticateToken, saveBankAccount);
router.get('/admin/bank-account/all', authenticateToken, getAllBankAccounts);

// Rider routes
router.get('/rider/cod/bank-account', authenticateToken, getRiderBankAccount);
router.get('/rider/admin-contact', authenticateToken, getAdminProfileContact);

export default router;
