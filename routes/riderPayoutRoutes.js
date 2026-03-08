import express from 'express';
import { authenticateToken } from '../middleware/authenticate.js';
import { requireAdmin } from '../middleware/authorize.js';
import {
    createMilestone,
    getMilestones,
    updateMilestone,
    deleteMilestone,
} from '../controller/riderPayoutController.js';

const router = express.Router();

// Apply admin authentication to all routes
router.use(authenticateToken);
router.use(requireAdmin);

router.post('/', createMilestone);
router.get('/', getMilestones);
router.put('/:id', updateMilestone);
router.delete('/:id', deleteMilestone);

export default router;
