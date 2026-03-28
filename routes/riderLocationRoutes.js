import express from 'express';
import { authenticateToken } from '../middleware/authenticate.js';
import { goOnline, goOffline, getLocationStatus } from '../controller/riderLocationController.js';

const router = express.Router();

router.post('/go-online', authenticateToken, goOnline);
router.post('/go-offline', authenticateToken, goOffline);
router.get('/status', authenticateToken, getLocationStatus);

export default router;
