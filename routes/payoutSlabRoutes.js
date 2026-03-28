import express from 'express';
import { authenticateToken } from '../middleware/authenticate.js';
import { requireAdmin } from '../middleware/authorize.js';
import {
    getSlabs,
    createSlab,
    updateSlab,
    deleteSlab,
    previewSlab,
    getSlabHistory,
    approvePayout,
    listAllPayouts,
} from '../controller/payoutSlabController.js';

const router = express.Router();
router.use(authenticateToken, requireAdmin);

// Slab management
router.get('/slabs', getSlabs);
router.post('/slabs', createSlab);
router.patch('/slabs/:id', updateSlab);
router.delete('/slabs/:id', deleteSlab);
router.get('/slabs/preview', previewSlab);
router.get('/slabs/history', getSlabHistory);

// Payout management
router.get('/payouts', listAllPayouts);
router.post('/payouts/:payoutId/approve', approvePayout);

export default router;
