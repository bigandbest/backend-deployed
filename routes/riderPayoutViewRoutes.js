import express from 'express';
import { authenticateToken } from '../middleware/authenticate.js';
import {
    getMyPayouts,
    getPayoutSummary,
    getPayoutDetail,
    raiseDispute,
} from '../controller/riderPayoutViewController.js';

const router = express.Router();
router.use(authenticateToken);

router.get('/', getMyPayouts);
router.get('/summary', getPayoutSummary);
router.get('/:id', getPayoutDetail);
router.post('/:id/dispute', raiseDispute);

export default router;
