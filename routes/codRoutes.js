import express from 'express';
import { authenticateToken } from '../middleware/authenticate.js';
import { requireAdmin } from '../middleware/authorize.js';
import {
    listCodCollections,
    approveCodDeposit,
    rejectCodDeposit,
    riderClaimDeposit,
    getRiderPendingCod,
} from '../controller/codController.js';
import {
    getBankAccount,
    saveBankAccount,
    getAllBankAccounts,
    getRiderBankAccount,
} from '../controller/bankAccountController.js';

const router = express.Router();

// ── Admin routes ──────────────────────────────────────────
router.get('/admin/cod-collections', authenticateToken, requireAdmin, listCodCollections);
router.post('/admin/cod-collections/:id/approve', authenticateToken, requireAdmin, approveCodDeposit);
router.post('/admin/cod-collections/:id/reject', authenticateToken, requireAdmin, rejectCodDeposit);

// ── Rider routes ──────────────────────────────────────────
router.get('/rider/cod/pending', authenticateToken, getRiderPendingCod);
router.post('/rider/cod/:orderId/claim-deposit', authenticateToken, riderClaimDeposit);
router.get('/rider/cod/bank-account', authenticateToken, getRiderBankAccount);

// ── Bank Account routes (Admin) ───────────────────────────
router.get('/admin/bank-account', authenticateToken, requireAdmin, getBankAccount);
router.post('/admin/bank-account', authenticateToken, requireAdmin, saveBankAccount);
router.get('/admin/bank-account/all', authenticateToken, requireAdmin, getAllBankAccounts);

export default router;
